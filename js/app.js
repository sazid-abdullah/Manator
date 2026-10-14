// UI: hash router, views, forms and actions.
const view = document.getElementById('view');
const ui = {
  studentSearch: '',
  studentFilter: 'active',
  classesStudent: '',
  classesMonth: monthKey(todayISO()),
  moneyMonth: monthKey(todayISO()),
  aiTool: 'plan',
  aiDraft: {},
  aiResult: null,
  aiBusy: false,
  aiSources: {},
  docsType: '',
  docsStudent: '',
  moneyQ: '',
  moneyAI: null,
  moneyBusy: false,
  examBusy: false,
};
let lastRoute = '';
let installPrompt = null;

// ── Toasts & modal ───────────────────────────────────────────
function toast(msg, type, action) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); };
    el.appendChild(b);
  }
  box.appendChild(el);
  setTimeout(() => el.remove(), action ? 6000 : 3500);
}

const modalRoot = document.getElementById('modal-root');
function openModal(title, html, onMount) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  modalRoot.hidden = false;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(document.getElementById('modal-body'));
  const first = modalRoot.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
  if (first && window.matchMedia('(min-width: 761px)').matches) first.focus();
}
function closeModal() {
  modalRoot.hidden = true;
  document.body.style.overflow = '';
  document.getElementById('modal-body').innerHTML = '';
}
modalRoot.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalRoot.hidden) closeModal(); });

function confirmDialog(title, message, okLabel, onOk) {
  openModal(title, `<p>${esc(message)}</p>
    <div class="form-actions"><button class="btn" data-close>Cancel</button><button class="btn danger" id="confirm-ok">${esc(okLabel || 'Delete')}</button></div>`,
  body => { body.querySelector('#confirm-ok').onclick = () => { closeModal(); onOk(); }; });
}

function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form).entries()) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}

// ── Small render helpers ─────────────────────────────────────
const AVATAR_COLORS = ['#5b8cff', '#3ecf8e', '#f59e0b', '#ef6f9b', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
function avatar(s, size) {
  let h = 0;
  for (const ch of s.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = s.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const dims = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px;` : '';
  return `<div class="avatar" style="${dims}background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${esc(initials || '?')}</div>`;
}
function scheduleSummary(s) {
  if (!s.schedule || !s.schedule.length) return 'No fixed schedule';
  const sorted = [...s.schedule].sort((a, b) => a.day - b.day || (a.time || '').localeCompare(b.time || ''));
  const times = [...new Set(sorted.map(x => x.time))];
  if (times.length === 1) return `${sorted.map(x => WEEKDAYS[x.day]).join(', ')}${times[0] ? ' · ' + fmtTime(times[0]) : ''}`;
  return sorted.map(x => `${WEEKDAYS[x.day]} ${fmtTime(x.time)}`).join(', ');
}
function balanceBadge(bal) {
  if (bal > 0.005) return `<span class="badge red">Owes ${money(bal)}</span>`;
  if (bal < -0.005) return `<span class="badge green">Advance ${money(-bal)}</span>`;
  return '<span class="badge green">Paid up</span>';
}
function statusBadge(status) {
  if (status === 'absent') return '<span class="badge yellow">Absent</span>';
  if (status === 'cancelled') return '<span class="badge">Cancelled</span>';
  return '<span class="badge green">Taught</span>';
}
function studentOptions(selected, includeBlank, blankLabel) {
  const list = db.students.filter(s => s.active !== false || s.id === selected).sort((a, b) => a.name.localeCompare(b.name));
  return (includeBlank ? `<option value="">${esc(blankLabel || '— Select student —')}</option>` : '') +
    list.map(s => `<option value="${s.id}"${s.id === selected ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
}
function contractOptions(studentId, selected, allowNone, date) {
  const open = studentId ? activeContracts(studentId, date) : [];
  const list = studentId ? studentContracts(studentId).filter(c => open.includes(c) || c.id === selected) : [];
  return list.map(c => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.title || 'Contract')} · ${money(c.fee)} ${esc(cycleLabel(c))}</option>`).join('') +
    (allowNone ? `<option value=""${!selected ? ' selected' : ''}>Not linked to a contract</option>` : '');
}
function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 11 && d.startsWith('01')) d = '88' + d; // Bangladesh local format
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
function reminderText(s, c, st) {
  const sign = db.settings.tutorName ? `\n— ${db.settings.tutorName}` : '';
  const why = c.cycleType === 'classes' ? ` (${st.billedCycles * c.cycleLength} classes completed)` : '';
  return `Hello! A friendly reminder that the tuition fee of ${money(st.balance)} for ${s.name}${why} is due. Thank you!${sign}`;
}
function lessonsOn(date) { return db.lessons.filter(l => l.date === date); }

// ── Router ───────────────────────────────────────────────────
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, q] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
}

function render() {
  const { parts, query } = parseHash();
  const route = parts[0] || 'home';
  document.body.classList.remove('exam-mode');
  finishExpiredAttempts();
  document.querySelectorAll('#nav a').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', r === route || (r === 'students' && route === 'student'));
  });
  let html = '';
  let after = null;
  switch (route) {
    case 'students': html = viewStudents(); after = bindStudents; break;
    case 'student': {
      const s = getStudent(parts[1]);
      html = s ? viewStudent(s) : `<div class="empty">Student not found. <a href="#/students">Back to students</a></div>`;
      break;
    }
    case 'classes':
      if (query.get('student')) ui.classesStudent = query.get('student');
      html = viewClasses(); after = bindFilters; break;
    case 'money': html = viewMoney(); after = bindMoney; break;
    case 'ai':
      if (query.get('tool')) ui.aiTool = query.get('tool');
      if (query.get('student')) prefillAIStudent(query.get('student'));
      if (query.toString()) { history.replaceState(null, '', '#/ai'); }
      html = viewAI(); after = bindAI; break;
    case 'settings': html = viewSettings(); after = bindSettings; break;
    case 'exam': html = viewExam(parts[1]); after = bindExam; break;
    case 'result': html = viewResult(parts[1]); after = bindResult; break;
    default: html = viewHome();
  }
  const running = route !== 'exam' && db.attempts.find(a => a.status === 'running');
  if (running) html = `<div class="notice warn">An exam is running: <b>${esc(running.title)}</b>, ${fmtClock(running.endsAt - Date.now())} left. <a href="#/exam/${running.id}">Go back to the exam</a></div>` + html;
  view.innerHTML = html;
  if (after) after();
  const key = parts.join('/');
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
}
window.addEventListener('hashchange', render);

