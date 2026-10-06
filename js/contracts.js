// Contract billing: a fee is charged once per cycle. A cycle is N days, N calendar
// months, or N taught classes. Fees are billed at the end of each cycle (post-paid)
// or at the start (advance), and every payment linked to the contract reduces the balance.

const CYCLE_TYPES = {
  days: { label: 'Every N days', unit: n => (n === 1 ? 'day' : 'days') },
  months: { label: 'Every N months', unit: n => (n === 1 ? 'month' : 'months') },
  classes: { label: 'Every N classes', unit: n => (n === 1 ? 'class' : 'classes') },
};

function cycleLabel(c) {
  const n = Number(c.cycleLength) || 1;
  if (c.cycleType === 'months' && n === 1) return 'monthly';
  return `every ${n} ${CYCLE_TYPES[c.cycleType] ? CYCLE_TYPES[c.cycleType].unit(n) : c.cycleType}`;
}

function contractLessons(c, upTo) {
  return db.lessons
    .filter(l => l.contractId === c.id && l.status === 'taught' && l.date >= c.startDate && (!upTo || l.date <= upTo))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

// Date on which cycle k (1-based) ends, for time-based contracts.
function cycleEndDate(c, k) {
  const n = Number(c.cycleLength) || 1;
  return c.cycleType === 'months' ? addMonths(c.startDate, k * n) : addDays(c.startDate, k * n);
}

function contractStatus(c, today) {
  today = today || todayISO();
  const n = Math.max(1, Number(c.cycleLength) || 1);
  const fee = Number(c.fee) || 0;
  const ended = c.status === 'ended';
  const asOf = ended && c.endDate && c.endDate < today ? c.endDate : today;
  const started = c.startDate <= asOf;
  const advance = c.billing === 'start';

  let completed = 0;
  let progress = 0;
  let nextDue = null;
  let remaining = null;
  let taught = 0;

  if (c.cycleType === 'classes') {
    const lessons = contractLessons(c, asOf);
    taught = lessons.length;
    completed = Math.floor(taught / n);
    const inCycle = taught - completed * n;
    progress = inCycle / n;
    remaining = n - inCycle;
    nextDue = { kind: 'classes', classesLeft: remaining };
  } else if (started) {
    while (cycleEndDate(c, completed + 1) <= asOf) completed++;
    const cycleStart = completed === 0 ? c.startDate : cycleEndDate(c, completed);
    const cycleEnd = cycleEndDate(c, completed + 1);
    const total = Math.max(1, daysBetween(cycleStart, cycleEnd));
    progress = Math.min(1, daysBetween(cycleStart, asOf) / total);
    remaining = daysBetween(asOf, cycleEnd);
    nextDue = { kind: 'date', date: cycleEnd, daysLeft: remaining };
  }

  // An ended contract stops billing new cycles. An advance-billed cycle that
  // already started still counts, so a contract ended mid-cycle keeps it.
  let billedCycles = completed;
  if (advance && started) {
    billedCycles = completed + 1;
    if (ended && progress === 0 && completed > 0) billedCycles = completed;
    if (c.cycleType === 'classes' && ended && completed > 0 && taught === completed * n) billedCycles = completed;
  }
  if (!started) billedCycles = 0;

  const billed = billedCycles * fee;
  // Payments dated in the future don't count yet, so they can't hide money owed today.
  const paid = db.payments.filter(p => p.contractId === c.id && p.date <= today).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = billed - paid;

  // When the oldest unpaid fee became due, to show how long it has been owed.
  let owedSince = null;
  if (balance > 0 && fee > 0) {
    const firstUnpaid = Math.floor(paid / fee) + 1; // 1-based cycle index
    if (c.cycleType === 'classes') {
      const lessons = contractLessons(c, asOf);
      const idx = advance ? (firstUnpaid - 1) * n - 1 : firstUnpaid * n - 1;
      owedSince = idx < 0 ? c.startDate : (lessons[idx] ? lessons[idx].date : null);
    } else {
      owedSince = advance ? (firstUnpaid === 1 ? c.startDate : cycleEndDate(c, firstUnpaid - 1)) : cycleEndDate(c, firstUnpaid);
    }
  }

  const unpaidCycles = fee > 0 ? Math.max(0, Math.ceil(balance / fee - 1e-9)) : 0;

  return {
    fee, completed, billedCycles, billed, paid, balance, unpaidCycles, owedSince,
    progress, remaining, nextDue, taught, started, ended,
  };
}

function describeNextDue(c, st) {
  if (st.ended) return 'Contract ended';
  if (!st.started) return `Starts ${fmtDate(c.startDate)}`;
  const advance = c.billing === 'start';
  const what = advance ? 'Next cycle starts' : 'Next fee due';
  if (!st.nextDue) return '';
  if (st.nextDue.kind === 'classes') {
    const k = st.nextDue.classesLeft;
    return `${what} after ${k} more ${k === 1 ? 'class' : 'classes'}`;
  }
  const d = st.nextDue.daysLeft;
  const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
  return `${what} ${when} (${fmtDate(st.nextDue.date, { day: 'numeric', month: 'short' })})`;
}

// "Soon" means within 3 days or 2 classes, for dashboard reminders.
function isDueSoon(c, st) {
  if (st.ended || !st.started || !st.nextDue || st.balance > 0) return false;
  if (st.nextDue.kind === 'classes') return st.nextDue.classesLeft <= 2;
  return st.nextDue.daysLeft <= 3;
}

function studentBalance(studentId) {
  return studentContracts(studentId).reduce((s, c) => s + contractStatus(c).balance, 0);
}

function allDues() {
  return db.contracts
    .map(c => ({ c, st: contractStatus(c), s: getStudent(c.studentId) }))
    .filter(x => x.s);
}

function defaultContractFor(studentId, date) {
  date = date || todayISO();
  const list = activeContracts(studentId, date);
  const running = list.find(c => c.startDate <= date);
  return running ? running.id : list.length ? list[0].id : null;
}
