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

// Coerce stored/imported data into the expected shape so a bad backup can't
// put unexpected types into the app. Records missing required fields are dropped.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 20000) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '').slice(0, max);
const num = v => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);
const optStr = v => (typeof v === 'string' && v ? v : null);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const isDate = v => typeof v === 'string' && DATE_RE.test(v);
const strMap = v => Object.fromEntries(Object.entries(isObj(v) ? v : {}).filter(([, x]) => typeof x === 'string'));

const RECORD_SHAPES = {
  students: x => x.name && {
    ...x, name: str(x.name, 200), grade: str(x.grade), curriculum: str(x.curriculum), phone: str(x.phone),
    guardianName: str(x.guardianName), guardianPhone: str(x.guardianPhone), address: str(x.address), notes: str(x.notes),
    active: x.active !== false,
    subjects: Array.isArray(x.subjects) ? x.subjects.filter(v => typeof v === 'string') : [],
    schedule: (Array.isArray(x.schedule) ? x.schedule : []).filter(isObj)
      .map(sl => ({ day: Math.round(num(sl.day)), time: str(sl.time, 5), duration: num(sl.duration) || 60 }))
      .filter(sl => sl.day >= 0 && sl.day <= 6),
  },
  lessons: x => typeof x.studentId === 'string' && isDate(x.date) && {
    ...x, time: str(x.time, 5), duration: num(x.duration) || null, status: oneOf(x.status, ['taught', 'absent', 'cancelled'], 'taught'),
    subject: str(x.subject), contractId: optStr(x.contractId), topics: str(x.topics), homework: str(x.homework), notes: str(x.notes),
  },
  contracts: x => typeof x.studentId === 'string' && isDate(x.startDate) && {
    ...x, title: str(x.title, 200) || 'Tuition', fee: num(x.fee), cycleType: oneOf(x.cycleType, ['days', 'months', 'classes'], 'months'),
    cycleLength: Math.max(1, Math.round(num(x.cycleLength)) || 1), billing: oneOf(x.billing, ['start', 'end'], 'end'),
    status: oneOf(x.status, ['active', 'ended'], 'active'), endDate: isDate(x.endDate) ? x.endDate : undefined, notes: str(x.notes),
  },
  payments: x => typeof x.studentId === 'string' && isDate(x.date) && {
    ...x, contractId: optStr(x.contractId), amount: num(x.amount), method: str(x.method, 50), note: str(x.note),
  },
  expenses: x => isDate(x.date) && { ...x, amount: num(x.amount), category: str(x.category, 100) || 'Other', note: str(x.note) },
  docs: x => ({
    ...x, type: oneOf(x.type, ['plan', 'exam', 'worksheet'], 'exam'), title: str(x.title, 300) || 'Untitled', content: str(x.content, 2000000),
    studentId: optStr(x.studentId), createdAt: typeof x.createdAt === 'string' && !isNaN(Date.parse(x.createdAt)) ? x.createdAt : new Date().toISOString(),
  }),
};

function normalizeState(data) {
  const base = defaultState();
  if (!isObj(data)) return base;
  const s = isObj(data.settings) ? data.settings : {};
  const ai = isObj(data.ai) ? data.ai : {};
  const out = {
    version: STORE_VERSION,
    settings: { ...s, tutorName: str(s.tutorName, 100), currency: str(s.currency, 8) || base.settings.currency, lastBackup: optStr(s.lastBackup) },
    ai: {
      provider: typeof ai.provider === 'string' && (typeof AI_PROVIDERS === 'undefined' || ai.provider in AI_PROVIDERS) ? ai.provider : base.ai.provider,
      models: strMap(ai.models),
      keys: strMap(ai.keys),
    },
  };
  for (const [k, shape] of Object.entries(RECORD_SHAPES)) {
    const ids = new Set();
    out[k] = (Array.isArray(data[k]) ? data[k] : [])
      .filter(x => isObj(x) && typeof x.id === 'string' && x.id && !ids.has(x.id) && ids.add(x.id))
      .map(shape).filter(Boolean);
  }
  return out;
}

let db = loadState();

// Returns false (and reverts unsaved in-memory changes) if the write failed,
// so callers must not report success or close the form.
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    console.error('Failed to save', e);
    db = loadState();
    toast('Not saved: this browser\'s storage is full or blocked. Delete some saved AI documents, or download a backup.', 'error');
    return false;
  }
}

// Current copy of a record being edited in a form. The form's own reference can be
// stale if `db` was reloaded meanwhile (another tab saved, or a failed save rolled back).
function liveRecord(list, rec) {
  const cur = db[list].find(x => x.id === rec.id);
  if (!cur) toast('This item was deleted (maybe in another tab), so the change was not saved.', 'error');
  return cur;
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
// Contracts that can take classes/payments on `date`: not ended, or ending on/after that date.
function activeContracts(id, date) {
  date = date || todayISO();
  return studentContracts(id).filter(c => c.status !== 'ended' || (c.endDate && c.endDate >= date));
}
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
  return save();
}

function deleteContract(id) {
  db.contracts = db.contracts.filter(c => c.id !== id);
  db.lessons = db.lessons.map(l => (l.contractId === id ? { ...l, contractId: null } : l));
  db.payments = db.payments.map(p => (p.contractId === id ? { ...p, contractId: null } : p));
  return save();
}

// ── Backup ────────────────────────────────────────────────────
function exportBackup(includeKeys) {
  const copy = JSON.parse(JSON.stringify(db));
  if (!includeKeys) copy.ai.keys = {};
  copy.exportedAt = new Date().toISOString();
  return JSON.stringify(copy, null, 2);
}

function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('This file is not a Manator backup.'); }
  if (!isObj(data) || !Array.isArray(data.students) || !Array.isArray(data.lessons) || !Array.isArray(data.contracts) || !Array.isArray(data.payments)) {
    throw new Error('This file is not a Manator backup.');
  }
  const keys = db.ai.keys;
  db = normalizeState(data);
  if (!Object.keys(db.ai.keys).length) db.ai.keys = keys;
  if (!save()) throw new Error('The backup could not be restored because storage is full.');
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