// ── Home ─────────────────────────────────────────────────────
function viewHome() {
  const today = todayISO();
  const dow = new Date().getDay();
  const greetName = db.settings.tutorName ? `, ${esc(db.settings.tutorName.split(' ')[0])}` : '';
  if (!db.students.length) {
    return `<div class="page-head"><div><h1>Welcome${greetName}</h1><div class="sub">Your private tuition manager. Everything stays on this device.</div></div></div>
      <div class="card" style="text-align:center;padding:36px 20px">
        <h2>Start by adding your first student</h2>
        <p class="muted" style="margin:8px auto 18px;max-width:460px">Add their weekly schedule and fee contract (e.g. ${money(3000)} every 12 classes, or monthly). Then log what you teach each day and Manator keeps track of the money.</p>
        <div class="actions" style="justify-content:center"><button class="btn primary" data-action="add-student">+ Add student</button><button class="btn" data-action="load-demo">Try with demo data</button></div>
      </div>`;
  }

  const active = db.students.filter(s => s.active !== false);
  const todays = lessonsOn(today);
  const scheduled = [];
  for (const s of active) for (const slot of (s.schedule || [])) if (Number(slot.day) === dow) scheduled.push({ s, slot });
  scheduled.sort((a, b) => (a.slot.time || '').localeCompare(b.slot.time || ''));
  // Match each timetable slot to the class logged for it: same time first, else
  // (if the student has a single slot today) any class logged for them today.
  const used = new Set();
  const slotsPerStudent = {};
  for (const x of scheduled) slotsPerStudent[x.s.id] = (slotsPerStudent[x.s.id] || 0) + 1;
  for (const x of scheduled) {
    x.lesson = todays.find(l => !used.has(l.id) && l.studentId === x.s.id && (l.time || '') === (x.slot.time || ''));
    if (x.lesson) used.add(x.lesson.id);
  }
  for (const x of scheduled) {
    if (x.lesson || slotsPerStudent[x.s.id] > 1) continue;
    x.lesson = todays.find(l => !used.has(l.id) && l.studentId === x.s.id);
    if (x.lesson) used.add(x.lesson.id);
  }
  const extra = todays.filter(l => !used.has(l.id));

  const month = monthKey(today);
  const income = db.payments.filter(p => monthKey(p.date) === month).reduce((a, p) => a + Number(p.amount || 0), 0);
  const taughtMonth = db.lessons.filter(l => monthKey(l.date) === month && l.status === 'taught').length;
  const dues = allDues();
  const owed = dues.filter(x => x.st.balance > 0.005).sort((a, b) => (a.st.owedSince || '9').localeCompare(b.st.owedSince || '9'));
  const soon = dues.filter(x => isDueSoon(x.c, x.st));
  const outstanding = owed.reduce((a, x) => a + x.st.balance, 0);

  const todayRows = scheduled.map(({ s, slot, lesson }) => {
    const right = lesson
      ? `${statusBadge(lesson.status)} <button class="btn sm ghost" data-action="edit-lesson" data-id="${lesson.id}">Edit</button>`
      : `<button class="btn sm green" data-action="log-lesson" data-student="${s.id}" data-time="${esc(slot.time || '')}" data-duration="${esc(slot.duration || '')}">Log class</button>
         <button class="btn sm ghost" data-action="quick-absent" data-student="${s.id}" data-time="${esc(slot.time || '')}">Absent</button>`;
    return `<div class="row"><span class="time-pill">${esc(fmtTime(slot.time) || '—')}</span>
      <a class="grow" href="#/student/${s.id}" style="color:inherit"><div class="title">${esc(s.name)}</div><div class="meta">${esc([s.grade, (s.subjects || []).join(', ')].filter(Boolean).join(' · '))}</div></a>
      <div class="actions">${right}</div></div>`;
  }).join('') + extra.map(l => `<div class="row"><span class="time-pill">${esc(fmtTime(l.time) || 'Extra')}</span>
      <div class="grow"><div class="title">${esc(studentName(l.studentId))}</div><div class="meta">${esc(l.subject || '')} · extra class</div></div>
      <div class="actions">${statusBadge(l.status)} <button class="btn sm ghost" data-action="edit-lesson" data-id="${l.id}">Edit</button></div></div>`).join('');

  const owedRows = owed.map(({ c, st, s }) => {
    const days = st.owedSince ? daysBetween(st.owedSince, today) : null;
    const since = st.owedSince ? (days <= 0 ? 'due today' : `overdue ${days} day${days === 1 ? '' : 's'} (since ${fmtDate(st.owedSince, { day: 'numeric', month: 'short' })})`) : '';
    const phone = s.guardianPhone || s.phone;
    const wa = waLink(phone, reminderText(s, c, st));
    return `<div class="row">${avatar(s)}
      <a class="grow" href="#/student/${s.id}" style="color:inherit"><div class="title">${esc(s.name)} <span class="badge red">${money(st.balance)}</span></div>
      <div class="meta">${esc(c.title || 'Contract')} · ${st.unpaidCycles > 1 ? `${st.unpaidCycles} cycles unpaid · ` : ''}${esc(since)}</div></a>
      <div class="actions">${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">Remind</a>` : `<button class="btn sm ghost" data-action="copy-reminder" data-contract="${c.id}">Copy reminder</button>`}
      <button class="btn sm primary" data-action="add-payment" data-student="${s.id}" data-contract="${c.id}">Record payment</button></div></div>`;
  }).join('');

  const soonRows = soon.map(({ c, st, s }) => `<div class="row">${avatar(s)}<div class="grow"><div class="title">${esc(s.name)}</div>
      <div class="meta">${esc(c.title || 'Contract')} · ${money(c.fee)} · ${esc(describeNextDue(c, st))}</div></div></div>`).join('');

  const recent = [...db.lessons].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).slice(0, 5);
  const backupDays = db.settings.lastBackup ? daysBetween(db.settings.lastBackup.slice(0, 10), today) : null;
  const backupNotice = (backupDays === null || backupDays > 14) && db.lessons.length >= 5
    ? `<div class="notice warn">Your data only lives in this browser. ${backupDays === null ? 'You haven\'t made a backup yet.' : `Last backup was ${backupDays} days ago.`} <a href="#" data-action="backup">Download a backup</a></div>` : '';

  return `<div class="page-head"><div><h1>Hello${greetName}</h1><div class="sub">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
      <div class="actions"><button class="btn primary" data-action="log-lesson">+ Log class</button><button class="btn" data-action="add-payment">+ Payment</button></div></div>
    ${backupNotice}
    <div class="stats">
      <div class="card stat"><div class="label">Active students</div><div class="value">${active.length}</div></div>
      <div class="card stat"><div class="label">Classes this month</div><div class="value">${taughtMonth}</div></div>
      <div class="card stat"><div class="label">Collected this month</div><div class="value pos">${money(income)}</div></div>
      <div class="card stat"><div class="label">Outstanding</div><div class="value ${outstanding > 0 ? 'neg' : ''}">${money(outstanding)}</div><div class="hint">${owed.length} payment${owed.length === 1 ? '' : 's'} due</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-head"><h2>Today's classes</h2><span class="muted small">${scheduled.length} scheduled</span></div>
        <div class="list">${todayRows || '<div class="empty">No classes scheduled today.</div>'}</div></div>
      <div class="card"><div class="card-head"><h2>Payments due</h2>${outstanding > 0 ? `<span class="badge red">${money(outstanding)}</span>` : ''}</div>
        <div class="list">${owedRows || '<div class="empty">Nobody owes you anything right now.</div>'}</div>
        ${soonRows ? `<h3 class="muted small" style="margin-top:14px;text-transform:uppercase;letter-spacing:.04em">Coming up</h3><div class="list">${soonRows}</div>` : ''}</div>
    </div>
    <div class="section"><h2>Recent classes <a class="small" href="#/classes">See all</a></h2>
      ${recent.length ? recent.map(lessonCard).join('') : '<div class="card empty">No classes logged yet.</div>'}</div>`;
}

function lessonCard(l, opts) {
  opts = opts || {};
  const c = l.contractId && getContract(l.contractId);
  return `<div class="lesson"><div class="top"><div>
      <div class="title"><b>${opts.hideStudent ? esc(l.subject || 'Class') : `<a href="#/student/${l.studentId}">${esc(studentName(l.studentId))}</a>${l.subject ? ' · ' + esc(l.subject) : ''}`}</b></div>
      <div class="meta muted small">${opts.hideDate ? '' : esc(fmtDate(l.date, { weekday: 'short', day: 'numeric', month: 'short' })) + ' · '}${l.time ? esc(fmtTime(l.time)) + ' · ' : ''}${l.duration ? esc(l.duration) + ' min' : ''}${c ? ' · ' + esc(c.title) : ''}</div></div>
      <div class="actions">${statusBadge(l.status)}<button class="btn sm ghost" data-action="edit-lesson" data-id="${l.id}" aria-label="Edit class">Edit</button></div></div>
    ${l.topics ? `<div class="topics">${esc(l.topics)}</div>` : ''}
    ${l.homework ? `<div class="hw"><b>Homework:</b> ${esc(l.homework)}</div>` : ''}
    ${l.notes ? `<div class="hw"><b>Notes:</b> ${esc(l.notes)}</div>` : ''}</div>`;
}

// ── Students ─────────────────────────────────────────────────
function viewStudents() {
  return `<div class="page-head"><div><h1>Students</h1><div class="sub">${db.students.filter(s => s.active !== false).length} active</div></div>
      <button class="btn primary" data-action="add-student">+ Add student</button></div>
    <div class="toolbar"><input type="search" id="student-search" placeholder="Search name, class, subject…" value="${esc(ui.studentSearch)}">
      <div class="seg" id="student-filter">${['active', 'archived', 'all'].map(f => `<button data-f="${f}" class="${ui.studentFilter === f ? 'active' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div></div>
    <div class="card"><div class="list" id="student-list">${studentListHTML()}</div></div>`;
}
function studentListHTML() {
  const q = ui.studentSearch.toLowerCase();
  const list = db.students
    .filter(s => ui.studentFilter === 'all' || (ui.studentFilter === 'active' ? s.active !== false : s.active === false))
    .filter(s => !q || [s.name, s.grade, (s.subjects || []).join(' '), s.guardianName].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return `<div class="empty">${db.students.length ? 'No students match.' : 'No students yet. Add your first one!'}</div>`;
  return list.map(s => `<a class="row" href="#/student/${s.id}">${avatar(s)}<div class="grow">
      <div class="title">${esc(s.name)}${s.active === false ? ' <span class="badge">Archived</span>' : ''}</div>
      <div class="meta">${esc([s.grade, (s.subjects || []).join(', ')].filter(Boolean).join(' · '))}</div>
      <div class="meta">${esc(scheduleSummary(s))}</div></div>${studentContracts(s.id).length ? balanceBadge(studentBalance(s.id)) : '<span class="badge">No contract</span>'}</a>`).join('');
}
function bindStudents() {
  const input = document.getElementById('student-search');
  input.addEventListener('input', () => { ui.studentSearch = input.value; document.getElementById('student-list').innerHTML = studentListHTML(); });
  document.getElementById('student-filter').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    ui.studentFilter = b.dataset.f; render();
  });
}

function viewStudent(s) {
  const contracts = studentContracts(s.id).sort((a, b) => (a.status === 'ended') - (b.status === 'ended') || b.startDate.localeCompare(a.startDate));
  const lessons = studentLessons(s.id);
  const payments = studentPayments(s.id);
  const docs = db.docs.filter(d => d.studentId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const taught = lessons.filter(l => l.status === 'taught').length;
  const paidTotal = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const phoneLinks = p => p ? `<a href="tel:${esc(p)}">${esc(p)}</a>${waLink(p, '') ? ` · <a href="${waLink(p, '')}" target="_blank" rel="noopener">WhatsApp</a>` : ''}` : '';

  const contractCards = contracts.map(c => {
    const st = contractStatus(c);
    const pct = Math.round(st.progress * 100);
    const progressText = c.cycleType === 'classes'
      ? `${st.taught - st.completed * c.cycleLength} of ${c.cycleLength} classes in this cycle · ${st.taught} taught total`
      : `${pct}% of current cycle`;
    return `<div class="card"><div class="card-head"><div><h3>${esc(c.title || 'Contract')}</h3>
        <div class="muted small">${money(c.fee)} ${esc(cycleLabel(c))} · ${c.billing === 'start' ? 'paid in advance' : 'paid after each cycle'} · since ${esc(fmtDate(c.startDate))}${c.status === 'ended' && c.endDate ? ` · ended ${esc(fmtDate(c.endDate))}` : ''}</div></div>
        ${c.status === 'ended' ? '<span class="badge">Ended</span>' : balanceBadge(st.balance)}</div>
      ${c.status !== 'ended' && st.started ? `<div class="progress ${st.nextDue && st.nextDue.kind === 'classes' ? (st.remaining <= 2 ? 'warn' : '') : (st.remaining <= 3 ? 'warn' : '')}"><span style="width:${pct}%"></span></div><div class="muted small">${esc(progressText)}</div>` : ''}
      <div class="small" style="margin-top:6px">${esc(describeNextDue(c, st))}</div>
      <dl class="kv small" style="margin-top:10px"><dt>Billed so far</dt><dd>${money(st.billed)} (${st.billedCycles} cycle${st.billedCycles === 1 ? '' : 's'})</dd><dt>Paid</dt><dd>${money(st.paid)}</dd></dl>
      ${c.notes ? `<p class="muted small" style="margin-top:6px">${esc(c.notes)}</p>` : ''}
      <div class="actions" style="margin-top:12px"><button class="btn sm primary" data-action="add-payment" data-student="${s.id}" data-contract="${c.id}">Record payment</button>
        <button class="btn sm" data-action="edit-contract" data-id="${c.id}">Edit</button>
        ${c.status === 'ended' ? `<button class="btn sm ghost" data-action="reopen-contract" data-id="${c.id}">Reopen</button>` : `<button class="btn sm ghost" data-action="end-contract" data-id="${c.id}">End contract</button>`}
        <button class="btn sm ghost" data-action="delete-contract" data-id="${c.id}">Delete</button></div></div>`;
  }).join('');

  return `<div class="page-head"><div style="display:flex;gap:14px;align-items:center;min-width:0">${avatar(s, 56)}<div style="min-width:0"><h1>${esc(s.name)}${s.active === false ? ' <span class="badge">Archived</span>' : ''}</h1>
      <div class="sub">${esc([s.grade, s.curriculum, (s.subjects || []).join(', ')].filter(Boolean).join(' · '))}</div></div></div>
      <div class="actions"><button class="btn primary" data-action="log-lesson" data-student="${s.id}">+ Log class</button>
        <button class="btn" data-action="add-payment" data-student="${s.id}">+ Payment</button>
        <button class="btn" data-action="edit-student" data-id="${s.id}">Edit</button></div></div>
    <div class="stats">
      <div class="card stat"><div class="label">Balance</div><div class="value ${studentBalance(s.id) > 0 ? 'neg' : 'pos'}">${money(Math.abs(studentBalance(s.id)))}</div><div class="hint">${studentBalance(s.id) > 0.005 ? 'owed to you' : studentBalance(s.id) < -0.005 ? 'paid in advance' : 'all settled'}</div></div>
      <div class="card stat"><div class="label">Classes taught</div><div class="value">${taught}</div><div class="hint">${lessons.filter(l => l.status === 'absent').length} absent</div></div>
      <div class="card stat"><div class="label">Total paid</div><div class="value">${money(paidTotal)}</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><h2>Details</h2><dl class="kv">
        <dt>Schedule</dt><dd>${esc(scheduleSummary(s))}</dd>
        ${s.phone ? `<dt>Student</dt><dd>${phoneLinks(s.phone)}</dd>` : ''}
        ${s.guardianName || s.guardianPhone ? `<dt>Guardian</dt><dd>${esc(s.guardianName || '')}${s.guardianName && s.guardianPhone ? ' · ' : ''}${phoneLinks(s.guardianPhone)}</dd>` : ''}
        ${s.address ? `<dt>Address</dt><dd>${esc(s.address)}</dd>` : ''}
        ${s.notes ? `<dt>Notes</dt><dd style="white-space:pre-wrap">${esc(s.notes)}</dd>` : ''}
      </dl></div>
      <div class="card"><h2>AI for ${esc(s.name.split(' ')[0])}</h2>
        <p class="muted small" style="margin-bottom:12px">Uses this student's class, subjects and the topics you logged. Their name and contact details are never sent.</p>
        <div class="actions"><a class="btn" href="#/ai?tool=plan&student=${s.id}">Lesson plan</a><a class="btn" href="#/ai?tool=exam&student=${s.id}">Exam from recent classes</a><a class="btn" href="#/ai?tool=worksheet&student=${s.id}">Worksheet</a></div>
        ${docs.length ? `<div class="list" style="margin-top:10px">${docs.slice(0, 5).map(docRow).join('')}</div>` : ''}</div>
    </div>
    <div class="section"><h2>Fee contracts <button class="btn sm" data-action="add-contract" data-student="${s.id}">+ Add contract</button></h2>
      ${contractCards ? `<div class="grid-2">${contractCards}</div>` : `<div class="card empty">No contract yet. Add one to track fees (e.g. ${money(3000)} every 12 classes, or monthly).</div>`}</div>
    <div class="section"><h2>Classes <a class="small" href="#/classes?student=${s.id}">Open in class log</a></h2>
      ${lessons.length ? lessons.slice(0, 15).map(l => lessonCard(l, { hideStudent: true })).join('') + (lessons.length > 15 ? `<a class="btn sm" href="#/classes?student=${s.id}">Show all ${lessons.length}</a>` : '') : '<div class="card empty">No classes logged yet.</div>'}</div>
    <div class="section"><h2>Exams</h2><div class="card"><div class="list">${(() => {
      const ats = db.attempts.filter(a => a.studentId === s.id).sort((a, b) => b.startedAt - a.startedAt);
      return ats.length ? ats.map(attemptRow).join('') : '<div class="empty">No exams yet. Open an exam paper (AI → Saved) and press Start exam.</div>';
    })()}</div></div></div>
    <div class="section"><h2>Payments</h2><div class="card"><div class="list">${payments.length ? payments.map(paymentRow).join('') : '<div class="empty">No payments yet.</div>'}</div></div></div>
    <div class="section actions">
      <button class="btn ghost" data-action="toggle-archive" data-id="${s.id}">${s.active === false ? 'Unarchive student' : 'Archive student'}</button>
      <button class="btn danger" data-action="delete-student" data-id="${s.id}">Delete student</button></div>`;
}

function paymentRow(p) {
  const c = p.contractId && getContract(p.contractId);
  return `<div class="row"><div class="grow"><div class="title">${money(p.amount)} <span class="muted small">· ${esc(p.method || 'Cash')}</span></div>
    <div class="meta">${esc(fmtDate(p.date))}${c ? ' · ' + esc(c.title) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
    <button class="btn sm ghost" data-action="edit-payment" data-id="${p.id}">Edit</button></div>`;
}

// ── Student form ─────────────────────────────────────────────
function scheduleRowHTML(slot) {
  slot = slot || { day: 6, time: '17:00', duration: 60 };
  return `<div class="sched-row"><select name="sched-day" aria-label="Day">${WEEKDAYS.map((d, i) => `<option value="${i}"${Number(slot.day) === i ? ' selected' : ''}>${d}</option>`).join('')}</select>
    <input type="time" name="sched-time" value="${esc(slot.time || '')}" aria-label="Time">
    <input type="number" name="sched-duration" min="10" step="5" value="${esc(slot.duration || 60)}" aria-label="Minutes" placeholder="min">
    <button type="button" class="icon-btn" data-remove-sched aria-label="Remove">&times;</button></div>`;
}

function openStudentForm(s) {
  const isNew = !s;
  s = s || { schedule: [] };
  openModal(isNew ? 'Add student' : 'Edit student', `<form class="form" id="f-student">
      <label class="field">Name *<input name="name" required value="${esc(s.name || '')}" autocomplete="off"></label>
      <div class="form-row"><label class="field">Class / Grade<input name="grade" value="${esc(s.grade || '')}" placeholder="e.g. Class 8, HSC 1st year"></label>
        <label class="field">Curriculum / Board<input name="curriculum" value="${esc(s.curriculum || '')}" placeholder="e.g. National, English version, O Level"></label></div>
      <label class="field">Subjects<input name="subjects" value="${esc((s.subjects || []).join(', '))}" placeholder="Math, Physics (comma separated)"></label>
      <div class="form-row"><label class="field">Student phone<input name="phone" type="tel" value="${esc(s.phone || '')}"></label>
        <label class="field">Guardian name<input name="guardianName" value="${esc(s.guardianName || '')}"></label>
        <label class="field">Guardian phone<input name="guardianPhone" type="tel" value="${esc(s.guardianPhone || '')}"></label></div>
      <label class="field">Address<input name="address" value="${esc(s.address || '')}"></label>
      <div class="field"><span class="muted small" style="font-weight:500">Weekly schedule (day · time · minutes)</span>
        <div id="sched-rows" class="grid" style="gap:8px;margin-top:6px">${(s.schedule || []).map(scheduleRowHTML).join('')}</div>
        <div><button type="button" class="btn sm" id="add-sched" style="margin-top:8px">+ Add day</button></div></div>
      <label class="field">Notes<textarea name="notes" placeholder="Strengths, weak areas, exam dates…">${esc(s.notes || '')}</textarea></label>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${isNew ? 'Add student' : 'Save'}</button></div></form>`,
  body => {
    const rows = body.querySelector('#sched-rows');
    body.querySelector('#add-sched').onclick = () => {
      const last = rows.lastElementChild;
      const slot = last ? { day: (Number(last.querySelector('[name=sched-day]').value) + 2) % 7, time: last.querySelector('[name=sched-time]').value, duration: last.querySelector('[name=sched-duration]').value } : null;
      rows.insertAdjacentHTML('beforeend', scheduleRowHTML(slot));
    };
    rows.addEventListener('click', e => { if (e.target.closest('[data-remove-sched]')) e.target.closest('.sched-row').remove(); });
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = formData(e.target);
      if (!f.name) return;
      const schedule = [...rows.querySelectorAll('.sched-row')].map(r => ({
        day: Number(r.querySelector('[name=sched-day]').value),
        time: r.querySelector('[name=sched-time]').value,
        duration: Number(r.querySelector('[name=sched-duration]').value) || 60,
      }));
      const data = {
        name: f.name, grade: f.grade, curriculum: f.curriculum,
        subjects: f.subjects.split(',').map(x => x.trim()).filter(Boolean),
        phone: f.phone, guardianName: f.guardianName, guardianPhone: f.guardianPhone,
        address: f.address, notes: f.notes, schedule,
      };
      if (isNew) {
        const st = { id: uid(), active: true, createdAt: new Date().toISOString(), ...data };
        db.students.push(st);
        if (!save()) return;
        closeModal();
        location.hash = `#/student/${st.id}`;
        render();
        openContractForm(st.id, null, true);
      } else {
        const cur = liveRecord('students', s);
        if (!cur) { closeModal(); return render(); }
        Object.assign(cur, data);
        if (!save()) return; closeModal(); render();
        toast('Student saved');
      }
    };
  });
}

// ── Contract form ────────────────────────────────────────────
function openContractForm(studentId, c, fromNewStudent) {
  const isNew = !c;
  const s = getStudent(studentId);
  c = c || { title: (s && s.subjects && s.subjects.length ? s.subjects.join(' & ') : 'Tuition') , fee: '', cycleType: 'classes', cycleLength: 12, startDate: todayISO(), billing: 'end' };
  openModal(isNew ? `Fee contract${s ? ' for ' + s.name : ''}` : 'Edit contract', `<form class="form" id="f-contract">
      ${fromNewStudent ? '<div class="notice">Student added. Now set how and when they pay — or skip and add it later.</div>' : ''}
      <label class="field">Title<input name="title" value="${esc(c.title || '')}" placeholder="e.g. Math & Physics"></label>
      <div class="form-row"><label class="field">Fee per cycle (${esc(db.settings.currency)}) *<input name="fee" type="number" min="0" step="any" required value="${esc(c.fee)}"></label>
        <label class="field">Paid every<input name="cycleLength" type="number" min="1" step="1" required value="${esc(c.cycleLength)}"></label>
        <label class="field">&nbsp;<select name="cycleType">${Object.keys(CYCLE_TYPES).map(k => `<option value="${k}"${c.cycleType === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label></div>
      <div class="form-row"><label class="field">Start date<input name="startDate" type="date" required value="${esc(c.startDate)}"></label>
        <label class="field">When is it paid?<select name="billing"><option value="end"${c.billing !== 'start' ? ' selected' : ''}>After each cycle</option><option value="start"${c.billing === 'start' ? ' selected' : ''}>In advance (start of cycle)</option></select></label></div>
      <div class="help" id="contract-preview"></div>
      <label class="field">Notes<textarea name="notes" placeholder="e.g. Exam month fee is higher">${esc(c.notes || '')}</textarea></label>
      <div class="form-actions"><button type="button" class="btn" data-close>${fromNewStudent ? 'Skip' : 'Cancel'}</button><button class="btn primary">${isNew ? 'Save contract' : 'Save'}</button></div></form>`,
  body => {
    const form = body.querySelector('form');
    const preview = () => {
      const f = formData(form);
      const n = Number(f.cycleLength) || 1;
      const label = cycleLabel({ cycleType: f.cycleType, cycleLength: n });
      let extra = f.cycleType === 'classes' ? ' Only classes marked "Taught" count toward the cycle.' : '';
      if (f.cycleType !== 'classes' && f.startDate) {
        const first = f.cycleType === 'months' ? addMonths(f.startDate, n) : addDays(f.startDate, n);
        extra = f.billing === 'start' ? ` First fee due ${fmtDate(f.startDate)}, next on ${fmtDate(first)}.` : ` First fee due ${fmtDate(first)}.`;
      }
      body.querySelector('#contract-preview').textContent = `${money(f.fee || 0)} ${label}, ${f.billing === 'start' ? 'paid in advance' : 'paid after each cycle'}.${extra}`;
    };
    form.addEventListener('input', preview);
    preview();
    form.onsubmit = e => {
      e.preventDefault();
      const f = formData(form);
      const data = { title: f.title || 'Tuition', fee: Number(f.fee) || 0, cycleType: f.cycleType, cycleLength: Math.max(1, Math.round(Number(f.cycleLength) || 1)), startDate: f.startDate, billing: f.billing, notes: f.notes };
      if (isNew) {
        const nc = { id: uid(), studentId, status: 'active', createdAt: new Date().toISOString(), ...data };
        db.contracts.push(nc);
        // Link this student's unassigned classes since the start date.
        db.lessons.forEach(l => { if (l.studentId === studentId && !l.contractId && l.date >= nc.startDate) l.contractId = nc.id; });
      } else {
        const cur = liveRecord('contracts', c);
        if (!cur) { closeModal(); return render(); }
        Object.assign(cur, data);
      }
      if (!save()) return; closeModal(); render();
      toast('Contract saved');
    };
  });
}

// ── Lesson form ──────────────────────────────────────────────
function openLessonForm(opts) {
  const l = opts.lesson;
  const isNew = !l;
  const studentId = l ? l.studentId : (opts.studentId || '');
  const s = getStudent(studentId);
  const d = l || {
    studentId, date: opts.date || todayISO(), time: opts.time || nowTime(), duration: opts.duration || (s && s.schedule && s.schedule[0] && s.schedule[0].duration) || 60,
    subject: s && s.subjects ? s.subjects[0] || '' : '', status: opts.status || 'taught', contractId: defaultContractFor(studentId, opts.date), topics: '', homework: '', notes: '',
  };
  if (!db.students.length) { toast('Add a student first'); return openStudentForm(); }
  openModal(isNew ? 'Log class' : 'Edit class', `<form class="form" id="f-lesson">
      <label class="field">Student *<select name="studentId" required>${studentOptions(d.studentId, true)}</select></label>
      <div class="form-row"><label class="field">Date<input type="date" name="date" required value="${esc(d.date)}"></label>
        <label class="field">Time<input type="time" name="time" value="${esc(d.time || '')}"></label>
        <label class="field">Minutes<input type="number" name="duration" min="5" step="5" value="${esc(d.duration || '')}"></label></div>
      <div class="field"><span class="muted small" style="font-weight:500">Status</span><div class="checks" style="margin-top:4px">
        ${['taught', 'absent', 'cancelled'].map(v => `<label class="check"><input type="radio" name="status" value="${v}"${d.status === v ? ' checked' : ''}> ${v === 'taught' ? 'Taught' : v === 'absent' ? 'Student absent' : 'Cancelled'}</label>`).join('')}</div></div>
      <div class="form-row"><label class="field">Subject<input name="subject" list="subject-list" value="${esc(d.subject || '')}"><datalist id="subject-list"></datalist></label>
        <label class="field" id="contract-field">Counts toward<select name="contractId"></select></label></div>
      <label class="field">What did you teach?<textarea name="topics" rows="3" placeholder="e.g. Algebra: factorisation of quadratics, exercise 4.2 Q1–10">${esc(d.topics || '')}</textarea></label>
      <label class="field">Homework<input name="homework" value="${esc(d.homework || '')}" placeholder="e.g. Ex 4.2 Q11–20"></label>
      <label class="field">Notes<input name="notes" value="${esc(d.notes || '')}" placeholder="How did it go? Weak points?"></label>
      <div class="form-actions">${isNew ? '' : '<button type="button" class="btn danger left" id="del-lesson">Delete</button>'}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${isNew ? 'Save class' : 'Save'}</button></div></form>`,
  body => {
    const form = body.querySelector('form');
    const sel = form.studentId;
    const syncStudent = (initial) => {
      const st = getStudent(sel.value);
      body.querySelector('#subject-list').innerHTML = (st && st.subjects || []).map(x => `<option value="${esc(x)}">`).join('');
      if (!initial && st) {
        form.subject.value = (st.subjects && st.subjects[0]) || '';
        const slot = (st.schedule || []).find(x => Number(x.day) === parseISO(form.date.value).getDay());
        if (slot) { form.time.value = slot.time || form.time.value; form.duration.value = slot.duration || form.duration.value; }
      }
      const cid = initial ? d.contractId : defaultContractFor(sel.value, form.date.value);
      const opts = contractOptions(sel.value, cid, true, form.date.value);
      form.contractId.innerHTML = opts;
      body.querySelector('#contract-field').style.display = st && studentContracts(st.id).length ? '' : 'none';
    };
    sel.addEventListener('change', () => syncStudent(false));
    if (isNew) form.date.addEventListener('change', () => {
      form.contractId.innerHTML = contractOptions(sel.value, defaultContractFor(sel.value, form.date.value), true, form.date.value);
    });
    syncStudent(true);
    if (!isNew) body.querySelector('#del-lesson').onclick = () => {
      const copy = { ...l };
      db.lessons = db.lessons.filter(x => x.id !== l.id); if (!save()) return; closeModal(); render();
      toast('Class deleted', null, { label: 'Undo', fn: () => { db.lessons.push(copy); if (!save()) return; render(); } });
    };
    form.onsubmit = e => {
      e.preventDefault();
      const f = formData(form);
      if (!f.studentId) return;
      const data = { studentId: f.studentId, date: f.date, time: f.time, duration: Number(f.duration) || null, status: f.status || 'taught', subject: f.subject, contractId: f.contractId || null, topics: f.topics, homework: f.homework, notes: f.notes };
      if (isNew) db.lessons.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
      else {
        const cur = liveRecord('lessons', l);
        if (!cur) { closeModal(); return render(); }
        Object.assign(cur, data);
      }
      if (!save()) return; closeModal(); render();
      toast(isNew ? 'Class logged' : 'Class saved');
      if (isNew && data.status === 'taught' && data.contractId) notifyCycleComplete(data.contractId);
    };
  });
}
function nowTime() { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes() - (d.getMinutes() % 5))}`; }
function notifyCycleComplete(contractId) {
  const c = getContract(contractId);
  if (!c || c.cycleType !== 'classes') return;
  const st = contractStatus(c);
  if (st.taught > 0 && st.taught % c.cycleLength === 0) {
    setTimeout(() => toast(`${studentName(c.studentId)} completed ${c.cycleLength} classes — fee ${c.billing === 'start' ? 'for the next cycle ' : ''}is due.`), 400);
  }
}

// ── Payment & expense forms ──────────────────────────────────
const PAY_METHODS = ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank', 'Other'];
function openPaymentForm(opts) {
  const p = opts.payment;
  const isNew = !p;
  const studentId = p ? p.studentId : (opts.studentId || '');
  let contractId = p ? p.contractId : (opts.contractId || defaultContractFor(studentId));
  const suggest = cid => {
    const c = cid && getContract(cid);
    if (!c) return '';
    const st = contractStatus(c);
    return st.balance > 0 ? Math.round(st.balance * 100) / 100 : c.fee;
  };
  const d = p || { studentId, contractId, amount: suggest(contractId), date: todayISO(), method: 'Cash', note: '' };
  if (!db.students.length) { toast('Add a student first'); return openStudentForm(); }
  openModal(isNew ? 'Record payment' : 'Edit payment', `<form class="form" id="f-payment">
      <label class="field">Student *<select name="studentId" required>${studentOptions(d.studentId, true)}</select></label>
      <label class="field" id="pay-contract">Contract<select name="contractId"></select></label>
      <div class="form-row"><label class="field">Amount (${esc(db.settings.currency)}) *<input name="amount" type="number" min="0" step="any" required value="${esc(d.amount)}"></label>
        <label class="field">Date<input name="date" type="date" required value="${esc(d.date)}"></label>
        <label class="field">Method<select name="method">${PAY_METHODS.map(m => `<option${m === d.method ? ' selected' : ''}>${m}</option>`).join('')}</select></label></div>
      <label class="field">Note<input name="note" value="${esc(d.note || '')}" placeholder="e.g. September fee"></label>
      <div class="help" id="pay-hint"></div>
      <div class="form-actions">${isNew ? '' : '<button type="button" class="btn danger left" id="del-payment">Delete</button>'}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save payment</button></div></form>`,
  body => {
    const form = body.querySelector('form');
    const hint = () => {
      const c = form.contractId.value && getContract(form.contractId.value);
      if (!c) { body.querySelector('#pay-hint').textContent = ''; return; }
      const st = contractStatus(c);
      body.querySelector('#pay-hint').textContent = st.balance > 0.005 ? `Currently owed on this contract: ${money(st.balance)}` : st.balance < -0.005 ? `Already ${money(-st.balance)} paid in advance.` : 'Nothing owed right now; this will count as advance.';
    };
    const sync = initial => {
      const sid = form.studentId.value;
      const cid = initial ? d.contractId : defaultContractFor(sid, form.date.value);
      form.contractId.innerHTML = contractOptions(sid, cid, true, form.date.value);
      body.querySelector('#pay-contract').style.display = sid && studentContracts(sid).length ? '' : 'none';
      if (!initial && isNew) form.amount.value = suggest(form.contractId.value);
      hint();
    };
    form.studentId.addEventListener('change', () => sync(false));
    form.contractId.addEventListener('change', () => { if (isNew) form.amount.value = suggest(form.contractId.value); hint(); });
    sync(true);
    if (!isNew) body.querySelector('#del-payment').onclick = () => {
      const copy = { ...p };
      db.payments = db.payments.filter(x => x.id !== p.id); if (!save()) return; closeModal(); render();
      toast('Payment deleted', null, { label: 'Undo', fn: () => { db.payments.push(copy); if (!save()) return; render(); } });
    };
    form.onsubmit = e => {
      e.preventDefault();
      const f = formData(form);
      const data = { studentId: f.studentId, contractId: f.contractId || null, amount: Number(f.amount) || 0, date: f.date, method: f.method, note: f.note };
      if (isNew) db.payments.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
      else {
        const cur = liveRecord('payments', p);
        if (!cur) { closeModal(); return render(); }
        Object.assign(cur, data);
      }
      if (!save()) return; closeModal(); render();
      toast(`Payment of ${money(data.amount)} saved`);
    };
  });
}

const EXPENSE_CATS = ['Transport', 'Books & materials', 'Printing', 'Phone & internet', 'Food', 'Other'];
function openExpenseForm(x) {
  const isNew = !x;
  const d = x || { amount: '', date: todayISO(), category: 'Transport', note: '' };
  openModal(isNew ? 'Add expense' : 'Edit expense', `<form class="form">
      <div class="form-row"><label class="field">Amount (${esc(db.settings.currency)}) *<input name="amount" type="number" min="0" step="any" required value="${esc(d.amount)}"></label>
        <label class="field">Date<input name="date" type="date" required value="${esc(d.date)}"></label></div>
      <label class="field">Category<select name="category">${EXPENSE_CATS.map(c => `<option${c === d.category ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Note<input name="note" value="${esc(d.note || '')}" placeholder="e.g. Rickshaw to Dhanmondi"></label>
      <div class="form-actions">${isNew ? '' : '<button type="button" class="btn danger left" id="del-exp">Delete</button>'}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`,
  body => {
    const form = body.querySelector('form');
    if (!isNew) body.querySelector('#del-exp').onclick = () => {
      const copy = { ...x };
      db.expenses = db.expenses.filter(e => e.id !== x.id); if (!save()) return; closeModal(); render();
      toast('Expense deleted', null, { label: 'Undo', fn: () => { db.expenses.push(copy); if (!save()) return; render(); } });
    };
    form.onsubmit = e => {
      e.preventDefault();
      const f = formData(form);
      const data = { amount: Number(f.amount) || 0, date: f.date, category: f.category, note: f.note };
      if (isNew) db.expenses.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
      else {
        const cur = liveRecord('expenses', x);
        if (!cur) { closeModal(); return render(); }
        Object.assign(cur, data);
      }
      if (!save()) return; closeModal(); render();
      toast('Expense saved');
    };
  });
}

// ── Classes (lesson log) ─────────────────────────────────────
function viewClasses() {
  const list = db.lessons
    .filter(l => !ui.classesStudent || l.studentId === ui.classesStudent)
    .filter(l => !ui.classesMonth || monthKey(l.date) === ui.classesMonth)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const groups = {};
  for (const l of list) (groups[l.date] = groups[l.date] || []).push(l);
  const taught = list.filter(l => l.status === 'taught');
  const minutes = taught.reduce((a, l) => a + (Number(l.duration) || 0), 0);
  return `<div class="page-head"><div><h1>Class log</h1><div class="sub">What you taught, day by day</div></div>
      <button class="btn primary" data-action="log-lesson" data-student="${esc(ui.classesStudent)}">+ Log class</button></div>
    <div class="toolbar"><select data-filter="classesStudent" aria-label="Student">${studentOptions(ui.classesStudent, true, 'All students')}</select>
      <input type="month" data-filter="classesMonth" value="${esc(ui.classesMonth)}" aria-label="Month">
      ${ui.classesMonth ? '<button class="btn ghost" data-action="classes-all-time">All time</button>' : ''}</div>
    <div class="stats"><div class="card stat"><div class="label">Classes taught</div><div class="value">${taught.length}</div><div class="hint">${ui.classesMonth ? esc(fmtMonth(ui.classesMonth)) : 'all time'}</div></div>
      <div class="card stat"><div class="label">Hours</div><div class="value">${Math.round(minutes / 6) / 10}</div></div>
      <div class="card stat"><div class="label">Absent / cancelled</div><div class="value">${list.length - taught.length}</div></div></div>
    ${Object.keys(groups).length ? Object.keys(groups).map(date => `<div class="day-group"><h3>${esc(fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>${groups[date].map(l => lessonCard(l, { hideDate: true })).join('')}</div>`).join('')
      : '<div class="card empty">No classes for this filter.</div>'}`;
}
function bindFilters() {
  view.querySelectorAll('[data-filter]').forEach(el => el.addEventListener('change', () => { ui[el.dataset.filter] = el.value; render(); }));
}

// ── Money ────────────────────────────────────────────────────
function viewMoney() {
  const m = ui.moneyMonth || monthKey(todayISO());
  const pays = db.payments.filter(p => monthKey(p.date) === m);
  const exps = db.expenses.filter(x => monthKey(x.date) === m);
  const income = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
  const spent = exps.reduce((a, x) => a + Number(x.amount || 0), 0);
  const dues = allDues().filter(x => x.st.balance > 0.005);
  const outstanding = dues.reduce((a, x) => a + x.st.balance, 0);
  const snap = moneySnapshot();

  const months = [];
  for (let i = 5; i >= 0; i--) months.push(monthKey(addMonths(m + '-01', -i)));
  const series = months.map(k => ({
    k,
    inc: db.payments.filter(p => monthKey(p.date) === k).reduce((a, p) => a + Number(p.amount || 0), 0),
    exp: db.expenses.filter(x => monthKey(x.date) === k).reduce((a, x) => a + Number(x.amount || 0), 0),
  }));
  const max = Math.max(1, ...series.map(x => Math.max(x.inc, x.exp)));

  const tx = [
    ...pays.map(p => ({ date: p.date, html: `<div class="row"><div class="grow"><div class="title">${esc(studentName(p.studentId))}</div><div class="meta">${esc(fmtDate(p.date, { day: 'numeric', month: 'short' }))} · ${esc(p.method || 'Cash')}${p.note ? ' · ' + esc(p.note) : ''}</div></div><span class="pos nowrap">+${money(p.amount)}</span><button class="btn sm ghost" data-action="edit-payment" data-id="${p.id}">Edit</button></div>` })),
    ...exps.map(x => ({ date: x.date, html: `<div class="row"><div class="grow"><div class="title">${esc(x.category)}</div><div class="meta">${esc(fmtDate(x.date, { day: 'numeric', month: 'short' }))}${x.note ? ' · ' + esc(x.note) : ''}</div></div><span class="neg nowrap">-${money(x.amount)}</span><button class="btn sm ghost" data-action="edit-expense" data-id="${x.id}">Edit</button></div>` })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const perStudent = {};
  for (const p of pays) perStudent[p.studentId] = (perStudent[p.studentId] || 0) + Number(p.amount || 0);
  const byCat = {};
  for (const x of exps) byCat[x.category] = (byCat[x.category] || 0) + Number(x.amount || 0);

  return `<div class="page-head"><div><h1>Money</h1><div class="sub">${esc(fmtMonth(m))}</div></div>
      <div class="actions"><button class="btn primary" data-action="add-payment">+ Payment</button><button class="btn" data-action="add-expense">+ Expense</button><button class="btn ghost" data-action="export-csv">Export CSV</button></div></div>
    <div class="toolbar"><input type="month" data-filter="moneyMonth" value="${esc(m)}" aria-label="Month"></div>
    <div class="stats">
      <div class="card stat"><div class="label">Income</div><div class="value pos">${money(income)}</div><div class="hint">${pays.length} payment${pays.length === 1 ? '' : 's'}</div></div>
      <div class="card stat"><div class="label">Expenses</div><div class="value neg">${money(spent)}</div></div>
      <div class="card stat"><div class="label">Net</div><div class="value">${money(income - spent)}</div></div>
      <div class="card stat"><div class="label">Outstanding now</div><div class="value ${outstanding > 0 ? 'neg' : ''}">${money(outstanding)}</div><div class="hint">across ${dues.length} contract${dues.length === 1 ? '' : 's'}</div></div>
    </div>
    <div class="grid-2 section">${moneyPictureHTML(snap)}${goalsCardHTML(snap)}</div>
    ${moneyAIHTML(snap)}
    <div class="grid-2 section">
      <div class="card"><div class="card-head"><h2>Last 6 months</h2><div class="legend"><span><i style="background:var(--green)"></i>Income</span><span><i style="background:var(--red)"></i>Expenses</span></div></div>
        <div class="bars">${series.map(x => `<div class="bar-col" title="${esc(fmtMonth(x.k))}: +${esc(money(x.inc))} / -${esc(money(x.exp))}"><div class="bar-pair"><div class="bar" style="height:${(x.inc / max) * 100}%"></div><div class="bar exp" style="height:${(x.exp / max) * 100}%"></div></div><div class="bar-label">${esc(parseISO(x.k + '-01').toLocaleDateString(undefined, { month: 'short' }))}</div></div>`).join('')}</div></div>
      <div class="card"><h2>Who owes you</h2><div class="list">${dues.length ? dues.sort((a, b) => b.st.balance - a.st.balance).map(({ c, st, s }) => `<div class="row"><a class="grow" href="#/student/${s.id}" style="color:inherit"><div class="title">${esc(s.name)}</div><div class="meta">${esc(c.title)}${st.owedSince ? ' · since ' + esc(fmtDate(st.owedSince, { day: 'numeric', month: 'short' })) : ''}</div></a><span class="neg nowrap">${money(st.balance)}</span><button class="btn sm" data-action="add-payment" data-student="${s.id}" data-contract="${c.id}">Paid</button></div>`).join('') : '<div class="empty">Everyone is paid up.</div>'}</div></div>
    </div>
    <div class="grid-2 section">
      <div class="card"><h2>Income by student</h2><div class="list">${Object.keys(perStudent).length ? Object.entries(perStudent).sort((a, b) => b[1] - a[1]).map(([sid, v]) => `<div class="row"><div class="grow title">${esc(studentName(sid))}</div><span class="nowrap">${money(v)}</span></div>`).join('') : '<div class="empty">No income this month.</div>'}</div></div>
      <div class="card"><h2>Expenses by category</h2><div class="list">${Object.keys(byCat).length ? Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row"><div class="grow title">${esc(k)}</div><span class="nowrap">${money(v)}</span></div>`).join('') : '<div class="empty">No expenses this month.</div>'}</div></div>
    </div>
    <div class="section"><h2>Transactions</h2><div class="card"><div class="list">${tx.length ? tx.map(t => t.html).join('') : '<div class="empty">Nothing recorded this month.</div>'}</div></div></div>`;
}

function shortMonth(k) { return parseISO(k + '-01').toLocaleDateString(undefined, { month: 'short' }); }

function moneyPictureHTML(snap) {
  const basis = snap.basisPartial ? 'Based on this month so far.' : `Average of ${snap.basisMonths.map(shortMonth).join(', ')}.`;
  const rate = snap.avgIncome > 0 ? ` (${Math.round(snap.avgNet / snap.avgIncome * 100)}% of income)` : '';
  const row = (label, value, cls, hint) => `<div class="row"><div class="grow"><div class="title">${label}</div>${hint ? `<div class="meta">${hint}</div>` : ''}</div><span class="nowrap ${cls || ''}">${value}</span></div>`;
  return `<div class="card"><h2>Your typical month</h2><div class="list">
    ${row('Income', money(Math.round(snap.avgIncome)), 'pos')}
    ${row('Expenses', money(Math.round(snap.avgExpense)), 'neg')}
    ${row('Left over to save', money(Math.round(snap.avgNet)) + esc(rate), snap.avgNet < 0 ? 'neg' : '')}
    ${row('Expected from contracts', money(Math.round(snap.expected.total)), '', `Estimate from ${snap.expected.count} running contract${snap.expected.count === 1 ? '' : 's'}`)}
    ${row('Owed to you now', money(snap.outstanding), snap.outstanding > 0 ? 'neg' : '')}
  </div><div class="help">${esc(basis)}</div></div>`;
}

function goalAdvice(g, p, net) {
  // Whole amounts read better; round the monthly target up so it's never short.
  const m = n => money(Math.ceil(n));
  net = Math.floor(net);
  const by = g.targetDate ? fmtDate(g.targetDate) : '';
  const when = p.eta ? fmtMonth(monthKey(p.eta)) : '';
  switch (p.status) {
    case 'done': return 'Goal reached. You have enough saved.';
    case 'on-track': return `Save ${m(p.perMonth)}/month until ${by}. You have about ${m(net)}/month left over, so this fits.`;
    case 'short': return `Needs ${m(p.perMonth)}/month to reach it by ${by}, but you only have about ${m(net)}/month left over. At that pace you'd reach it around ${when}. Cut ${m(p.perMonth - net)}/month of spending or move the date.`;
    case 'open': return `Saving all of your ${m(net)}/month left over, you'd reach it around ${when}.`;
    case 'past': return `The date has passed and ${m(p.remaining)} is still to go. Pick a new date.`;
    default: return 'Lately your expenses are as high as your income, so there is nothing left to save. Ask the AI below for ideas.';
  }
}

function goalsCardHTML(snap) {
  const plans = db.goals.map(g => ({ g, p: goalPlan(g, snap.avgNet, snap.today) }));
  const need = plans.reduce((a, x) => a + (x.p.status === 'done' ? 0 : x.p.perMonth || 0), 0);
  const rows = plans.map(({ g, p }) => `<div class="row"><div class="grow">
      <div class="title">${esc(g.name)}</div>
      <div class="meta">${money(g.saved)} of ${money(g.target)}${g.targetDate ? ' · by ' + esc(fmtDate(g.targetDate)) : ''}</div>
      <div class="progress${['short', 'past', 'no-savings'].includes(p.status) ? ' warn' : ''}"><span style="width:${Math.round(p.pct * 100)}%"></span></div>
      <div class="meta">${esc(goalAdvice(g, p, snap.avgNet))}</div></div>
      <div class="actions"><button class="btn sm" data-action="goal-deposit" data-id="${g.id}">+ Add money</button><button class="btn sm ghost" data-action="edit-goal" data-id="${g.id}">Edit</button></div></div>`).join('');
  const summary = plans.length > 1 && need > 0
    ? `<div class="help">All goals with a date need about ${money(Math.ceil(need))}/month together; you have about ${money(Math.max(0, Math.floor(snap.avgNet)))}/month left over.</div>` : '';
  return `<div class="card"><div class="card-head"><h2>Savings goals</h2><button class="btn sm primary" data-action="add-goal">+ Goal</button></div>
    <div class="list">${rows || '<div class="empty">Planning a big purchase? Add a goal to see how much to save each month.</div>'}</div>${summary}</div>`;
}

const MONEY_QUESTIONS = [
  'How is my money this month compared to before?',
  'Where can I cut my spending?',
  'How should I save for my goals?',
  'How much should I keep as an emergency fund?',
];

function moneyAIHTML(snap) {
  const r = ui.moneyAI;
  const out = !r ? '' : r.error
    ? `<div class="notice err ai-output"><b>Couldn't get an answer.</b> ${esc(r.error)}</div>`
    : `<div class="ai-output"><div class="card-head"><h3>${esc(r.q)}</h3><button class="btn sm" data-action="money-ai-copy">Copy</button></div><div class="doc">${renderMarkdown(r.content)}</div></div>`;
  return `<div class="card section"><h2>Ask AI about your money</h2>
    <p class="muted small">Advice on spending, saving and big purchases. The AI only gets the totals shown under "What gets sent" — no student names, phone numbers or goal names.${aiReady() ? '' : ' <a href="#/settings">Set up a free AI provider first.</a>'}</p>
    <div class="chips money-chips">${MONEY_QUESTIONS.map(q => `<button class="btn sm ghost" data-action="money-ai-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="form" id="money-ai-form">
      <label class="field">Your question<textarea name="q" rows="2" placeholder="e.g. I want to buy a ${esc(db.settings.currency)}80,000 laptop by March. How much should I save each month?">${esc(ui.moneyQ)}</textarea></label>
      <details class="sent"><summary>What gets sent to the AI</summary><pre>${esc(moneyPromptData(snap))}</pre></details>
      <div class="form-actions"><button class="btn primary" id="money-ai-go"${ui.moneyBusy ? ' disabled' : ''}>${ui.moneyBusy ? '<span class="spinner"></span> Thinking…' : 'Ask AI'}</button></div>
    </form>${out}</div>`;
}

function bindMoney() {
  bindFilters();
  const form = view.querySelector('#money-ai-form');
  form.q.addEventListener('input', () => { ui.moneyQ = form.q.value; });
  form.onsubmit = e => { e.preventDefault(); askMoneyAI(form.q.value.trim()); };
}

async function askMoneyAI(q) {
  if (!q || ui.moneyBusy) return;
  if (!aiReady()) { toast('Set up an AI provider in Settings first', 'error'); location.hash = '#/settings'; return; }
  ui.moneyQ = q;
  ui.moneyBusy = true;
  render();
  try {
    const content = await callAI(MONEY_SYSTEM, moneyPrompt(q, moneySnapshot()), { temperature: 0.4, maxTokens: 2048 });
    ui.moneyAI = { q, content };
  } catch (err) {
    ui.moneyAI = { q, error: err.message || String(err) };
  } finally {
    ui.moneyBusy = false;
    if (parseHash().parts[0] === 'money') render();
    else toast(ui.moneyAI.error ? 'Money advice failed' : 'Money advice ready', ui.moneyAI.error ? 'error' : null, { label: 'Open', fn: () => { location.hash = '#/money'; } });
  }
}

function openGoalForm(g) {
  const isNew = !g;
  const d = g || { name: '', target: '', saved: 0, targetDate: '', note: '' };
  openModal(isNew ? 'New savings goal' : 'Edit goal', `<form class="form" id="f-goal">
      <label class="field">What are you saving for? *<input name="name" required value="${esc(d.name)}" placeholder="e.g. New laptop"></label>
      <div class="form-row"><label class="field">Cost (${esc(db.settings.currency)}) *<input name="target" type="number" min="1" step="any" required value="${esc(d.target)}"></label>
        <label class="field">Saved so far<input name="saved" type="number" min="0" step="any" value="${esc(d.saved)}"></label>
        <label class="field">Buy by (optional)<input name="targetDate" type="date" value="${esc(d.targetDate || '')}"></label></div>
      <label class="field">Note<input name="note" value="${esc(d.note || '')}"></label>
      <div class="form-actions">${isNew ? '' : '<button type="button" class="btn danger left" id="del-goal">Delete</button>'}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save goal</button></div></form>`,
  body => {
    const form = body.querySelector('form');
    if (!isNew) body.querySelector('#del-goal').onclick = () => {
      const copy = { ...g };
      db.goals = db.goals.filter(x => x.id !== g.id); if (!save()) return; closeModal(); render();
      toast('Goal deleted', null, { label: 'Undo', fn: () => { db.goals.push(copy); if (!save()) return; render(); } });
    };
    form.onsubmit = e => {
      e.preventDefault();
      const f = formData(form);
      const data = { name: f.name, target: Number(f.target) || 0, saved: Math.max(0, Number(f.saved) || 0), targetDate: f.targetDate || undefined, note: f.note };
      if (isNew) db.goals.push({ id: uid(), createdAt: new Date().toISOString(), ...data });
      else {
        const cur = liveRecord('goals', g);
        if (!cur) { closeModal(); return render(); }
        Object.assign(cur, data);
      }
      if (!save()) return; closeModal(); render();
      toast('Goal saved');
    };
  });
}

function openGoalDeposit(id) {
  const g = db.goals.find(x => x.id === id);
  if (!g) return;
  openModal(`Add money to "${g.name}"`, `<form class="form">
      <label class="field">Amount (${esc(db.settings.currency)})<input name="amount" type="number" step="any" required autofocus></label>
      <div class="help">Use a minus amount (e.g. -500) if you took money out.</div>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Add</button></div></form>`,
  body => {
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const amt = Number(e.target.amount.value) || 0;
      const cur = liveRecord('goals', g);
      if (!cur) { closeModal(); return render(); }
      cur.saved = Math.max(0, (Number(cur.saved) || 0) + amt);
      if (!save()) return; closeModal(); render();
      toast(`${money(cur.saved)} saved of ${money(cur.target)}`);
    };
  });
}

function exportCSV() {
  const rows = [['Type', 'Date', 'Student', 'Contract', 'Method/Category', 'Amount', 'Note']];
  for (const p of [...db.payments].sort((a, b) => a.date.localeCompare(b.date))) {
    const c = p.contractId && getContract(p.contractId);
    rows.push(['Income', p.date, studentName(p.studentId), c ? c.title : '', p.method || '', p.amount, p.note || '']);
  }
  for (const x of [...db.expenses].sort((a, b) => a.date.localeCompare(b.date))) rows.push(['Expense', x.date, '', '', x.category, -Number(x.amount || 0), x.note || '']);
  // Text starting with = + - @ could run as a formula in Excel/Sheets, so prefix it with '.
  const cell = v => {
    let t = String(v == null ? '' : v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const csv = rows.map(r => r.map(cell).join(',')).join('\r\n');
  downloadFile(`manator-money-${todayISO()}.csv`, '\ufeff' + csv, 'text/csv');
}

// ── AI ───────────────────────────────────────────────────────
const AI_TOOLS = { plan: 'Lesson plan', exam: 'Exam paper', worksheet: 'Worksheet', saved: 'Saved', results: 'Exam results' };
const EXAM_TYPES = ['Multiple choice (MCQ)', 'Short answer', 'Broad / creative questions', 'Fill in the blanks', 'True / False', 'Matching', 'Problem solving / numericals'];
const LANGS = ['English', 'Bangla', 'English + Bangla'];

function draft(tool) {
  if (!ui.aiDraft[tool]) {
    ui.aiDraft[tool] = {
      plan: { studentId: '', grade: '', curriculum: '', subject: '', topic: '', duration: 60, level: 'average', language: 'English', notes: '', sourceText: '', sourceMode: 'only' },
      exam: { studentId: '', grade: '', curriculum: '', subject: '', topics: '', range: '30', format: 'custom', cqCount: 8, cqAnswer: 5, cqStyle: 'auto', mcqCount: 25, marks: 50, duration: 60, difficulty: 'mixed (easy → hard)', types: ['Multiple choice (MCQ)', 'Short answer'], answerKey: true, check: true, language: 'English', notes: '', sourceText: '', sourceMode: 'style' },
      worksheet: { studentId: '', grade: '', subject: '', topic: '', count: 15, difficulty: 'mixed (easy → hard)', check: true, language: 'English', notes: '', sourceText: '', sourceMode: 'style' },
    }[tool] || {};
  }
  return ui.aiDraft[tool];
}

function prefillAIStudent(studentId) {
  const s = getStudent(studentId);
  if (!s) return;
  for (const tool of ['plan', 'exam', 'worksheet']) {
    const d = draft(tool);
    d.studentId = s.id;
    d.grade = s.grade || '';
    if ('curriculum' in d) d.curriculum = s.curriculum || '';
    d.subject = (s.subjects && s.subjects[0]) || d.subject;
    if (tool === 'exam') d.topics = topicsFromLessons(s.id, d.subject, d.range);
  }
}

function topicsFromLessons(studentId, subject, range) {
  const from = range === 'all' ? '' : range === 'month' ? todayISO().slice(0, 8) + '01' : addDays(todayISO(), -Number(range || 30));
  const lessons = studentLessons(studentId)
    .filter(l => l.status === 'taught' && l.topics && l.date >= from)
    .filter(l => !subject || !l.subject || l.subject.toLowerCase() === subject.toLowerCase())
    .reverse();
  return [...new Set(lessons.map(l => l.topics.trim()))].join('\n');
}

const EXAM_FORMATS = [['custom', 'Choose question types'], ['board', 'Board: MCQ + creative questions (full paper)'], ['cq', 'Board: creative questions only (সৃজনশীল)'], ['mcq', 'Board: MCQ only (বহুনির্বাচনি)']];
function fmtShows(k, fmt) {
  if (k === 'custom') return fmt === 'custom';
  if (k === 'cq') return fmt === 'cq' || fmt === 'board';
  if (k === 'mcq') return fmt === 'mcq' || fmt === 'board';
  return fmt !== 'custom';
}
function fmtSize(n) { return n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`; }
function aiSources(tool) { return (ui.aiSources[tool] = ui.aiSources[tool] || []); }

function sourceFieldHTML(tool) {
  const d = draft(tool);
  return `<div class="field"><span class="muted small" style="font-weight:500">Past paper, textbook chapter or notes (optional)</span>
      <div class="chips" style="margin:6px 0">${aiSources(tool).map(x => `<span class="src-chip">${esc(x.name)} <span class="muted">${esc(fmtSize(x.size))}</span><button type="button" class="src-x" data-action="src-remove" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">×</button></span>`).join('')}
        <label class="btn sm">+ Add PDF, photo or Word file<input type="file" id="src-file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt,.md" multiple hidden></label></div>
      <textarea name="sourceText" rows="3" placeholder="…or paste text from the book or a past paper">${esc(d.sourceText || '')}</textarea></div>
    <label class="field">How to use it<select name="sourceMode"><option value="style"${d.sourceMode !== 'only' ? ' selected' : ''}>Make similar new questions (copy its style and pattern)</option><option value="only"${d.sourceMode === 'only' ? ' selected' : ''}>Use only this material (textbook chapter, notes)</option></select></label>
    <div class="help">Files and text you add here are sent to the AI, so remove students' names first. They aren't saved, and you need to add them again after reloading. PDFs and photos work best with Google Gemini, which also reads scanned and Bangla pages. Other providers only get the text inside a PDF and can't read photos.</div>`;
}

function selectOpts(list, val) { return list.map(x => `<option${x === val ? ' selected' : ''}>${esc(x)}</option>`).join(''); }

function aiFormHTML(tool) {
  const d = draft(tool);
  const common = `<label class="field">Student (optional)<select name="studentId">${studentOptions(d.studentId, true, '— Any / no student —')}</select></label>
    <div class="form-row"><label class="field">Class / Grade<input name="grade" value="${esc(d.grade)}" placeholder="e.g. Class 9"></label>
      ${'curriculum' in d ? `<label class="field">Curriculum / Board<input name="curriculum" value="${esc(d.curriculum)}" placeholder="e.g. NCTB, Cambridge"></label>` : ''}
      <label class="field">Subject *<input name="subject" required value="${esc(d.subject)}" list="ai-subjects"><datalist id="ai-subjects"></datalist></label></div>`;
  const lang = `<label class="field">Language<select name="language">${selectOpts(LANGS, d.language)}</select></label>`;
  const diff = `<label class="field">Difficulty<select name="difficulty">${selectOpts(['easy', 'medium', 'hard', 'mixed (easy → hard)', 'exam standard'], d.difficulty)}</select></label>`;
  const notes = `<label class="field">Extra instructions<textarea name="notes" rows="2" placeholder="e.g. focus on word problems, follow board question pattern">${esc(d.notes)}</textarea></label>`;
  if (tool === 'plan') {
    return `${common}<label class="field">Topic *<input name="topic" required value="${esc(d.topic)}" placeholder="e.g. Pythagoras theorem"></label>
      <div class="form-row"><label class="field">Session minutes<input name="duration" type="number" min="15" step="5" value="${esc(d.duration)}"></label>
        <label class="field">Student level<select name="level">${selectOpts(['weak — needs basics', 'average', 'strong — needs challenge'], d.level)}</select></label>${lang}</div>${notes}${sourceFieldHTML(tool)}
      <div class="help">If a student is selected, their last few logged topics are included so the plan builds on them.</div>`;
  }
  if (tool === 'exam') {
    const fmt = d.format || 'custom';
    const vis = k => (fmtShows(k, fmt) ? '' : ' hidden');
    return `${common}<label class="field">Topics to test<textarea name="topics" rows="4" placeholder="One topic per line (can be left empty if you attach a past paper)">${esc(d.topics)}</textarea></label>
      <div class="actions" style="align-items:center"><button type="button" class="btn sm" id="fill-topics">Fill from class log</button>
        <select name="range" style="width:auto">${[['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['all', 'All time']].map(([v, t]) => `<option value="${v}"${d.range === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <label class="field">Paper format<select name="format">${EXAM_FORMATS.map(([v, t]) => `<option value="${v}"${fmt === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <div class="form-row" data-fmt="cq"${vis('cq')}><label class="field">Creative questions<input name="cqCount" type="number" min="1" max="15" value="${esc(d.cqCount)}"></label>
        <label class="field">Student answers any<input name="cqAnswer" type="number" min="1" max="15" value="${esc(d.cqAnswer)}"></label>
        <label class="field">CQ parts<select name="cqStyle">${[['auto', 'Auto (maths: ক2 খ4 গ4)'], ['4part', 'ক1 খ2 গ3 ঘ4'], ['3part', 'ক2 খ4 গ4 (maths)']].map(([v, t]) => `<option value="${v}"${d.cqStyle === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="form-row" data-fmt="mcq"${vis('mcq')}><label class="field">MCQs (1 mark each)<input name="mcqCount" type="number" min="1" max="60" value="${esc(d.mcqCount)}"></label></div>
      <div class="help" data-fmt="board" id="exam-total"${vis('board')}>Total marks: ${examMarks(d)}</div>
      <div class="form-row"><label class="field" data-fmt="custom"${vis('custom')}>Total marks<input name="marks" type="number" min="5" value="${esc(d.marks)}"></label>
        <label class="field">Time (minutes)<input name="duration" type="number" min="10" step="5" value="${esc(d.duration)}"></label>${diff}${lang}</div>
      <div class="field" data-fmt="custom"${vis('custom')}><span class="muted small" style="font-weight:500">Question types</span><div class="checks" style="margin-top:4px">${EXAM_TYPES.map(t => `<label class="check"><input type="checkbox" name="types" value="${esc(t)}"${d.types.includes(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}</div></div>
      <label class="check"><input type="checkbox" name="answerKey"${d.answerKey ? ' checked' : ''}> Include answer key (printed separately)</label>
      <label class="check"><input type="checkbox" name="check"${d.check ? ' checked' : ''}> Check the answers with a second AI pass</label>${notes}${sourceFieldHTML(tool)}`;
  }
  return `${common}<label class="field">Topic *<input name="topic" required value="${esc(d.topic)}"></label>
    <div class="form-row"><label class="field">Questions<input name="count" type="number" min="3" max="50" value="${esc(d.count)}"></label>${diff}${lang}</div>
    <label class="check"><input type="checkbox" name="check"${d.check ? ' checked' : ''}> Check the answers with a second AI pass</label>${notes}${sourceFieldHTML(tool)}`;
}

function docRow(doc) {
  return `<div class="row"><div class="grow"><div class="title"><a href="#" data-action="open-doc" data-id="${doc.id}">${esc(doc.title)}</a></div>
    <div class="meta">${esc(AI_TOOLS[doc.type] || doc.type)} · ${esc(fmtDate(doc.createdAt.slice(0, 10)))}${doc.studentId ? ' · ' + esc(studentName(doc.studentId)) : ''}</div></div></div>`;
}

function viewAI() {
  const p = AI_PROVIDERS[db.ai.provider];
  const ready = aiReady();
  const tool = ui.aiTool in AI_TOOLS ? ui.aiTool : 'plan';
  const head = `<div class="page-head"><div><h1>AI assistant</h1><div class="sub">Lesson plans, exam papers and worksheets · ${esc(p.name)} · ${esc(aiModel())}</div></div></div>
    ${ready ? '' : `<div class="notice warn">Connect a free AI provider first: <a href="#/settings">Settings → AI</a>. Google Gemini's free key takes a minute to create.</div>`}
    <div class="seg" id="ai-tools" style="margin-bottom:16px">${Object.entries(AI_TOOLS).map(([k, v]) => `<button data-tool="${k}" class="${tool === k ? 'active' : ''}">${v}</button>`).join('')}</div>`;
  if (tool === 'results') {
    const ats = db.attempts.filter(a => !ui.docsStudent || a.studentId === ui.docsStudent).sort((a, b) => b.startedAt - a.startedAt);
    return head + `<div class="toolbar"><select data-filter="docsStudent" aria-label="Student">${studentOptions(ui.docsStudent, true, 'All students')}</select></div>
      <div class="card"><div class="list">${ats.length ? ats.map(attemptRow).join('') : '<div class="empty">No exams taken yet. Open an exam paper in Saved, or generate one, and press Start exam.</div>'}</div></div>`;
  }
  if (tool === 'saved') {
    const docs = db.docs
      .filter(x => !ui.docsType || x.type === ui.docsType)
      .filter(x => !ui.docsStudent || x.studentId === ui.docsStudent)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return head + `<div class="toolbar"><select data-filter="docsType" aria-label="Type"><option value="">All types</option>${['plan', 'exam', 'worksheet'].map(t => `<option value="${t}"${ui.docsType === t ? ' selected' : ''}>${AI_TOOLS[t]}</option>`).join('')}</select>
      <select data-filter="docsStudent" aria-label="Student">${studentOptions(ui.docsStudent, true, 'All students')}</select>
      <button class="btn" data-action="import-doc">Import Word / text file</button></div>
      <div class="card"><div class="list">${docs.length ? docs.map(docRow).join('') : '<div class="empty">Nothing saved yet. Generate something and press Save, or import questions you wrote in Word.</div>'}</div></div>`;
  }
  const r = ui.aiResult && ui.aiResult.tool === tool ? ui.aiResult : null;
  return head + `<div class="card"><form class="form" id="ai-form">${aiFormHTML(tool)}
      <div class="form-actions"><button class="btn primary" id="ai-go"${ui.aiBusy ? ' disabled' : ''}>${ui.aiBusy ? `<span class="spinner"></span> ${esc(ui.aiBusy)}` : `Generate ${AI_TOOLS[tool].toLowerCase()}`}</button></div></form></div>
    <div id="ai-output">${r ? aiResultHTML(r) : ''}</div>`;
}

function aiResultHTML(r) {
  if (r.error) return `<div class="notice err ai-output"><b>Couldn't generate.</b> ${esc(r.error)}</div>`;
  const hasKey = !!splitAnswerKey(r.content).answers;
  const busy = ui.aiBusy ? ' disabled' : '';
  const c = r.check;
  const check = ui.aiBusy ? `<div class="notice ai-check"><span class="spinner"></span> ${esc(ui.aiBusy)}</div>`
    : !c ? ''
      : c.error ? `<div class="notice err ai-check"><b>Couldn't check the paper.</b> ${esc(c.error)}</div>`
        : c.ok ? '<div class="notice ai-check"><b>AI check: no problems found.</b> The check can miss mistakes too, so read the paper before you use it.</div>'
          : `<div class="notice warn ai-check"><b>AI check found possible problems:</b><div class="doc">${renderMarkdown(c.report)}</div>
            <div class="actions" style="margin-top:8px"><button class="btn sm primary" data-action="ai-fix"${busy}>Fix these problems</button></div></div>`;
  return `<div class="card ai-output"><div class="card-head"><h2>${esc(r.title)}</h2>
      <div class="actions">${r.savedId ? '<span class="badge green">Saved</span>' : '<button class="btn sm primary" data-action="ai-save">Save</button>'}
        <button class="btn sm" data-action="ai-copy">Copy</button>
        <button class="btn sm" data-action="ai-print">Print</button>
        ${hasKey ? '<button class="btn sm" data-action="ai-print-paper">Print without answers</button>' : ''}
        ${r.tool !== 'plan' ? `<button class="btn sm" data-action="ai-check"${busy}>Check paper</button>` : ''}
        ${r.tool === 'exam' ? `<button class="btn sm" data-action="ai-exam"${busy}>Start exam</button>` : ''}
        ${r.prev ? `<button class="btn sm ghost" data-action="ai-undo"${busy}>Undo change</button>` : ''}
        <button class="btn sm ghost" data-action="ai-regen"${busy}>Regenerate</button></div></div>
    ${check}
    <form class="revise-row" id="ai-revise"><input name="instruction" aria-label="Change request" placeholder="Change something, e.g. &quot;Replace Q3 with a harder question&quot;"><button class="btn sm"${busy}>Change</button></form>
    <div class="doc">${renderMarkdown(r.content)}</div></div>`;
}

function readAIForm(form, tool) {
  const f = formData(form);
  const d = draft(tool);
  Object.assign(d, f);
  if (tool === 'exam') {
    d.types = [...form.querySelectorAll('[name=types]:checked')].map(x => x.value);
    d.answerKey = form.answerKey.checked;
  }
  if (form.check) d.check = form.check.checked;
  return d;
}

function bindAI() {
  document.getElementById('ai-tools').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const form = document.getElementById('ai-form');
    if (form) readAIForm(form, ui.aiTool);
    ui.aiTool = b.dataset.tool; render();
  });
  bindFilters();
  const form = document.getElementById('ai-form');
  if (!form) return;
  const tool = ui.aiTool;
  const syncSubjects = () => {
    const s = getStudent(form.studentId.value);
    form.querySelector('#ai-subjects').innerHTML = (s && s.subjects || []).map(x => `<option value="${esc(x)}">`).join('');
  };
  syncSubjects();
  form.studentId.addEventListener('change', () => {
    const s = getStudent(form.studentId.value);
    syncSubjects();
    if (!s) return;
    form.grade.value = s.grade || '';
    if (form.curriculum) form.curriculum.value = s.curriculum || '';
    const subs = s.subjects || [];
    if (!subs.includes(form.subject.value)) form.subject.value = subs[0] || '';
    if (tool === 'exam') form.topics.value = topicsFromLessons(s.id, form.subject.value, form.range.value);
  });
  const fill = form.querySelector('#fill-topics');
  if (fill) fill.onclick = () => {
    if (!form.studentId.value) return toast('Pick a student to pull topics from their class log');
    const t = topicsFromLessons(form.studentId.value, form.subject.value, form.range.value);
    if (!t) return toast('No logged topics for that student, subject and period');
    form.topics.value = t;
  };
  form.onsubmit = e => { e.preventDefault(); generateAI(readAIForm(form, tool), tool); };
  if (form.format) {
    const syncFmt = () => {
      const fmt = form.format.value;
      form.querySelectorAll('[data-fmt]').forEach(el => { el.hidden = !fmtShows(el.dataset.fmt, fmt); });
      form.querySelector('#exam-total').textContent = `Total marks: ${examMarks(formData(form))}`;
    };
    form.addEventListener('input', syncFmt);
    form.addEventListener('change', syncFmt);
  }
  const sf = form.querySelector('#src-file');
  if (sf) sf.onchange = async () => {
    const files = [...sf.files];
    readAIForm(form, tool);
    await addSourceFiles(tool, files);
    render();
  };
  const rv = document.getElementById('ai-revise');
  if (rv) rv.onsubmit = e => {
    e.preventDefault();
    const text = rv.instruction.value.trim();
    if (!text) return toast('Write what to change first');
    reviseAIResult(ui.aiResult, text);
  };
}

async function generateAI(d, tool) {
  if (!aiReady()) { toast('Set up an AI provider in Settings first', 'error'); location.hash = '#/settings'; return; }
  if (ui.aiBusy) return;
  const f = { ...d };
  if (tool === 'exam' && !f.topics && !aiSources(tool).length && !f.sourceText) return toast('Add the topics to test, or attach a past paper', 'error');
  if (tool === 'plan' && f.studentId) {
    f.recent = studentLessons(f.studentId).filter(l => l.status === 'taught' && l.topics && (!f.subject || !l.subject || l.subject.toLowerCase() === f.subject.toLowerCase()))
      .slice(0, 5).map(l => l.topics.replace(/\s+/g, ' ')).join('; ');
  }
  const title = tool === 'plan' ? `Lesson plan: ${f.subject} – ${f.topic}`
    : tool === 'exam' ? `Exam: ${f.subject}${f.grade ? ' (' + f.grade + ')' : ''} – ${examMarks(f)} marks`
      : `Worksheet: ${f.subject} – ${f.topic}`;
  ui.aiBusy = aiSources(tool).length ? 'Reading your files and writing…' : 'Generating…';
  ui.aiResult = null;
  render();
  try {
    const src = await prepareSources(tool, f);
    const prompt = tool === 'plan' ? lessonPlanPrompt(f, src) : tool === 'exam' ? examPrompt(f, src) : worksheetPrompt(f, src);
    const content = cleanDoc(await callAI(AI_SYSTEM, prompt, { files: src.files }));
    ui.aiResult = { tool, title, content, studentId: f.studentId || null, meta: { subject: f.subject, grade: f.grade }, ctx: { f, src } };
  } catch (err) {
    ui.aiResult = { tool, error: err.message || String(err) };
  } finally {
    ui.aiBusy = false;
  }
  if (!ui.aiResult.error && tool !== 'plan' && f.check) return checkAIResult(ui.aiResult);
  aiDone(tool);
}

function aiDone(tool) {
  if (parseHash().parts[0] === 'ai') return render();
  const r = ui.aiResult;
  toast(r && r.error ? 'AI generation failed' : `${AI_TOOLS[tool]} ready`, r && r.error ? 'error' : null, { label: 'Open', fn: () => { ui.aiTool = tool; location.hash = '#/ai'; } });
}
function aiRender() { if (parseHash().parts[0] === 'ai') render(); }

async function checkAIResult(r) {
  if (!r || !r.ctx || ui.aiBusy) return;
  ui.aiBusy = 'Checking the answers…';
  r.check = null;
  aiRender();
  try {
    r.check = parseCheck(await callAI(CHECK_SYSTEM, checkPrompt(r.tool, r.ctx.f, r.content, r.ctx.src), { temperature: 0.2, files: r.ctx.src.files }));
  } catch (err) {
    r.check = { error: err.message || String(err) };
  } finally {
    ui.aiBusy = false;
  }
  aiDone(r.tool);
}

async function reviseAIResult(r, instruction) {
  if (!r || !r.ctx || ui.aiBusy) return;
  ui.aiBusy = 'Making the change…';
  aiRender();
  try {
    const out = cleanDoc(await callAI(AI_SYSTEM, revisePrompt(r.tool, r.ctx.f, r.content, instruction, r.ctx.src), { files: r.ctx.src.files }));
    r.prev = r.content;
    r.content = out;
    r.savedId = null;
    r.check = null;
  } catch (err) {
    toast(`Couldn't make the change: ${err.message || err}`, 'error');
  } finally {
    ui.aiBusy = false;
  }
  aiDone(r.tool);
}

// ── Source material for the AI (past papers, textbook pages) ─
const SOURCE_FILE_MAX = 14 * 1024 * 1024;
const SOURCE_TEXT_MAX = 60000;

async function addSourceFiles(tool, files) {
  const list = aiSources(tool);
  for (const file of files) {
    const name = file.name;
    const low = name.toLowerCase();
    try {
      if (/\.(pdf|png|jpe?g|webp)$/.test(low)) {
        const used = list.reduce((n, x) => n + (x.bytes ? x.size : 0), 0);
        if (used + file.size > SOURCE_FILE_MAX) throw new Error(`"${name}" is too big. PDFs and photos can be up to 14 MB in total.`);
        const pdf = low.endsWith('.pdf');
        list.push({ id: uid(), name, size: file.size, kind: pdf ? 'pdf' : 'image', mime: pdf ? 'application/pdf' : file.type || 'image/jpeg', bytes: await file.arrayBuffer() });
      } else {
        const { content } = await readImportFile(file);
        if (!content.trim()) throw new Error(`No text found in "${name}".`);
        list.push({ id: uid(), name, size: file.size, kind: 'text', text: content });
      }
    } catch (err) {
      toast(err.message || `Couldn't read "${name}"`, 'error');
    }
  }
}

function toBase64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}

let pdfjsLoading = null;
function loadPdfjs() {
  pdfjsLoading = pdfjsLoading || import('./vendor/pdfjs/pdf.min.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL('js/vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
    return m;
  }, () => { pdfjsLoading = null; throw new Error('Could not load the PDF reader. Check your connection and try again.'); });
  return pdfjsLoading;
}

async function pdfText(bytes) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    pages.push(tc.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''));
  }
  return { text: pages.join('\n\n'), pages: pdf.numPages };
}

async function prepareSources(tool, f) {
  const src = { files: [], fileNames: [], texts: [], mode: f.sourceMode === 'only' ? 'only' : 'style' };
  const gemini = db.ai.provider === 'gemini';
  for (const x of aiSources(tool)) {
    if (x.kind === 'text') src.texts.push({ name: x.name, text: x.text });
    else if (gemini) {
      x.b64 = x.b64 || toBase64(x.bytes);
      src.files.push({ mimeType: x.mime, data: x.b64 });
      src.fileNames.push(x.name);
    } else if (x.kind === 'image') {
      throw new Error(`Only Google Gemini can read photos like "${x.name}". Switch to Gemini in Settings → AI, or paste the text instead.`);
    } else {
      const { text, pages } = await pdfText(x.bytes);
      if (text.replace(/\s/g, '').length < 40 * pages) throw new Error(`"${x.name}" looks like a scanned PDF with no text inside. Switch to Google Gemini in Settings → AI, which can read scanned pages.`);
      src.texts.push({ name: x.name, text });
    }
  }
  if (f.sourceText) src.texts.push({ name: 'Pasted text', text: f.sourceText });
  let left = SOURCE_TEXT_MAX;
  src.texts = src.texts.filter(t => t.text.trim() && left > 0).map(t => {
    const text = t.text.length > left ? t.text.slice(0, left) + '\n[…the rest was cut because it was too long]' : t.text;
    left -= t.text.length;
    return { name: t.name, text };
  });
  return src;
}

function printMarkdown(title, md) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:12pt/1.5 'Segoe UI','Noto Sans Bengali',Arial,sans-serif;color:#111;margin:18mm}
    h2{font-size:16pt;margin:14pt 0 6pt}h3{font-size:13pt;margin:12pt 0 4pt}h4,h5{font-size:12pt;margin:10pt 0 4pt}
    table{border-collapse:collapse;width:100%;margin:6pt 0}th,td{border:1px solid #999;padding:4pt 6pt;text-align:left;vertical-align:top}
    hr{border:none;border-top:1px dashed #999;margin:14pt 0}ul,ol{margin:4pt 0 4pt 20pt}p{margin:4pt 0}
    pre,code{font-family:Consolas,monospace}blockquote{border-left:3px solid #999;padding-left:8pt;color:#444}
  </style></head><body>${renderMarkdown(md)}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1000); }, 250);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => toast('Copied'), () => fallbackCopy(text));
  fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed', 'error'); }
  ta.remove();
}

// ── Import (Word .docx / text) ───────────────────────────────
let mammothLoading = null;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  mammothLoading = mammothLoading || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/mammoth.browser.min.js';
    s.onload = () => resolve(window.mammoth);
    s.onerror = () => { mammothLoading = null; reject(new Error('Could not load the Word reader. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return mammothLoading;
}

// Converts mammoth's HTML into the Markdown subset renderMarkdown() understands.
function htmlToMarkdown(html) {
  const root = new DOMParser().parseFromString(html, 'text/html').body;
  const wrap = (inner, mark) => {
    const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
  };
  const inline = node => {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, ' '); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'UL' || tag === 'OL' || tag === 'IMG') return;
      if (tag === 'BR') { out += ' '; return; }
      const inner = inline(n);
      if (tag === 'STRONG' || tag === 'B') out += wrap(inner, '**');
      else if (tag === 'EM' || tag === 'I') out += wrap(inner, '*');
      else if (tag === 'SUP') out += '^' + inner;
      else if (tag === 'P' || tag === 'LI' || tag === 'DIV') out += inner + ' ';
      else out += inner;
    });
    return out;
  };
  const clean = s => s.replace(/\s+/g, ' ').trim();
  const blocks = [];
  const listLines = (list, depth) => {
    const lines = [];
    let n = 1;
    for (const li of list.children) {
      if (li.tagName !== 'LI') continue;
      const text = clean(inline(li));
      if (text) lines.push('  '.repeat(depth) + (list.tagName === 'OL' ? `${n++}. ` : '- ') + text);
      for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') lines.push(...listLines(sub, depth + 1));
    }
    return lines;
  };
  const walk = el => {
    for (const c of el.children) {
      const tag = c.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const text = clean(inline(c));
        if (text) blocks.push('#'.repeat(Math.min(4, Number(tag[1]))) + ' ' + text);
      } else if (tag === 'P') {
        const text = clean(inline(c));
        if (text) blocks.push(text);
      } else if (tag === 'UL' || tag === 'OL') {
        const lines = listLines(c, 0);
        if (lines.length) blocks.push(lines.join('\n'));
      } else if (tag === 'TABLE') {
        const rows = [...c.querySelectorAll('tr')]
          .map(tr => [...tr.children].map(td => clean(inline(td)).replace(/\|/g, '/') || ' '))
          .filter(r => r.length);
        if (!rows.length) continue;
        const cols = Math.max(...rows.map(r => r.length));
        const line = r => '| ' + Array.from({ length: cols }, (_, i) => r[i] || ' ').join(' | ') + ' |';
        blocks.push([line(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(line)].join('\n'));
      } else {
        walk(c);
      }
    }
  };
  walk(root);
  return blocks.join('\n\n');
}

async function readImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const mammoth = await loadMammoth();
    let skipped = 0;
    const res = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      { convertImage: mammoth.images.imgElement(() => { skipped++; return Promise.resolve({ src: '' }); }) }
    );
    return { content: htmlToMarkdown(res.value), skipped };
  }
  if (name.endsWith('.doc')) throw new Error('Old .doc files can\'t be read. In Word, use File → Save As → Word Document (.docx).');
  const text = (await file.text()).replace(/\r/g, '');
  return { content: name.endsWith('.md') ? text : text.split('\n').join('\n\n').replace(/\n{3,}/g, '\n\n'), skipped: 0 };
}

