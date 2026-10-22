// Tuitrix server: serves the app and adds accounts, AI with the server's keys, ad credits,
// Pro payments and an admin settings page. No dependencies: Node 22.13+ only.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

// Initialize Firebase Admin (optional fallback for development)
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch (err) {
    console.warn('Firebase Admin SDK not fully initialized (missing credentials). Auth verify middleware may fail.', err.message);
  }
}
const crypto = require('node:crypto');
const { db, OWNER_EMAIL, PERMS, savedSettings, getSettings, saveSettings, maskedSettings, SECRET_PATHS, getAt, setAt, hashPassword, checkPassword, sha256, newId } = require('./db');
const ai = require('./ai');
const pay = require('./pay');

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.join(__dirname, '..');
const STATIC = ['/index.html', '/manifest.json', '/service-worker.js'];
const STATIC_DIRS = ['/css/', '/js/', '/icons/'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const SESSION_MS = 30 * 86400e3;
const AI_BODY_MAX = 30 * 1024 * 1024;
const BODY_MAX = 256 * 1024;

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

function send(res, status, body, headers) {
  const json = typeof body !== 'string';
  res.writeHead(status, { 'Content-Type': json ? 'application/json' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(json ? JSON.stringify(body) : body);
}
function redirect(res, url, headers) { res.writeHead(303, { Location: url, 'Cache-Control': 'no-store', ...headers }); res.end(); }

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > max) { reject(new HttpError(413, 'This upload is too big.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJSON(req, max) {
  if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Expected JSON.');
  try { return JSON.parse((await readBody(req, max || BODY_MAX)) || '{}'); } catch (e) { if (e.status) throw e; throw new HttpError(400, 'Invalid JSON.'); }
}
async function readForm(req) { return new URLSearchParams(await readBody(req, BODY_MAX)); }

// X-Forwarded-* headers are only trusted with TRUST_PROXY=<number of proxies in front, e.g. 1, or 2 for CDN + proxy>
// and only when the request itself comes from a loopback or private address (your proxy). Only set it when the server
// can't be reached except through that proxy. The first X-Forwarded-Host is the public host the visitor used.
const PROXY_HOPS = Math.max(0, parseInt(process.env.TRUST_PROXY, 10) || 0);
const fromProxy = req => PROXY_HOPS > 0 && /^(::1|127\.|::ffff:127\.|10\.|::ffff:10\.|192\.168\.|::ffff:192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::ffff:172\.(1[6-9]|2\d|3[01])\.|f[cd])/i.test(req.socket.remoteAddress || '');
function publicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const fwd = fromProxy(req);
  const proto = (fwd && (req.headers['x-forwarded-proto'] || '').split(',')[0].trim()) || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${(fwd && String(req.headers['x-forwarded-host'] || '').split(',')[0].trim()) || req.headers.host}`;
}
function cookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
function sessionCookie(req, token, maxAge) {
  const secure = publicUrl(req).startsWith('https:') ? '; Secure' : '';
  return `msid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure}`;
}

async function syncBillingToFirestore(userId) {
  if (!admin.apps.length) return;
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return;
    const isPro = user.pro_until > Date.now();
    const transactions = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all() || [];

    // We need the Firebase uid. It is likely that the user hasn't linked Firebase, or we need to find them by email.
    // If the client creates the Firebase user, they have the same email.
    try {
      const fbUser = await admin.auth().getUserByEmail(user.email);
      if (fbUser) {
        await admin.firestore().doc(`users/${fbUser.uid}/data/billing`).set({
          plan: isPro ? 'pro' : 'free',
          proUntil: user.pro_until,
          credits: user.credits,
          updatedAt: Date.now(),
          transactions: transactions
        });
      }
    } catch (e) {
      // User might not exist in Firebase Auth yet, that's fine.
    }
  } catch (err) {
    console.error('Failed to sync billing to Firestore', err);
  }
}

module.exports.syncBillingToFirestore = syncBillingToFirestore;

// ── Accounts ─────────────────────────────────────────────────
function currentUser(req) {
  if (req.firebaseUser && req.firebaseUser.email) {
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(req.firebaseUser.email);
    if (u) return u;
  }
  const token = cookie(req, 'msid');
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!s || s.expires_at < Date.now()) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id) || null;
}
function needUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Please sign in first.');
  return u;
}
const permsOf = u => (u.role === 'owner' ? PERMS.slice() : u.role === 'admin' ? u.perms.split(',').filter(p => PERMS.includes(p)) : []);
const can = (u, p) => permsOf(u).includes(p);
// Signed-in user who has at least one of the given admin rights.
function needPerm(req, ...anyOf) {
  const u = needUser(req);
  if (!anyOf.some(p => can(u, p))) throw new HttpError(403, "You don't have permission to do this.");
  return u;
}
function needOwner(req) {
  const u = needUser(req);
  if (u.role !== 'owner') throw new HttpError(403, 'Only the owner can do this.');
  return u;
}
// Signing up with the owner email needs this code (printed in the server log) until the owner account exists.
let ownerSetupCode = db.prepare("SELECT 1 FROM users WHERE email = ? AND role = 'owner'").get(OWNER_EMAIL) ? null : (process.env.OWNER_SETUP_CODE || newId(6));
const sameText = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function adsToday(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM ad_views WHERE user_id = ? AND day = ? AND claimed_at IS NOT NULL').get(userId, today()).n;
}
function userJSON(u, settings) {
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, perms: permsOf(u), credits: u.credits, proUntil: u.pro_until, pro: u.pro_until > Date.now(), serverNow: Date.now(), adsLeft: Math.max(0, settings.adsPerDay - adsToday(u.id)) };
}
function configJSON(settings) {
  return {
    welcomeCredits: settings.welcomeCredits, adCredits: settings.adCredits, adsPerDay: settings.adsPerDay, adSeconds: settings.adSeconds,
    prices: settings.prices, gateway: settings.gateway,
    ai: { ready: ai.providers(settings, false).length > 0, files: ai.providers(settings, true).length > 0 },
  };
}
const SETTING_SECTIONS = { plans: ['welcomeCredits', 'adCredits', 'adsPerDay', 'adSeconds', 'prices'], gateway: ['gateway', 'sslcommerz'], ai: ['ai'] };
const unlimited = u => can(u, 'unlimited') || u.pro_until > Date.now();

// With trusted proxies, the client is the address the outermost trusted proxy saw (PROXY_HOPS from the right).
function clientIp(req) {
  const list = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return (fromProxy(req) && list[list.length - PROXY_HOPS]) || req.socket.remoteAddress || '';
}
const attempts = new Map(); // ip -> [timestamps of failed logins]
// Failed tries are counted per address and per email, so a faked address can't get unlimited guesses at one account or the owner code.
function limitLogin(req, email) {
  const now = Date.now();
  const keys = [clientIp(req), /^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email || '') && 'email:' + email].filter(Boolean);
  const recent = k => (attempts.get(k) || []).filter(t => now - t < 15 * 60e3);
  if (keys.some(k => recent(k).length >= 10)) throw new HttpError(429, 'Too many tries. Wait 15 minutes and try again.');
  // Only failed tries create entries, and the sweep below drops expired ones.
  return () => keys.forEach(k => attempts.set(k, [...recent(k), now]));
}
setInterval(() => {
  const now = Date.now();
  for (const [map, ms] of [[attempts, 15 * 60e3], [signups, 60 * 60e3]]) {
    for (const [k, list] of map) { const left = list.filter(t => now - t < ms); if (left.length) map.set(k, left); else map.delete(k); }
  }
}, 5 * 60e3).unref();
const signups = new Map(); // ip -> [timestamps of new accounts]
function limitSignup(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const list = (signups.get(ip) || []).filter(t => now - t < 60 * 60e3);
  signups.set(ip, list);
  if (list.length >= 5) throw new HttpError(429, 'Too many new accounts from here. Try again in an hour.');
  return () => list.push(now);
}
// The owner email only becomes owner with the setup code, so changing OWNER_EMAIL never hands an existing account owner rights by itself.
function checkOwnerCode(b, fail) {
  if (ownerSetupCode && sameText(String(b.setupCode || '').trim(), ownerSetupCode)) return;
  fail();
  throw new HttpError(403, b.setupCode ? 'Wrong setup code. Check the server log for the current code.' : 'This email is reserved for the owner. Enter the setup code from the server log.', { setupCode: true });
}
function startSession(req, res, userId) {
  const token = newId(32);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + SESSION_MS);
  res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_MS));
}
function cleanEmail(e) { return String(e || '').trim().toLowerCase(); }

const routes = {
  'GET /api/me': req => { const s = getSettings(); return { user: userJSON(currentUser(req), s), config: configJSON(s) }; },

  'POST /api/signup': async (req, res) => {
    const b = await readJSON(req);
    const fail = limitLogin(req, cleanEmail(b.email));
    const counted = limitSignup(req);
    const email = cleanEmail(b.email), password = String(b.password || ''), name = String(b.name || '').trim().slice(0, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, 'Enter a valid email address.');
    if (password.length < 8) throw new HttpError(400, 'Use a password of at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) { fail(); throw new HttpError(409, 'An account with this email already exists. Sign in instead.'); }
    const owner = email === OWNER_EMAIL;
    if (owner) checkOwnerCode(b, fail);
    const s = getSettings();
    const credits = owner ? 999999 : Math.max(0, Math.floor(s.welcomeCredits));
    const proUntil = owner ? Date.now() + 100 * 365 * 86400e3 : 0;
    const r = db.prepare('INSERT INTO users (email, name, pass_hash, role, credits, pro_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(email, name, await hashPassword(password), owner ? 'owner' : 'user', credits, proUntil, Date.now());
    if (owner) ownerSetupCode = null;
    counted();
    startSession(req, res, Number(r.lastInsertRowid));
    syncBillingToFirestore(Number(r.lastInsertRowid));
    return { user: userJSON(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid), s) };
  },

  'POST /api/login': async (req, res) => {
    const b = await readJSON(req);
    const fail = limitLogin(req, cleanEmail(b.email));
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail(b.email));
    if (!u || !(await checkPassword(String(b.password || ''), u.pass_hash))) { fail(); throw new HttpError(401, 'Wrong email or password.'); }
    if (u.email === OWNER_EMAIL && (u.role !== 'owner' || u.pro_until < Date.now() || u.credits < 999999)) {
      if (u.role !== 'owner') checkOwnerCode(b, fail);
      db.prepare("UPDATE users SET role = 'owner', perms = '', credits = 999999, pro_until = ? WHERE id = ?").run(Date.now() + 100 * 365 * 86400e3, u.id);
      ownerSetupCode = null;
      Object.assign(u, { role: 'owner', perms: '', credits: 999999, pro_until: Date.now() + 100 * 365 * 86400e3 });
      syncBillingToFirestore(u.id);
    }
    startSession(req, res, u.id);
    return { user: userJSON(u, getSettings()) };
  },

  'POST /api/logout': async (req, res) => {
    await readJSON(req);
    const token = cookie(req, 'msid');
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    return { ok: true };
  },

  'POST /api/ai': async req => {
    const u = needUser(req);
    const b = await readJSON(req, AI_BODY_MAX);
    const s = getSettings();
    const system = String(b.system || ''), user = String(b.user || '');
    const o = b.opts || {};
    const files = (Array.isArray(o.files) ? o.files : []).filter(f => f && typeof f.data === 'string' && /^(application\/pdf|image\/[\w.+-]+)$/.test(f.mimeType)).slice(0, 10);
    const opts = { temperature: o.temperature, maxTokens: o.maxTokens, json: !!o.json, files };
    // A reply that wasn't valid JSON may be asked again once without paying twice.
    let charged = 0;
    const retry = typeof b.retry === 'string' && db.prepare('UPDATE ai_requests SET retried = 1 WHERE id = ? AND user_id = ? AND retried = 0 AND at > ?').run(b.retry, u.id, Date.now() - 10 * 60e3).changes;
    if (!retry && !unlimited(u)) {
      if (!db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0').run(u.id).changes) throw new HttpError(402, 'You are out of AI credits. Watch a short ad for more, or go Pro for unlimited AI.');
      charged = 1;
    }
    try {
      const out = await ai.generate(s, system, user, opts);
      const id = newId();
      db.prepare('INSERT INTO ai_requests (id, user_id, at, provider, model, charged) VALUES (?, ?, ?, ?, ?, ?)').run(id, u.id, Date.now(), out.provider, out.model, charged);
      if (charged) syncBillingToFirestore(u.id);
      return { id, text: out.text, model: out.model, provider: ai.NAMES[out.provider], user: userJSON(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), s) };
    } catch (err) {
      if (charged) {
        db.prepare('UPDATE users SET credits = credits + 1 WHERE id = ?').run(u.id);
        syncBillingToFirestore(u.id);
      }
      throw new HttpError(err.status && err.status >= 400 && err.status < 600 ? (err.status === 401 || err.status === 403 ? 503 : err.status) : 502, err.message);
    }
  },

  'POST /api/ads/start': async req => {
    const u = needUser(req);
    await readJSON(req);
    const s = getSettings();
    if (u.pro_until > Date.now()) throw new HttpError(400, 'Pro has no ads and unlimited AI.');
    if (adsToday(u.id) >= s.adsPerDay) throw new HttpError(429, `That's all ${s.adsPerDay} ads for today. Come back tomorrow, or go Pro.`);
    const id = newId();
    db.prepare('INSERT INTO ad_views (id, user_id, day, started_at) VALUES (?, ?, ?, ?)').run(id, u.id, today(), Date.now());
    return { id, seconds: s.adSeconds };
  },

  'POST /api/ads/claim': async req => {
    const u = needUser(req);
    const b = await readJSON(req);
    const s = getSettings();
    const v = db.prepare('SELECT * FROM ad_views WHERE id = ? AND user_id = ?').get(String(b.id || ''), u.id);
    if (!v || v.claimed_at) throw new HttpError(400, 'This ad was already used.');
    if (Date.now() - v.started_at < (s.adSeconds - 1) * 1000) throw new HttpError(400, 'Watch the whole ad to get the credit.');
    if (adsToday(u.id) >= s.adsPerDay) throw new HttpError(429, `That's all ${s.adsPerDay} ads for today.`);
    if (!db.prepare('UPDATE ad_views SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL').run(Date.now(), v.id).changes) throw new HttpError(400, 'This ad was already used.');
    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(Math.max(0, Math.floor(s.adCredits)), u.id);
    syncBillingToFirestore(u.id);
    return { user: userJSON(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), s) };
  },

  'POST /api/pay/start': async req => {
    const u = needUser(req);
    const b = await readJSON(req);
    const s = getSettings();
    const p = pay.createPayment(u, String(b.plan || ''), s);
    try { return { url: await pay.startCheckout(p, u, s, publicUrl(req)) }; } catch (err) {
      pay.markFailed(p.id, 'failed');
      throw new HttpError(err.status || 502, err.message);
    }
  },

  'GET /pay/test': (req, res, url) => {
    const p = db.prepare("SELECT * FROM payments WHERE id = ? AND gateway = 'test' AND status = 'pending'").get(url.searchParams.get('id') || '');
    if (!p || getSettings().gateway !== 'test') return send(res, 404, '<p>This test payment is not open any more. <a href="/#/settings">Back to Tuitrix</a></p>');
    send(res, 200, pay.testGatewayPage(p, esc));
  },
  'POST /pay/test/finish': async (req, res) => {
    const f = await readForm(req);
    const p = db.prepare("SELECT * FROM payments WHERE id = ? AND gateway = 'test' AND status = 'pending'").get(String(f.get('id') || ''));
    if (!p || getSettings().gateway !== 'test') return redirect(res, '/#/settings?paid=0');
    if (f.get('action') === 'pay') pay.markPaid(p.id, 'TEST-' + newId(6), String(f.get('method') || ''));
    else pay.markFailed(p.id, 'cancelled');
    syncBillingToFirestore(p.user_id);
    redirect(res, `/#/settings?paid=${f.get('action') === 'pay' ? 1 : 0}`);
  },
  'POST /pay/sslcommerz/return': async (req, res) => {
    const r = await pay.verifySSLCommerz(await readForm(req), getSettings()).catch(() => ({ ok: false }));
    if (r && r.pay) syncBillingToFirestore(r.pay.user_id);
    redirect(res, `/#/settings?paid=${r.ok ? 1 : 0}`);
  },
  'POST /pay/sslcommerz/ipn': async (req, res) => {
    const r = await pay.verifySSLCommerz(await readForm(req), getSettings()).catch(() => ({ ok: false }));
    if (r && r.pay) syncBillingToFirestore(r.pay.user_id);
    send(res, 200, { ok: true });
  },

  // ── Admin ──
  'GET /api/admin/settings': req => {
    const u = needPerm(req, 'plans', 'gateway', 'ai');
    const s = maskedSettings();
    for (const [perm, keys] of Object.entries(SETTING_SECTIONS)) if (!can(u, perm)) for (const k of keys) delete s[k];
    return { settings: s, env: { aiKeys: can(u, 'ai') ? ['gemini', 'groq', 'openrouter'].filter(p => process.env[`${p.toUpperCase()}_API_KEY`]) : [] } };
  },
  'PUT /api/admin/settings': async req => {
    const u = needPerm(req, 'plans', 'gateway', 'ai');
    const b = await readJSON(req);
    const cur = getSettings();
    const int = (v, lo, hi, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const next = {
      welcomeCredits: int(b.welcomeCredits, 0, 1000, cur.welcomeCredits),
      adCredits: int(b.adCredits, 0, 100, cur.adCredits),
      adsPerDay: int(b.adsPerDay, 0, 100, cur.adsPerDay),
      adSeconds: int(b.adSeconds, 5, 120, cur.adSeconds),
      prices: {},
      gateway: ['off', 'test', 'sslcommerz'].includes(b.gateway) ? b.gateway : cur.gateway,
      sslcommerz: { storeId: String((b.sslcommerz && b.sslcommerz.storeId) != null ? b.sslcommerz.storeId : cur.sslcommerz.storeId).trim(), storePass: cur.sslcommerz.storePass, sandbox: b.sslcommerz ? b.sslcommerz.sandbox !== false : cur.sslcommerz.sandbox },
      ai: { order: (Array.isArray(b.ai && b.ai.order) ? b.ai.order : cur.ai.order).filter(p => ['gemini', 'groq', 'openrouter'].includes(p)), keys: { ...cur.ai.keys } },
    };
    for (const k of Object.keys(cur.prices)) {
      const p = (b.prices && b.prices[k]) || {};
      next.prices[k] = { label: cur.prices[k].label, amount: int(p.amount, 1, 1e6, cur.prices[k].amount), days: cur.prices[k].days };
    }
    // Secrets: only replaced when a new value is typed; "" keeps the old one, null clears it.
    const stored = (() => { try { return JSON.parse((db.prepare('SELECT value FROM settings WHERE key = ?').get('app') || {}).value || '{}'); } catch (e) { return {}; } })();
    for (const p of SECRET_PATHS) {
      const v = getAt(b, p);
      const old = getAt(stored, p) || '';
      setAt(next, p, v === null ? '' : typeof v === 'string' && v.trim() ? v.trim() : old);
    }
    // Sections this admin may not edit keep their saved values.
    const base = savedSettings();
    for (const [perm, keys] of Object.entries(SETTING_SECTIONS)) if (!can(u, perm)) for (const k of keys) next[k] = base[k];
    saveSettings(next);
    return { settings: maskedSettings() };
  },
  'POST /api/admin/ai-test': async req => {
    needPerm(req, 'ai');
    const b = await readJSON(req);
    const s = getSettings();
    const p = String(b.provider || '');
    if (!s.ai.keys[p]) throw new HttpError(400, 'Add a key for this provider first.');
    try {
      const list = await ai.fetchModelList(p, s.ai.keys[p]);
      const out = await ai.generate({ ...s, ai: { ...s.ai, order: [p] } }, 'You are a connection test.', 'Reply with exactly: OK', { maxTokens: 1024, temperature: 0 });
      return { ok: true, models: list.length, model: out.model, reply: out.text.trim().slice(0, 40) };
    } catch (err) { throw new HttpError(502, err.message); }
  },
  'GET /api/admin/users': req => {
    needPerm(req, 'users', 'credits');
    const s = getSettings();
    return { users: db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 500').all().map(u => ({ ...userJSON(u, s), createdAt: u.created_at, aiRequests: db.prepare('SELECT COUNT(*) AS n FROM ai_requests WHERE user_id = ?').get(u.id).n })) };
  },
  'POST /api/admin/user': async req => {
    needPerm(req, 'credits');
    const b = await readJSON(req);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(b.id));
    if (!u) throw new HttpError(404, 'User not found.');
    const add = Math.floor(Number(b.addCredits) || 0), days = Math.floor(Number(b.addProDays) || 0);
    if (add) db.prepare('UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?').run(add, u.id);
    if (days > 0) db.prepare('UPDATE users SET pro_until = MAX(pro_until, ?) + ? WHERE id = ?').run(Date.now(), days * 86400e3, u.id);
    if (b.endPro) db.prepare('UPDATE users SET pro_until = 0 WHERE id = ?').run(u.id);
    syncBillingToFirestore(u.id);
    return { target: userJSON(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id), getSettings()) };
  },
  'GET /api/admin/payments': req => {
    needPerm(req, 'payments');
    return { payments: db.prepare('SELECT p.*, u.email FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 500').all() };
  },

  // ── Owner: admins and their rights ──
  'GET /api/admin/admins': req => {
    needOwner(req);
    const s = getSettings();
    return { admins: db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY email").all().map(u => userJSON(u, s)), perms: PERMS };
  },
  // Sets an account's admin rights by email; an empty list removes admin.
  'POST /api/admin/admins': async req => {
    needOwner(req);
    const b = await readJSON(req);
    const t = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail(b.email));
    if (!t) throw new HttpError(404, 'No account uses this email. Ask them to create an account first.');
    if (t.role === 'owner') throw new HttpError(400, "The owner's rights can't be changed.");
    const perms = PERMS.filter(p => Array.isArray(b.perms) && b.perms.includes(p));
    db.prepare('UPDATE users SET role = ?, perms = ? WHERE id = ?').run(perms.length ? 'admin' : 'user', perms.join(','), t.id);
    return { target: userJSON(db.prepare('SELECT * FROM users WHERE id = ?').get(t.id), getSettings()) };
  },
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!STATIC.includes(p) && !STATIC_DIRS.some(d => p.startsWith(d))) return send(res, 404, 'Not found');
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep)) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  // Lightweight Firebase Auth middleware
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    try {
      req.firebaseUser = await admin.auth().verifyIdToken(idToken);
      if (req.firebaseUser && req.firebaseUser.email && req.firebaseUser.email.toLowerCase() === OWNER_EMAIL) {
        let u = db.prepare('SELECT * FROM users WHERE email = ?').get(OWNER_EMAIL);
        if (!u) {
           const r = db.prepare('INSERT INTO users (email, name, pass_hash, role, credits, pro_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
             .run(OWNER_EMAIL, req.firebaseUser.name || 'Owner', '', 'owner', 999999, Date.now() + 100 * 365 * 86400e3, Date.now());
           u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
           syncBillingToFirestore(u.id);
        } else if (u.role !== 'owner' || u.pro_until < Date.now() || u.credits < 999999) {
           db.prepare("UPDATE users SET role = 'owner', perms = '', credits = 999999, pro_until = ? WHERE id = ?").run(Date.now() + 100 * 365 * 86400e3, u.id);
           syncBillingToFirestore(u.id);
        }
      }
    } catch (err) {
      // Token exists but is invalid/expired
      req.firebaseUser = null;
    }
  }

  const url = new URL(req.url, 'http://x');
  const route = routes[`${req.method} ${url.pathname}`];
  try {
    if (!route) {
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/pay/')) throw new HttpError(404, 'Not found.');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      return serveStatic(req, res, url);
    }
    // Every API write must be JSON: browsers won't send that cross-site without a CORS preflight,
    // which this server never allows, so other websites can't act with a user's cookie.
    const out = await route(req, res, url);
    if (out !== undefined && !res.headersSent) send(res, 200, out);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message, ...(status === 500 ? {} : err.extra) });
  }
});

server.listen(PORT, () => {
  console.log(`Tuitrix server on http://localhost:${PORT}`);
  if (ownerSetupCode) console.log(`Owner setup code for ${OWNER_EMAIL}: ${ownerSetupCode}`);
});
