// SQLite storage for accounts, sessions, credits, payments and admin settings.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'manator.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    credits INTEGER NOT NULL DEFAULT 0,
    pro_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ad_views (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    claimed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS ai_requests (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    charged INTEGER NOT NULL,
    retried INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    days INTEGER NOT NULL,
    gateway TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    paid_at INTEGER,
    gateway_ref TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const DEFAULT_SETTINGS = {
  welcomeCredits: 3,
  adCredits: 1,
  adsPerDay: 5,
  adSeconds: 15,
  prices: {
    monthly: { label: 'Monthly', amount: 149, days: 30 },
    yearly: { label: 'Yearly', amount: 1199, days: 365 },
  },
  gateway: 'test',
  sslcommerz: { storeId: '', storePass: '', sandbox: true },
  ai: { order: ['gemini', 'groq', 'openrouter'], keys: { gemini: '', groq: '', openrouter: '' } },
};
const SECRET_PATHS = [['sslcommerz', 'storePass'], ['ai', 'keys', 'gemini'], ['ai', 'keys', 'groq'], ['ai', 'keys', 'openrouter']];

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(base)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}

function getSettings() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app');
  let saved = {};
  try { saved = row ? JSON.parse(row.value) : {}; } catch (e) { /* defaults */ }
  const s = merge(structuredClone(DEFAULT_SETTINGS), saved);
  // Environment variables win over settings saved in the database.
  for (const p of ['gemini', 'groq', 'openrouter']) {
    const env = process.env[`${p.toUpperCase()}_API_KEY`];
    if (env) s.ai.keys[p] = env;
  }
  if (process.env.SSLCOMMERZ_STORE_ID) s.sslcommerz.storeId = process.env.SSLCOMMERZ_STORE_ID;
  if (process.env.SSLCOMMERZ_STORE_PASS) s.sslcommerz.storePass = process.env.SSLCOMMERZ_STORE_PASS;
  return s;
}
function saveSettings(s) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('app', JSON.stringify(s));
}

const getAt = (o, p) => p.reduce((x, k) => (x == null ? x : x[k]), o);
const setAt = (o, p, v) => { const last = p[p.length - 1]; p.slice(0, -1).reduce((x, k) => x[k], o)[last] = v; };

// What the admin page sees: secrets only as "set / not set" plus the last 4 characters.
function maskedSettings() {
  const s = JSON.parse(JSON.stringify(getSettings()));
  for (const p of SECRET_PATHS) { const v = getAt(s, p) || ''; setAt(s, p, v ? { set: true, hint: v.slice(-4) } : { set: false, hint: '' }); }
  return s;
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length);
  return crypto.timingSafeEqual(want, got);
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const newId = (n = 18) => crypto.randomBytes(n).toString('base64url');

module.exports = { db, DEFAULT_SETTINGS, SECRET_PATHS, getSettings, saveSettings, maskedSettings, getAt, setAt, hashPassword, checkPassword, sha256, newId };