function importDocForm() {
  openModal('Import questions', `<form class="form" id="f-import">
      <label class="field">File *<input type="file" name="file" accept=".docx,.doc,.txt,.md" required></label>
      <p class="muted small" style="margin:0">Word (.docx) or text file. Text, lists and tables are kept; pictures and equations are not. Put a heading <b>Answer Key</b> before the answers to print the paper without them.</p>
      <label class="field">Title<input name="title" placeholder="Uses the file name if empty"></label>
      <div class="form-row"><label class="field">Type<select name="type">${['exam', 'worksheet', 'plan'].map(t => `<option value="${t}">${AI_TOOLS[t]}</option>`).join('')}</select></label>
        <label class="field">Student (optional)<select name="studentId">${studentOptions(ui.docsStudent || '', true, 'No student')}</select></label></div>
      <div class="form-actions"><button class="btn primary" id="imp-go">Import</button></div></form>`,
  body => {
    const form = body.querySelector('#f-import');
    form.onsubmit = async e => {
      e.preventDefault();
      const file = form.file.files[0];
      if (!file) return;
      const btn = form.querySelector('#imp-go');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Reading…';
      try {
        const { content, skipped } = await readImportFile(file);
        if (!content.trim()) throw new Error('No text found in this file.');
        const d = formData(form);
        const doc = { id: uid(), type: d.type, title: d.title || file.name.replace(/\.[^.]+$/, ''), content, studentId: d.studentId || '', meta: { importedFrom: file.name }, createdAt: new Date().toISOString() };
        db.docs.push(doc);
        if (!save()) { btn.disabled = false; btn.textContent = 'Import'; return; }
        render(); openDoc(doc);
        toast(skipped ? `Imported. ${skipped} picture${skipped > 1 ? 's' : ''} couldn't be imported.` : 'Imported to your library');
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Import';
        toast(err.message || 'Import failed', 'error');
      }
    };
  });
}

