// Local-first storage and shared helpers. Everything lives in one localStorage key.
const STORE_KEY = 'manator_data';
const STORE_VERSION = 1;

function defaultState() {
  return {
    version: STORE_VERSION,
    settings: { tutorName: '', currency: '৳' },
    ai: { provider: 'gemini', models: {}, keys: {} },
    students: [],
    lessons: [],
    contracts: [],
    payments: [],
    expenses: [],
    docs: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load data', e);
    return defaultState();
  }
}

function normalizeState(data) {
  const base = defaultState();
  if (!data || typeof data !== 'object') return base;
  const out = { ...base, ...data };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.ai = { ...base.ai, ...(data.ai || {}) };
  out.ai.models = { ...(data.ai && data.ai.models) };
  out.ai.keys = { ...(data.ai && data.ai.keys) };
  for (const k of ['students', 'lessons', 'contracts', 'payments', 'expenses', 'docs']) {
    out[k] = Array.isArray(data[k]) ? data[k] : [];
  }
  out.version = STORE_VERSION;
  return out;
}

let db = loadState();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('Could not save: storage is full or blocked.', 'error');
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Dates (local, YYYY-MM-DD strings) ─────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayISO() { return toISO(new Date()); }
function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function addMonths(iso, n) {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}
function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
function monthKey(iso) { return String(iso).slice(0, 7); }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtDate(iso, opts) {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMonth(key) {
  return parseISO(key + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function money(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const sign = v < 0 ? '-' : '';
  return `${sign}${db.settings.currency || ''}${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Lookups ───────────────────────────────────────────────────
function getStudent(id) { return db.students.find(s => s.id === id); }
function getContract(id) { return db.contracts.find(c => c.id === id); }
function studentName(id) { const s = getStudent(id); return s ? s.name : 'Unknown student'; }
function studentContracts(id) { return db.contracts.filter(c => c.studentId === id); }
function activeContracts(id) { return studentContracts(id).filter(c => c.status !== 'ended'); }
function studentLessons(id) {
  return db.lessons.filter(l => l.studentId === id).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}
function studentPayments(id) {
  return db.payments.filter(p => p.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
}

function deleteStudent(id) {
  db.students = db.students.filter(s => s.id !== id);
  db.lessons = db.lessons.filter(l => l.studentId !== id);
  db.contracts = db.contracts.filter(c => c.studentId !== id);
  db.payments = db.payments.filter(p => p.studentId !== id);
  db.docs = db.docs.map(d => (d.studentId === id ? { ...d, studentId: null } : d));
  save();
}

function deleteContract(id) {
  db.contracts = db.contracts.filter(c => c.id !== id);
  db.lessons = db.lessons.map(l => (l.contractId === id ? { ...l, contractId: null } : l));
  db.payments = db.payments.map(p => (p.contractId === id ? { ...p, contractId: null } : p));
  save();
}

// ── Backup ────────────────────────────────────────────────────
function exportBackup(includeKeys) {
  const copy = JSON.parse(JSON.stringify(db));
  if (!includeKeys) copy.ai.keys = {};
  copy.exportedAt = new Date().toISOString();
  return JSON.stringify(copy, null, 2);
}

function importBackup(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.students)) throw new Error('This file is not a Manator backup.');
  const keys = db.ai.keys;
  db = normalizeState(data);
  if (!Object.keys(db.ai.keys).length) db.ai.keys = keys;
  save();
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