function openDoc(doc) {
  const hasKey = !!splitAnswerKey(doc.content).answers;
  openModal(doc.title, `<div class="muted small" style="margin-bottom:10px">${esc(AI_TOOLS[doc.type] || doc.type)} · ${esc(fmtDate(doc.createdAt.slice(0, 10)))}${doc.studentId ? ' · ' + esc(studentName(doc.studentId)) : ''}</div>
    <div class="actions" style="margin-bottom:12px">${doc.type === 'exam' ? '<button class="btn sm primary" id="d-exam">Start exam</button>' : ''}<button class="btn sm" id="d-print">Print</button>${hasKey ? '<button class="btn sm" id="d-paper">Print without answers</button>' : ''}<button class="btn sm" id="d-copy">Copy</button><button class="btn sm" id="d-edit">Edit text</button><button class="btn sm danger" id="d-del">Delete</button></div>
    <div class="doc" id="d-body">${renderMarkdown(doc.content)}</div>`,
  body => {
    body.querySelector('#d-print').onclick = () => printMarkdown(doc.title, doc.content);
    if (doc.type === 'exam') body.querySelector('#d-exam').onclick = () => openExamSetup(doc);
    if (hasKey) body.querySelector('#d-paper').onclick = () => printMarkdown(doc.title, splitAnswerKey(doc.content).paper);
    body.querySelector('#d-copy').onclick = () => copyText(doc.content);
    body.querySelector('#d-del').onclick = () => {
      db.docs = db.docs.filter(x => x.id !== doc.id); if (!save()) return; closeModal(); render();
      toast('Deleted', null, { label: 'Undo', fn: () => { db.docs.push(doc); if (!save()) return; render(); } });
    };
    body.querySelector('#d-edit').onclick = () => {
      const wrap = body.querySelector('#d-body');
      wrap.outerHTML = `<form id="d-form" class="form"><textarea name="content" rows="18" style="font-family:ui-monospace,Consolas,monospace;font-size:.85rem">${esc(doc.content)}</textarea>
        <div class="form-actions"><button class="btn primary">Save changes</button></div></form>`;
      body.querySelector('#d-form').onsubmit = e => { e.preventDefault(); const cur = liveRecord('docs', doc); if (!cur) return closeModal(); cur.content = e.target.content.value; if (!save()) return; openDoc(cur); toast('Saved'); };
    };
  });
}

// ── Exam mode ────────────────────────────────────────────────
let examTimer = null;
let examSaveTimer = null;
function getExam(id) { return db.exams.find(e => e.id === id); }
function getAttempt(id) { return db.attempts.find(a => a.id === id); }
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + s.length.toString(36); }
function fmtClock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
function fmtN(n) { return String(Math.round(n * 10) / 10); }
function optLabels(ex) { return /[\u0980-\u09FF]/.test(JSON.stringify(ex.questions.slice(0, 8))) ? OPT_LETTERS_BN : OPT_LETTERS; }
function cqTotal(q) { return q.parts.reduce((a, p) => a + p.marks, 0); }
function qParts(q) { return q.type === 'cq' ? q.parts : [{ label: '', text: q.text, marks: q.marks, answer: q.answer }]; }
function partAnswer(at, q, i) { const a = at.answers[q.id]; return String((q.type === 'cq' ? a && a[i] : a) || ''); }
function partMark(at, q, i) {
  const m = at.marks[q.id];
  const v = q.type === 'cq' ? m && m[i] : m;
  return v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}
function cqLimit(ex, count) { return ex.cqChoose > 0 && ex.cqChoose < count ? ex.cqChoose : count; }
const sumOf = list => list.reduce((a, b) => a + b, 0);

function examStats(ex) {
  const mcq = ex.questions.filter(q => q.type === 'mcq');
  const cq = ex.questions.filter(q => q.type === 'cq');
  const wr = ex.questions.filter(q => q.type === 'written');
  const cqMax = sumOf(cq.map(cqTotal).sort((a, b) => b - a).slice(0, cqLimit(ex, cq.length)));
  return { mcq: mcq.length, cq: cq.length, written: wr.length, noKey: mcq.filter(q => q.answer == null).length,
    max: sumOf(mcq.map(q => q.marks)) + cqMax + sumOf(wr.map(q => q.marks)) };
}
function examSummary(ex) {
  const s = examStats(ex);
  return [s.mcq && `${s.mcq} MCQ`, s.cq && `${s.cq} creative question${s.cq === 1 ? '' : 's'}${cqLimit(ex, s.cq) < s.cq ? ` (answer any ${ex.cqChoose})` : ''}`,
    s.written && `${s.written} written`, `${fmtN(s.max)} marks`, `${ex.duration} min`].filter(Boolean).join(' · ');
}

// Best `cqChoose` creative questions count, as when a student answers more than required.
function attemptScore(ex, at) {
  let mcqGot = 0, mcqRight = 0, pending = 0;
  const mcq = ex.questions.filter(q => q.type === 'mcq');
  for (const q of mcq) {
    if (q.answer == null) { if (at.answers[q.id] != null) pending++; continue; }
    if (at.answers[q.id] === q.answer) { mcqGot += q.marks; mcqRight++; }
  }
  const written = q => sumOf(qParts(q).map((p, i) => {
    const m = partMark(at, q, i);
    if (m == null) { if (partAnswer(at, q, i).trim()) pending++; return 0; }
    return Math.min(Math.max(m, 0), p.marks);
  }));
  const cqs = ex.questions.filter(q => q.type === 'cq');
  const cqGot = sumOf(cqs.map(written).sort((a, b) => b - a).slice(0, cqLimit(ex, cqs.length)));
  const wrGot = sumOf(ex.questions.filter(q => q.type === 'written').map(written));
  return { got: mcqGot + cqGot + wrGot, max: examStats(ex).max, mcqGot, mcqRight, mcqCount: mcq.length, pending };
}

function finishExpiredAttempts() {
  let changed = false;
  for (const a of db.attempts) {
    if (a.status === 'running' && Date.now() >= a.endsAt) { a.status = 'submitted'; a.submittedAt = a.endsAt; a.auto = true; changed = true; }
  }
  if (changed) save();
}

function attemptRow(at) {
  const ex = getExam(at.examId);
  const sc = ex && attemptScore(ex, at);
  const badge = at.status === 'running' ? '<span class="badge yellow">Running</span>'
    : sc ? `<span class="badge${sc.pending ? ' yellow' : ' green'}">${fmtN(sc.got)} / ${fmtN(sc.max)}${sc.pending ? ' · to mark' : ''}</span>` : '';
  return `<a class="row" href="#/${at.status === 'running' ? 'exam' : 'result'}/${at.id}"><div class="grow"><div class="title">${esc(at.title || 'Exam')}</div>
    <div class="meta">${esc(fmtDate(toISO(new Date(at.startedAt))))}${at.studentId ? ' · ' + esc(studentName(at.studentId)) : ''}</div></div>${badge}</a>`;
}

function openExamSetup(doc, opts) {
  opts = opts || {};
  const hash = hashStr(doc.content);
  const ex = db.exams.find(e => e.docId === doc.id && e.hash === hash);
  if (!ex) {
    openModal('Start exam', `<p>First, Manator turns this paper into an on-screen exam with tap-to-answer MCQs, answer boxes and the answer key. This uses the AI once; after that the exam works offline.</p>
      <p class="help" style="margin-top:8px">Only the paper's text is sent to the AI.</p><div class="notice err" id="ex-err" hidden></div>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" id="ex-prep">Prepare exam</button></div>`, body => {
      body.querySelector('#ex-prep').onclick = async e => {
        if (!aiReady()) { closeModal(); toast('Set up an AI provider in Settings first', 'error'); location.hash = '#/settings'; return; }
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Reading the paper…';
        try {
          const n = normalizeExam(parseJSONReply(await callAI(EXAM_JSON_SYSTEM, examJsonPrompt(doc.content), { temperature: 0.1, json: true })));
          if (!n.questions.length) throw new Error('No questions were found in this paper.');
          if (!document.body.contains(btn)) return;
          db.exams = db.exams.filter(x => x.docId !== doc.id || db.attempts.some(a => a.examId === x.id));
          db.exams.push({ ...n, title: doc.title || n.title, id: uid(), docId: doc.id, hash, createdAt: new Date().toISOString() });
          if (!save()) return;
          openExamSetup(doc, opts);
        } catch (err) {
          if (!document.body.contains(btn)) return toast(`Couldn't prepare the exam: ${err.message || err}`, 'error');
          const box = body.querySelector('#ex-err');
          box.hidden = false;
          box.textContent = err.message || String(err);
          btn.disabled = false;
          btn.textContent = 'Try again';
        }
      };
    });
    return;
  }
  const st = examStats(ex);
  openModal('Start exam', `<form class="form"><div class="notice">${esc(examSummary(ex))}</div>
    ${st.noKey ? `<div class="notice warn">${st.noKey} MCQ${st.noKey === 1 ? ' has' : 's have'} no answer, so ${st.noKey === 1 ? 'it' : 'they'} won't be marked automatically.</div>` : ''}
    <label class="field">Student<select name="studentId">${studentOptions(opts.studentId || doc.studentId || '', true, '— No student —')}</select></label>
    <label class="field">Time (minutes)<input name="duration" type="number" min="1" max="600" value="${ex.duration}" required></label>
    <div class="help">Hand the device to the student. The timer starts when you press Start exam, and the exam submits itself when time runs out.</div>
    <div class="form-actions"><button type="button" class="btn ghost" id="ex-reread">Read paper again</button><button type="button" class="btn" id="ex-preview">Preview with answers</button><button class="btn primary">Start exam</button></div></form>`, body => {
    body.querySelector('#ex-reread').onclick = () => { ex.hash = ''; if (!save()) return; openExamSetup(doc, opts); };
    body.querySelector('#ex-preview').onclick = () => openModal(ex.title, `<div class="actions" style="margin-bottom:12px"><button class="btn sm" id="ex-back">← Back</button></div>${examPreviewHTML(ex)}`,
      b2 => { b2.querySelector('#ex-back').onclick = () => openExamSetup(doc, opts); });
    body.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = formData(e.target);
      const now = Date.now();
      const at = { id: uid(), examId: ex.id, title: ex.title, studentId: f.studentId || null, startedAt: now,
        endsAt: now + Math.min(600, Math.max(1, Math.round(num(f.duration)))) * 60e3, submittedAt: null, auto: false, status: 'running', answers: {}, marks: {}, aiMarks: {} };
      db.attempts.push(at);
      if (!save()) return;
      closeModal();
      location.hash = `#/exam/${at.id}`;
    };
  });
}

function examPreviewHTML(ex) {
  const L = optLabels(ex);
  return ex.questions.map(q => `<div class="exam-q">${q.stimulus ? `<div class="doc exam-stim">${renderMarkdown(q.stimulus)}</div>` : ''}
    ${q.type === 'mcq' ? `<div class="doc">${renderMarkdown(`**${q.n}.** ${q.text}`)}</div><ol class="exam-prev-opts">${q.options.map((o, i) => `<li class="${i === q.answer ? 'pos' : ''}">${L[i]}. ${esc(o)}${i === q.answer ? ' ✓' : ''}</li>`).join('')}</ol>`
      : `${q.type === 'cq' ? `<div><b>${esc(q.n)}.</b></div>` : ''}${qParts(q).map(p => `<div class="doc">${renderMarkdown(`${q.type === 'written' ? `**${q.n}.** ` : p.label ? `**${p.label}.** ` : ''}${p.text} *[${fmtN(p.marks)}]*`)}</div>
        ${p.answer ? `<div class="exam-ans muted">${esc(p.answer)}</div>` : ''}`).join('')}`}</div>`).join('');
}

function examProgress(ex, at) {
  let done = 0, total = 0;
  for (const q of ex.questions) {
    if (q.type === 'mcq') { total++; if (at.answers[q.id] != null) done++; continue; }
    qParts(q).forEach((p, i) => { total++; if (partAnswer(at, q, i).trim()) done++; });
  }
  return { done, total };
}

function viewExam(id) {
  const at = getAttempt(id);
  const ex = at && getExam(at.examId);
  if (!at || !ex) return '<div class="empty">Exam not found. <a href="#/">Home</a></div>';
  if (at.status !== 'running') {
    const sc = attemptScore(ex, at);
    return `<div class="card exam-done"><h1>${at.auto ? "Time's up" : 'Exam submitted'}</h1>
      <p class="muted">${esc(at.title)}${at.studentId ? ' · ' + esc(studentName(at.studentId)) : ''}</p>
      ${sc.mcqCount ? `<div class="exam-big">${sc.mcqRight} of ${sc.mcqCount} MCQs correct</div>` : ''}
      <p>${ex.questions.some(q => q.type !== 'mcq') ? 'Please give the device back to your tutor to mark the written answers.' : 'Please give the device back to your tutor.'}</p>
      <div class="actions" style="justify-content:center;margin-top:14px"><a class="btn primary" href="#/result/${at.id}">See result and mark</a></div></div>`;
  }
  document.body.classList.add('exam-mode');
  const L = optLabels(ex);
  const pr = examProgress(ex, at);
  const stim = q => (q.stimulus ? `<div class="doc exam-stim">${renderMarkdown(q.stimulus)}</div>` : '');
  const mcq = ex.questions.filter(q => q.type === 'mcq').map(q => `<div class="card exam-q">${stim(q)}<div class="doc">${renderMarkdown(`**${q.n}.** ${q.text}`)}</div>
    <div class="exam-opts" role="radiogroup">${q.options.map((o, i) => `<label class="exam-opt"><input type="radio" name="${q.id}" value="${i}"${at.answers[q.id] === i ? ' checked' : ''}><span class="exam-ol">${L[i]}</span><span class="doc">${renderMarkdown(o)}</span></label>`).join('')}</div></div>`).join('');
  const writtenQ = q => `<div class="card exam-q">${q.type === 'cq' ? `<div class="exam-qn"><b>${esc(q.n)}.</b> <span class="muted small">${fmtN(cqTotal(q))} marks</span></div>` : ''}${stim(q)}
    ${qParts(q).map((p, i) => `<div class="exam-part"><div class="doc">${renderMarkdown(`${q.type === 'written' ? `**${q.n}.** ` : p.label ? `**${p.label}.** ` : ''}${p.text} *[${fmtN(p.marks)}]*`)}</div>
      <textarea rows="${p.marks > 2 ? 6 : 3}" data-q="${q.id}" data-part="${i}" aria-label="Answer ${esc(q.n)}${esc(p.label)}" placeholder="Write your answer here, or on paper">${esc(partAnswer(at, q, i))}</textarea></div>`).join('')}</div>`;
  const cqs = ex.questions.filter(q => q.type === 'cq');
  const wr = ex.questions.filter(q => q.type === 'written');
  return `<div class="exam-bar"><div class="exam-title"><b>${esc(at.title)}</b><div class="muted small" id="exam-progress">${pr.done} of ${pr.total} answered</div></div>
      <div class="exam-timer" id="exam-timer" role="timer" aria-label="Time left">${fmtClock(at.endsAt - Date.now())}</div>
      <button class="btn primary sm" data-action="exam-submit" data-id="${at.id}">Submit</button></div>
    ${ex.instructions ? `<div class="notice">${esc(ex.instructions)}</div>` : ''}
    <form id="exam-form" autocomplete="off">
      ${mcq ? `<div class="section"><h2>Multiple choice <span class="muted small">tap one answer</span></h2>${mcq}</div>` : ''}
      ${cqs.length ? `<div class="section"><h2>Creative questions${cqLimit(ex, cqs.length) < cqs.length ? ` <span class="muted small">answer any ${ex.cqChoose}</span>` : ''}</h2>${cqs.map(writtenQ).join('')}</div>` : ''}
      ${wr.length ? `<div class="section"><h2>Written questions</h2>${wr.map(writtenQ).join('')}</div>` : ''}
    </form>
    <div class="form-actions"><button class="btn primary" data-action="exam-submit" data-id="${at.id}">Submit exam</button></div>`;
}

function bindExam() {
  clearInterval(examTimer);
  const id = parseHash().parts[1];
  const at = getAttempt(id);
  const ex = at && getExam(at.examId);
  if (!at || !ex || at.status !== 'running') return;
  const live = () => { const a = getAttempt(id); return a && a.status === 'running' ? a : null; };
  const progress = a => { const p = examProgress(ex, a); const el = document.getElementById('exam-progress'); if (el) el.textContent = `${p.done} of ${p.total} answered`; };
  const form = document.getElementById('exam-form');
  form.onsubmit = e => e.preventDefault();
  form.addEventListener('change', e => {
    const t = e.target, a = live();
    if (!a) return;
    if (t.type === 'radio') { a.answers[t.name] = Number(t.value); save(); }
    else if (t.tagName === 'TEXTAREA') { clearTimeout(examSaveTimer); save(); }
    progress(a);
  });
  form.addEventListener('input', e => {
    const t = e.target, a = live();
    if (!a || t.tagName !== 'TEXTAREA') return;
    const q = ex.questions.find(x => x.id === t.dataset.q);
    if (!q) return;
    if (q.type === 'cq') a.answers[q.id] = { ...(isObj(a.answers[q.id]) ? a.answers[q.id] : {}), [t.dataset.part]: t.value };
    else a.answers[q.id] = t.value;
    progress(a);
    clearTimeout(examSaveTimer);
    examSaveTimer = setTimeout(save, 600);
  });
  const tick = () => {
    const a = live(), r = parseHash().parts;
    if (!a || r[0] !== 'exam' || r[1] !== id) { clearInterval(examTimer); return; }
    const left = a.endsAt - Date.now();
    if (left <= 0) { clearInterval(examTimer); submitAttempt(id, true); return; }
    const el = document.getElementById('exam-timer');
    if (el) {
      el.textContent = fmtClock(left);
      el.classList.toggle('warn', left <= 300e3 && left > 60e3);
      el.classList.toggle('danger', left <= 60e3);
    }
    if (left <= 60e3 && !a.warned1) { a.warned1 = a.warned5 = true; toast('1 minute left', 'error'); }
    else if (left <= 300e3 && !a.warned5) { a.warned5 = true; toast('5 minutes left'); }
  };
  tick();
  examTimer = setInterval(tick, 1000);
}

function submitAttempt(id, auto) {
  const a = getAttempt(id);
  if (!a || a.status !== 'running') return;
  clearTimeout(examSaveTimer);
  a.status = 'submitted';
  a.auto = !!auto;
  a.submittedAt = Math.min(Date.now(), a.endsAt);
  delete a.warned1;
  delete a.warned5;
  save();
  if (!modalRoot.hidden) closeModal();
  render();
  if (auto) toast("Time's up. The exam was submitted.");
}

window.addEventListener('beforeunload', e => { if (document.body.classList.contains('exam-mode')) { e.preventDefault(); e.returnValue = ''; } });

function viewResult(id) {
  const at = getAttempt(id);
  const ex = at && getExam(at.examId);
  if (!at || !ex) return '<div class="empty">Result not found. <a href="#/ai?tool=results">All results</a></div>';
  if (at.status === 'running') return `<div class="notice">This exam is still running. <a href="#/exam/${at.id}">Open it</a></div>`;
  const sc = attemptScore(ex, at);
  const L = optLabels(ex);
  const mins = Math.max(1, Math.round(((at.submittedAt || at.endsAt) - at.startedAt) / 60e3));
  const mcqs = ex.questions.filter(q => q.type === 'mcq');
  const wqs = ex.questions.filter(q => q.type !== 'mcq');
  const opt = (q, i) => `${L[i]}. ${esc(q.options[i])}`;
  const mcqRows = mcqs.map(q => {
    const a = at.answers[q.id];
    const ok = q.answer != null && a === q.answer;
    const badge = q.answer == null ? '<span class="badge yellow">No key</span>' : a == null ? '<span class="badge">—</span>' : ok ? '<span class="badge green">✓</span>' : '<span class="badge red">✗</span>';
    return `<div class="row"><div class="grow"><div class="title">${esc(q.n)}. ${esc(q.text.replace(/\s+/g, ' ').slice(0, 140))}</div>
      <div class="meta">Answered: ${a == null ? 'nothing' : opt(q, a)}${!ok && q.answer != null ? ` · Correct: ${opt(q, q.answer)}` : ''}</div></div>${badge}</div>`;
  }).join('');
  const sug = at.aiMarks || {};
  const wrCards = wqs.map(q => `<div class="card exam-q">${q.type === 'cq' ? `<div class="exam-qn"><b>${esc(q.n)}.</b></div>` : ''}
    ${q.stimulus ? `<details><summary class="small">Stimulus</summary><div class="doc exam-stim">${renderMarkdown(q.stimulus)}</div></details>` : ''}
    ${qParts(q).map((p, i) => {
      const ans = partAnswer(at, q, i).trim();
      const m = partMark(at, q, i);
      const s = sug[`${q.id}:${i}`];
      return `<div class="exam-part"><div class="doc">${renderMarkdown(`${q.type === 'written' ? `**${q.n}.** ` : p.label ? `**${p.label}.** ` : ''}${p.text} *[${fmtN(p.marks)}]*`)}</div>
        <div class="exam-ans">${ans ? esc(ans) : '<span class="muted">No answer typed (written on paper?)</span>'}</div>
        ${p.answer ? `<details><summary class="small">Model answer</summary><div class="doc small">${renderMarkdown(p.answer)}</div></details>` : ''}
        <div class="mark-row"><label class="mark-in">Marks <input type="number" name="m:${q.id}:${i}" min="0" max="${p.marks}" step="0.5" value="${m == null ? '' : m}" data-sug="${s ? s.marks : ''}"> / ${fmtN(p.marks)}</label>
        ${s ? `<span class="help">AI suggests <b>${fmtN(s.marks)}</b>: ${esc(s.reason)}</span>` : ''}</div></div>`;
    }).join('')}</div>`).join('');
  const busy = ui.examBusy ? ' disabled' : '';
  return `<div class="page-head"><div><h1>${esc(at.title)}</h1>
      <div class="sub">${at.studentId ? esc(studentName(at.studentId)) + ' · ' : ''}${esc(fmtDate(toISO(new Date(at.startedAt))))} · ${mins} min${at.auto ? ' · submitted when time ran out' : ''}</div></div>
      <div class="actions"><button class="btn ghost" data-action="exam-delete" data-id="${at.id}">Delete result</button></div></div>
    <div class="stats">
      <div class="card stat"><div class="label">Total</div><div class="value">${fmtN(sc.got)} / ${fmtN(sc.max)}</div><div class="hint">${sc.max ? Math.round((sc.got / sc.max) * 100) : 0}%${sc.pending ? ' so far' : ''}</div></div>
      ${sc.mcqCount ? `<div class="card stat"><div class="label">MCQ</div><div class="value">${sc.mcqRight} / ${sc.mcqCount}</div><div class="hint">correct</div></div>` : ''}
      ${wqs.length ? `<div class="card stat"><div class="label">Written</div><div class="value">${sc.pending ? sc.pending : '✓'}</div><div class="hint">${sc.pending ? 'answers to mark' : 'marked'}</div></div>` : ''}
    </div>
    ${wqs.length ? `<div class="section"><h2>Mark written answers</h2>
      <p class="muted small" style="margin-bottom:10px">Type the marks for each part. For answers written on paper, read the paper and enter the marks here.${cqLimit(ex, wqs.filter(q => q.type === 'cq').length) < wqs.filter(q => q.type === 'cq').length ? ` Only the best ${ex.cqChoose} creative questions count.` : ''}</p>
      <form id="mark-form" class="form">${wrCards}
        <div class="form-actions"><button type="button" class="btn" data-action="exam-ai-mark" data-id="${at.id}"${busy}>${ui.examBusy ? `<span class="spinner"></span> ${esc(ui.examBusy)}` : 'Suggest marks with AI'}</button>
          ${Object.keys(sug).length ? '<button type="button" class="btn" id="use-sug">Use AI marks</button>' : ''}<button class="btn primary">Save marks</button></div></form></div>` : ''}
    ${mcqs.length ? `<div class="section"><h2>Multiple choice</h2><div class="card"><div class="list">${mcqRows}</div></div></div>` : ''}`;
}

function readMarkForm(form, at, ex) {
  for (const input of form.querySelectorAll('input[name^="m:"]')) {
    const [, qid, part] = input.name.split(':');
    const q = ex.questions.find(x => x.id === qid);
    if (!q) continue;
    const max = Number(input.max);
    const v = input.value.trim() === '' ? null : Math.min(max, Math.max(0, Number(input.value)));
    if (q.type === 'cq') {
      const m = { ...(isObj(at.marks[qid]) ? at.marks[qid] : {}) };
      if (v == null || !Number.isFinite(v)) delete m[part]; else m[part] = v;
      at.marks[qid] = m;
    } else if (v == null || !Number.isFinite(v)) delete at.marks[qid];
    else at.marks[qid] = v;
  }
}

function bindResult() {
  const form = document.getElementById('mark-form');
  if (!form) return;
  const id = parseHash().parts[1];
  const use = form.querySelector('#use-sug');
  if (use) use.onclick = () => form.querySelectorAll('input[data-sug]').forEach(i => { if (i.dataset.sug !== '') i.value = i.dataset.sug; });
  form.onsubmit = e => {
    e.preventDefault();
    const at = getAttempt(id), ex = at && getExam(at.examId);
    if (!at || !ex) return;
    readMarkForm(form, at, ex);
    at.status = 'marked';
    if (!save()) return;
    render();
    toast('Marks saved');
  };
}

async function aiMarkAttempt(id) {
  const at = getAttempt(id), ex = at && getExam(at.examId);
  if (!at || !ex || ui.examBusy) return;
  const form = document.getElementById('mark-form');
  if (form) readMarkForm(form, at, ex);
  const items = ex.questions.filter(q => q.type !== 'mcq').map(q => ({
    id: q.id, stimulus: q.stimulus || undefined,
    parts: qParts(q).map((p, i) => ({ part: i, question: `${p.label ? p.label + '. ' : ''}${p.text}`, max: p.marks, model_answer: p.answer || undefined, student_answer: partAnswer(at, q, i).trim() }))
      .filter(p => p.student_answer),
  })).filter(x => x.parts.length);
  if (!items.length) return toast('No typed answers to mark. Enter the marks for answers written on paper yourself.');
  if (!aiReady()) { toast('Set up an AI provider in Settings first', 'error'); return; }
  save();
  ui.examBusy = 'Marking…';
  render();
  try {
    const data = parseJSONReply(await callAI(MARK_SYSTEM, markPrompt(items), { temperature: 0.2, json: true }));
    const out = {};
    for (const m of Array.isArray(data.marks) ? data.marks : []) {
      const q = isObj(m) && ex.questions.find(x => x.id === m.id && x.type !== 'mcq');
      const i = q && Math.round(num(m.part));
      const p = q && qParts(q)[i];
      if (!p) continue;
      out[`${q.id}:${i}`] = { marks: Math.min(p.marks, Math.max(0, Math.round(num(m.marks) * 2) / 2)), reason: str(m.reason, 400) };
    }
    const cur = getAttempt(id);
    if (cur) { cur.aiMarks = out; save(); }
    toast(Object.keys(out).length ? 'AI marks ready. Check them, then press "Use AI marks" and Save.' : "The AI didn't suggest any marks. Try again.", Object.keys(out).length ? null : 'error');
  } catch (err) {
    toast(`Couldn't get AI marks: ${err.message || err}`, 'error');
  } finally {
    ui.examBusy = false;
  }
  if (parseHash().parts[0] === 'result') render();
}

// ── Settings ─────────────────────────────────────────────────
const CURRENCIES = ['৳', '₹', 'Rs ', '$', '£', '€', 'RM ', 'SAR '];
function viewSettings() {
  const prov = db.ai.provider;
  const p = AI_PROVIDERS[prov];
  const curOptions = CURRENCIES.includes(db.settings.currency) ? CURRENCIES : [db.settings.currency, ...CURRENCIES];
  return `<div class="page-head"><div><h1>Settings</h1><div class="sub">Everything is stored only in this browser.</div></div></div>
    <div class="grid">
      <div class="card"><h2>Profile</h2><form class="form" id="f-profile">
        <div class="form-row"><label class="field">Your name<input name="tutorName" value="${esc(db.settings.tutorName)}" placeholder="Shown in payment reminders"></label>
          <label class="field">Currency<select name="currency">${curOptions.map(c => `<option value="${esc(c)}"${c === db.settings.currency ? ' selected' : ''}>${esc(c.trim())}</option>`).join('')}</select></label></div>
        <div class="form-actions"><button class="btn primary">Save profile</button></div></form></div>

      <div class="card"><h2>AI provider (free)</h2>
        <p class="muted small" style="margin-bottom:12px">Only the class, subject, topics and any file or text you attach are sent to the AI. Student names, phone numbers and money are never sent. Your key stays in this browser.</p>
        <form class="form" id="f-ai">
          <label class="field">Provider<select name="provider">${Object.entries(AI_PROVIDERS).map(([k, v]) => `<option value="${k}"${k === prov ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
          <div class="notice">${esc(p.note.replace('{origin}', location.origin))} ${p.needsKey ? `Get a free key: <a href="${p.keyUrl}" target="_blank" rel="noopener">${esc(p.keyUrl.replace('https://', ''))}</a>` : `<a href="${p.keyUrl}" target="_blank" rel="noopener">Download Ollama</a>`}</div>
          ${p.needsKey ? `<label class="field">API key<input name="key" type="password" autocomplete="off" value="${esc(db.ai.keys[prov] || '')}" placeholder="Paste your ${esc(p.name)} key"></label>` : ''}
          ${modelFieldHTML(prov)}
          <div class="form-actions"><button type="button" class="btn" id="ai-test">Test connection</button><button class="btn primary">Save AI settings</button></div>
        </form></div>

      <div class="card"><h2>Backup & data</h2>
        <p class="muted small" style="margin-bottom:12px">${db.settings.lastBackup ? `Last backup: ${esc(fmtDate(db.settings.lastBackup.slice(0, 10)))}.` : 'No backup yet.'} Keep a backup file in Google Drive or email it to yourself, and import it to move to a new phone or browser.</p>
        <div class="actions"><button class="btn primary" data-action="backup">Download backup</button>
          <label class="btn">Restore from file<input type="file" id="import-file" accept=".json,application/json" hidden></label>
          <button class="btn" data-action="export-csv">Export money CSV</button>
          <button class="btn ghost" data-action="load-demo">Load demo data</button>
          <button class="btn danger" data-action="erase-all">Erase all data</button></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="backup-keys"> Include AI keys in the backup file</label></div>

      <div class="card" id="install-card"${installPrompt ? '' : ' hidden'}><h2>Install app</h2><p class="muted small" style="margin-bottom:12px">Add Manator to your home screen; it works offline.</p><button class="btn primary" data-action="install">Install</button></div>
      <p class="muted small">${db.students.length} students · ${db.lessons.length} classes · ${db.payments.length} payments · ${db.docs.length} AI documents</p>
    </div>`;
}

function modelFieldHTML(prov) {
  const c = cachedModels(prov);
  const list = c ? c.list : [];
  const chosen = chosenModel(prov);
  const auto = autoModels(prov)[0];
  const opts = [...list, ...(chosen && !list.includes(chosen) ? [chosen] : [])];
  const when = c ? new Date(c.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `<label class="field">Model<select name="model">
      <option value="">Auto – strongest available${c && auto ? ` (now ${esc(auto)})` : ''}</option>
      ${opts.map(m => `<option value="${esc(m)}"${m === chosen ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <div class="help">${c ? `${list.length} models available, checked ${esc(when)}.` : 'The model list loads from the provider when you test or refresh.'}
      Auto picks the strongest model and moves to the next one by itself if a model is retired or hits its free limit.
      <button type="button" class="btn sm ghost" id="ai-refresh">Refresh list</button></div>`;
}

function bindSettings() {
  document.getElementById('f-profile').onsubmit = e => {
    e.preventDefault();
    const f = formData(e.target);
    db.settings.tutorName = f.tutorName;
    db.settings.currency = e.target.currency.value;
    if (!save()) return; render(); toast('Profile saved');
  };
  const aiForm = document.getElementById('f-ai');
  const storeAI = () => {
    const f = formData(aiForm);
    if (aiForm.key) db.ai.keys[db.ai.provider] = f.key;
    db.ai.models[db.ai.provider] = aiForm.model.value;
  };
  document.getElementById('ai-refresh').onclick = async ev => {
    storeAI(); if (!save()) return;
    if (!aiReady()) return toast('Paste your API key first', 'error');
    const btn = ev.currentTarget;
    btn.disabled = true; btn.textContent = 'Loading…';
    try { const list = await fetchModelList(); render(); toast(`${list.length} models found`); } catch (err) {
      toast(`Couldn't load models: ${err.message}`, 'error'); btn.disabled = false; btn.textContent = 'Refresh list';
    }
  };
  aiForm.provider.addEventListener('change', () => { storeAI(); db.ai.provider = aiForm.provider.value; if (!save()) return; render(); });
  aiForm.onsubmit = e => { e.preventDefault(); storeAI(); if (!save()) return; toast('AI settings saved'); };
  document.getElementById('ai-test').onclick = async ev => {
    storeAI(); if (!save()) return;
    if (!aiReady()) return toast('Paste your API key first', 'error');
    const btn = ev.currentTarget;
    btn.disabled = true; btn.textContent = 'Testing…';
    try {
      const out = await callAI('You are a connection test.', 'Reply with exactly: OK', { maxTokens: 1024, temperature: 0 });
      toast(`Connected to ${AI_PROVIDERS[db.ai.provider].name} (${aiLastModel}): "${out.trim().slice(0, 40)}"`);
      render();
    } catch (err) {
      toast(`Connection failed: ${err.message}`, 'error');
    } finally { btn.disabled = false; btn.textContent = 'Test connection'; }
  };
  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      confirmDialog('Restore backup?', 'This replaces all data in this browser with the backup file.', 'Restore', () => {
        try { importBackup(reader.result); render(); toast('Backup restored'); } catch (err) { toast(err.message, 'error'); }
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  const card = document.getElementById('install-card');
  if (card) card.hidden = false;
});

// ── Demo data ────────────────────────────────────────────────
function loadDemo() {
  const t = todayISO();
  const mk = (o) => ({ id: uid(), active: true, createdAt: new Date().toISOString(), phone: '', address: '', notes: '', ...o });
  const rahim = mk({ name: 'Rahim Ahmed', grade: 'Class 8', curriculum: 'National (Bangla medium)', subjects: ['Math', 'Science'], guardianName: 'Karim Ahmed', guardianPhone: '01711000000', schedule: [{ day: 6, time: '17:00', duration: 60 }, { day: 1, time: '17:00', duration: 60 }, { day: 3, time: '17:00', duration: 60 }] });
  const nusrat = mk({ name: 'Nusrat Jahan', grade: 'Class 10 (SSC)', curriculum: 'National (English version)', subjects: ['Physics', 'Chemistry'], guardianName: 'Salma Begum', guardianPhone: '01811000000', schedule: [{ day: 0, time: '19:00', duration: 90 }, { day: 2, time: '19:00', duration: 90 }, { day: 4, time: '19:00', duration: 90 }] });
  const tanvir = mk({ name: 'Tanvir Hasan', grade: 'O Level', curriculum: 'Cambridge', subjects: ['Mathematics D'], guardianName: 'Farzana Hasan', guardianPhone: '', schedule: [{ day: 5, time: '10:00', duration: 120 }] });
  const students = [rahim, nusrat, tanvir];
  const contracts = [
    { id: uid(), studentId: rahim.id, title: 'Math & Science', fee: 3000, cycleType: 'classes', cycleLength: 12, startDate: addDays(t, -42), billing: 'end', status: 'active', notes: '' },
    { id: uid(), studentId: nusrat.id, title: 'Physics & Chemistry', fee: 4000, cycleType: 'months', cycleLength: 1, startDate: addDays(addMonths(t, -2), -5), billing: 'end', status: 'active', notes: '' },
    { id: uid(), studentId: tanvir.id, title: 'Mathematics D', fee: 5000, cycleType: 'days', cycleLength: 30, startDate: addDays(t, -20), billing: 'start', status: 'active', notes: '' },
  ];
  const topics = {
    Math: ['Algebraic expressions: like terms', 'Factorisation: a² − b²', 'Linear equations in one variable', 'Word problems on equations', 'Ratio and proportion', 'Profit and loss', 'Area of triangles and quadrilaterals'],
    Science: ['Cell structure and functions', 'Photosynthesis', 'Acids, bases and salts', 'Force and pressure', 'Light: reflection'],
    Physics: ['Motion: velocity and acceleration', 'Newton’s laws of motion', 'Work, power and energy', 'Pressure in liquids', 'Heat and temperature', 'Waves and sound'],
    Chemistry: ['Atomic structure', 'Periodic table trends', 'Chemical bonding', 'Mole concept', 'Acids, bases and pH'],
    'Mathematics D': ['Sets and Venn diagrams', 'Indices and surds', 'Quadratic equations', 'Simultaneous equations', 'Trigonometry: SOH CAH TOA', 'Vectors'],
  };
  const lessons = [];
  for (const s of students) {
    const c = contracts.find(x => x.studentId === s.id);
    let i = 0;
    for (let day = c.startDate; day < t; day = addDays(day, 1)) {
      const slot = s.schedule.find(x => x.day === parseISO(day).getDay());
      if (!slot) continue;
      const subject = s.subjects[i % s.subjects.length];
      const list = topics[subject];
      const absent = i % 9 === 7;
      lessons.push({ id: uid(), studentId: s.id, contractId: c.id, date: day, time: slot.time, duration: slot.duration, subject,
        status: absent ? 'absent' : 'taught', topics: absent ? '' : list[Math.floor(i / s.subjects.length) % list.length],
        homework: absent ? '' : (i % 2 ? 'Exercise questions 1–10' : 'Revise today\'s notes'), notes: '', createdAt: new Date().toISOString() });
      i++;
    }
  }
  const payments = [
    { id: uid(), studentId: rahim.id, contractId: contracts[0].id, amount: 3000, date: addDays(t, -12), method: 'Cash', note: 'First 12 classes' },
    { id: uid(), studentId: nusrat.id, contractId: contracts[1].id, amount: 4000, date: addDays(addMonths(t, -1), -3), method: 'bKash', note: '' },
    { id: uid(), studentId: tanvir.id, contractId: contracts[2].id, amount: 5000, date: addDays(t, -20), method: 'Bank', note: 'Advance' },
  ];
  const expenses = [
    { id: uid(), amount: 600, date: addDays(t, -6), category: 'Transport', note: 'Rickshaw & bus' },
    { id: uid(), amount: 250, date: addDays(t, -15), category: 'Printing', note: 'Model test papers' },
    { id: uid(), amount: 450, date: addDays(addMonths(t, -1), -2), category: 'Transport', note: '' },
  ];
  db.students.push(...students);
  db.contracts.push(...contracts);
  db.lessons.push(...lessons);
  db.payments.push(...payments.map(p => ({ ...p, createdAt: new Date().toISOString() })));
  db.expenses.push(...expenses.map(x => ({ ...x, createdAt: new Date().toISOString() })));
  db.goals.push({ id: uid(), name: 'New laptop', target: 65000, saved: 12000, targetDate: addMonths(todayISO(), 6), createdAt: new Date().toISOString() });
  return save();
}

// ── Actions (delegated clicks) ───────────────────────────────
const ACTIONS = {
  'add-student': () => openStudentForm(),
  'edit-student': d => openStudentForm(getStudent(d.id)),
  'delete-student': d => {
    const s = getStudent(d.id);
    confirmDialog('Delete student?', `This permanently deletes ${s.name} with all their classes, contracts and payments. Archive instead to keep the history.`, 'Delete', () => {
      if (!deleteStudent(d.id)) return; location.hash = '#/students'; toast('Student deleted');
    });
  },
  'toggle-archive': d => { const s = getStudent(d.id); s.active = s.active === false; if (!save()) return; render(); toast(s.active ? 'Student unarchived' : 'Student archived'); },
  'add-contract': d => openContractForm(d.student),
  'edit-contract': d => { const c = getContract(d.id); openContractForm(c.studentId, c); },
  'end-contract': d => {
    const c = getContract(d.id);
    openModal('End contract', `<form class="form"><p class="muted">No new fees are billed after the end date. Anything already owed stays owed.</p>
      <label class="field">End date<input type="date" name="endDate" value="${todayISO()}" required></label>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">End contract</button></div></form>`,
    body => { body.querySelector('form').onsubmit = e => { e.preventDefault(); const cur = liveRecord('contracts', c); if (!cur) { closeModal(); return render(); } cur.status = 'ended'; cur.endDate = e.target.endDate.value; if (!save()) return; closeModal(); render(); toast('Contract ended'); }; });
  },
  'reopen-contract': d => { const c = getContract(d.id); c.status = 'active'; delete c.endDate; if (!save()) return; render(); },
  'delete-contract': d => confirmDialog('Delete contract?', 'Its payments and classes are kept but no longer linked to a contract.', 'Delete', () => { if (!deleteContract(d.id)) return; render(); toast('Contract deleted'); }),
  'log-lesson': d => openLessonForm({ studentId: d.student, time: d.time, duration: d.duration }),
  'edit-lesson': d => openLessonForm({ lesson: db.lessons.find(l => l.id === d.id) }),
  'quick-absent': d => {
    const l = { id: uid(), studentId: d.student, contractId: defaultContractFor(d.student), date: todayISO(), time: d.time || '', status: 'absent', subject: (getStudent(d.student).subjects || [])[0] || '', topics: '', homework: '', notes: '', createdAt: new Date().toISOString() };
    db.lessons.push(l); if (!save()) return; render();
    toast(`${studentName(d.student)} marked absent`, null, { label: 'Undo', fn: () => { db.lessons = db.lessons.filter(x => x.id !== l.id); if (!save()) return; render(); } });
  },
  'add-payment': d => openPaymentForm({ studentId: d.student, contractId: d.contract }),
  'edit-payment': d => openPaymentForm({ payment: db.payments.find(p => p.id === d.id) }),
  'add-expense': () => openExpenseForm(),
  'edit-expense': d => openExpenseForm(db.expenses.find(x => x.id === d.id)),
  'copy-reminder': d => { const c = getContract(d.contract); copyText(reminderText(getStudent(c.studentId), c, contractStatus(c))); },
  'classes-all-time': () => { ui.classesMonth = ''; render(); },
  'export-csv': () => exportCSV(),
  'add-goal': () => openGoalForm(),
  'edit-goal': d => openGoalForm(db.goals.find(g => g.id === d.id)),
  'goal-deposit': d => openGoalDeposit(d.id),
  'money-ai-chip': d => {
    ui.moneyQ = d.q;
    const t = view.querySelector('#money-ai-form [name=q]');
    if (t) { t.value = d.q; t.focus(); }
  },
  'money-ai-copy': () => ui.moneyAI && ui.moneyAI.content && copyText(ui.moneyAI.content),
  'backup': () => {
    const keys = document.getElementById('backup-keys');
    downloadFile(`manator-backup-${todayISO()}.json`, exportBackup(keys && keys.checked), 'application/json');
    db.settings.lastBackup = new Date().toISOString(); if (!save()) return; render();
    toast('Backup downloaded');
  },
  'load-demo': () => {
    const go = () => { if (!loadDemo()) return; location.hash = '#/'; render(); toast('Demo data loaded. Erase it any time in Settings.'); };
    if (db.students.length) confirmDialog('Add demo data?', 'Three sample students with classes and payments will be added next to your own data.', 'Add demo data', go);
    else go();
  },
  'erase-all': () => confirmDialog('Erase everything?', 'All students, classes, contracts, payments and AI documents in this browser will be deleted. Download a backup first if unsure.', 'Erase all', () => {
    const ai = db.ai; db = defaultState(); db.ai = ai; if (!save()) return; location.hash = '#/'; render(); toast('All data erased');
  }),
  'install': async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); },
  'open-doc': d => openDoc(db.docs.find(x => x.id === d.id)),
  'import-doc': () => importDocForm(),
  'ai-save': () => {
    const r = ui.aiResult; if (!r || r.savedId) return;
    const doc = { id: uid(), type: r.tool, title: r.title, content: r.content, studentId: r.studentId, meta: r.meta, createdAt: new Date().toISOString() };
    db.docs.push(doc); if (!save()) return; r.savedId = doc.id; render(); toast('Saved to your AI library');
  },
  'ai-copy': () => ui.aiResult && copyText(ui.aiResult.content),
  'ai-print': () => ui.aiResult && printMarkdown(ui.aiResult.title, ui.aiResult.content),
  'ai-print-paper': () => ui.aiResult && printMarkdown(ui.aiResult.title, splitAnswerKey(ui.aiResult.content).paper),
  'ai-regen': () => generateAI(draft(ui.aiTool), ui.aiTool),
  'ai-check': () => checkAIResult(ui.aiResult),
  'ai-fix': () => { const r = ui.aiResult; if (r && r.check && r.check.report) reviseAIResult(r, `Fix these problems that a checker found. Where the checker is wrong, leave that question as it is.\n${r.check.report}`); },
  'ai-undo': () => { const r = ui.aiResult; if (!r || !r.prev || ui.aiBusy) return; r.content = r.prev; r.prev = null; r.check = null; r.savedId = null; render(); },
  'ai-exam': () => {
    const r = ui.aiResult;
    if (!r || ui.aiBusy) return;
    if (!r.savedId) ACTIONS['ai-save']();
    const doc = r.savedId && db.docs.find(x => x.id === r.savedId);
    if (doc) openExamSetup(doc, { studentId: r.studentId });
  },
  'exam-submit': d => {
    const at = getAttempt(d.id), ex = at && getExam(at.examId);
    if (!at || at.status !== 'running') return;
    const p = examProgress(ex, at);
    const left = p.total - p.done;
    confirmDialog('Submit exam?', `${left ? `${left} question${left === 1 ? ' is' : 's are'} not answered yet. ` : ''}You can't change answers after submitting.`, 'Submit', () => submitAttempt(d.id));
  },
  'exam-ai-mark': d => aiMarkAttempt(d.id),
  'exam-delete': d => confirmDialog('Delete this result?', 'The student\'s answers and marks for this exam will be deleted.', 'Delete', () => {
    db.attempts = db.attempts.filter(a => a.id !== d.id);
    if (!save()) return;
    location.hash = '#/ai?tool=results';
    toast('Result deleted');
  }),
  'src-remove': d => {
    const form = document.getElementById('ai-form');
    if (form) readAIForm(form, ui.aiTool);
    ui.aiSources[ui.aiTool] = aiSources(ui.aiTool).filter(x => x.id !== d.id);
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el);
});

// Another tab saved: reload. Open forms look their record up again by id when submitted.
window.addEventListener('storage', e => { if (e.key === STORE_KEY) { db = loadState(); if (modalRoot.hidden) render(); } });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}

render();
