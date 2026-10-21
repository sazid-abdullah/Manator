import { Contract, Lesson, Payment, Goal, Student, AppState } from '../types';
import { addDays, addMonths, daysBetween, monthKey, todayISO, fmtDate } from '../utils/date';

export const CYCLE_TYPES = {
  days: { label: 'Every N days', unit: (n: number) => (n === 1 ? 'day' : 'days') },
  months: { label: 'Every N months', unit: (n: number) => (n === 1 ? 'month' : 'months') },
  classes: { label: 'Every N classes', unit: (n: number) => (n === 1 ? 'class' : 'classes') },
};

export function cycleLabel(c: { cycleType: string; cycleLength: number }): string {
  const n = Number(c.cycleLength) || 1;
  if (c.cycleType === 'months' && n === 1) return 'monthly';
  const unitFn = (CYCLE_TYPES as any)[c.cycleType]?.unit;
  return `every ${n} ${unitFn ? unitFn(n) : c.cycleType}`;
}

export function contractLessons(lessons: Lesson[], c: Contract, upTo?: string): Lesson[] {
  return lessons
    .filter(l => l.contractId === c.id && l.status === 'taught' && l.date >= c.startDate && (!upTo || l.date <= upTo))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

export function cycleEndDate(c: Contract, k: number): string {
  const n = Number(c.cycleLength) || 1;
  return c.cycleType === 'months' ? addMonths(c.startDate, k * n) : addDays(c.startDate, k * n);
}

export interface ContractStatusResult {
  fee: number;
  completed: number;
  billedCycles: number;
  billed: number;
  paid: number;
  balance: number;
  unpaidCycles: number;
  owedSince: string | null;
  progress: number;
  remaining: number | null;
  nextDue: { kind: 'classes'; classesLeft: number } | { kind: 'date'; date: string; daysLeft: number } | null;
  taught: number;
  started: boolean;
  ended: boolean;
}

export function contractStatus(
  c: Contract,
  lessons: Lesson[],
  payments: Payment[],
  today: string = todayISO()
): ContractStatusResult {
  const n = Math.max(1, Number(c.cycleLength) || 1);
  const fee = Number(c.fee) || 0;
  const ended = c.status === 'ended';
  const asOf = ended && c.endDate && c.endDate < today ? c.endDate : today;
  const started = c.startDate <= asOf;
  const advance = c.billing === 'start';

  let completed = 0;
  let progress = 0;
  let nextDue: ContractStatusResult['nextDue'] = null;
  let remaining: number | null = null;
  let taught = 0;

  if (c.cycleType === 'classes') {
    const list = contractLessons(lessons, c, asOf);
    taught = list.length;
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

  let billedCycles = completed;
  if (advance && started) {
    billedCycles = completed + 1;
    if (ended && progress === 0 && completed > 0) billedCycles = completed;
    if (c.cycleType === 'classes' && ended && completed > 0 && taught === completed * n) billedCycles = completed;
  }
  if (!started) billedCycles = 0;

  const billed = billedCycles * fee;
  const paid = payments
    .filter(p => p.contractId === c.id && p.date <= today)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = billed - paid;

  let owedSince: string | null = null;
  if (balance > 0 && fee > 0) {
    const firstUnpaid = Math.floor(paid / fee) + 1;
    if (c.cycleType === 'classes') {
      const list = contractLessons(lessons, c, asOf);
      const idx = advance ? (firstUnpaid - 1) * n - 1 : firstUnpaid * n - 1;
      owedSince = idx < 0 ? c.startDate : list[idx] ? list[idx].date : null;
    } else {
      owedSince = advance ? (firstUnpaid === 1 ? c.startDate : cycleEndDate(c, firstUnpaid - 1)) : cycleEndDate(c, firstUnpaid);
    }
  }

  const unpaidCycles = fee > 0 ? Math.max(0, Math.ceil(balance / fee - 1e-9)) : 0;

  return {
    fee,
    completed,
    billedCycles,
    billed,
    paid,
    balance,
    unpaidCycles,
    owedSince,
    progress,
    remaining,
    nextDue,
    taught,
    started,
    ended,
  };
}

export function describeNextDue(c: Contract, st: ContractStatusResult): string {
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

export function isDueSoon(c: Contract, st: ContractStatusResult): boolean {
  if (st.ended || !st.started || !st.nextDue || st.balance > 0) return false;
  if (st.nextDue.kind === 'classes') return st.nextDue.classesLeft <= 2;
  return st.nextDue.daysLeft <= 3;
}

export function studentBalance(
  studentId: string,
  contracts: Contract[],
  lessons: Lesson[],
  payments: Payment[]
): number {
  return contracts
    .filter(c => c.studentId === studentId)
    .reduce((s, c) => s + contractStatus(c, lessons, payments).balance, 0);
}

export function activeContracts(
  studentId: string,
  contracts: Contract[],
  date: string = todayISO()
): Contract[] {
  return contracts
    .filter(c => c.studentId === studentId)
    .filter(c => c.status !== 'ended' || (c.endDate && c.endDate >= date));
}

export function defaultContractFor(
  studentId: string,
  contracts: Contract[],
  date: string = todayISO()
): string | null {
  const list = activeContracts(studentId, contracts, date);
  const running = list.find(c => c.startDate <= date);
  return running ? running.id : list.length ? list[0].id : null;
}

export const AVG_MONTH_DAYS = 30.44;

export function expectedMonthlyFees(state: AppState, today: string = todayISO()) {
  const running = state.contracts.filter(c => {
    const s = state.students.find(st => st.id === c.studentId);
    return s && s.active !== false && c.startDate <= today && !(c.status === 'ended' && (!c.endDate || c.endDate < today));
  });
  const classContracts: Record<string, number> = {};
  for (const c of running) {
    if (c.cycleType === 'classes') {
      classContracts[c.studentId] = (classContracts[c.studentId] || 0) + 1;
    }
  }

  let total = 0;
  let count = 0;
  for (const c of running) {
    const s = state.students.find(st => st.id === c.studentId);
    const n = Math.max(1, Number(c.cycleLength) || 1);
    const fee = Number(c.fee) || 0;
    let classes = 0;
    if (c.cycleType === 'classes') {
      const windowDays = Math.min(60, daysBetween(c.startDate, today));
      const linked = contractLessons(state.lessons, c, today).filter(l => l.date > addDays(today, -windowDays)).length;
      classes = windowDays >= 14 && linked
        ? (linked * AVG_MONTH_DAYS) / windowDays
        : ((s?.schedule || []).length / (classContracts[c.studentId] || 1)) * (AVG_MONTH_DAYS / 7);
    }
    total += c.cycleType === 'months' ? fee / n : c.cycleType === 'days' ? (fee * AVG_MONTH_DAYS) / n : (fee * classes) / n;
    count++;
  }
  return { total, count };
}

export interface MoneySnapshotResult {
  today: string;
  history: Array<{ k: string; inc: number; exp: number }>;
  current: { k: string; inc: number; exp: number };
  basisMonths: string[];
  basisPartial: boolean;
  avgIncome: number;
  avgExpense: number;
  avgNet: number;
  expenseByCategory: Record<string, number>;
  outstanding: number;
  expected: { total: number; count: number };
  activeStudents: number;
}

export function moneySnapshot(state: AppState, today: string = todayISO()): MoneySnapshotResult {
  const cur = monthKey(today);
  const monthTotals = (k: string) => ({
    inc: state.payments.filter(p => monthKey(p.date) === k).reduce((a, p) => a + (Number(p.amount) || 0), 0),
    exp: state.expenses.filter(x => monthKey(x.date) === k).reduce((a, x) => a + (Number(x.amount) || 0), 0),
  });

  const history: Array<{ k: string; inc: number; exp: number }> = [];
  for (let i = 6; i >= 1; i--) {
    const k = monthKey(addMonths(cur + '-01', -i));
    history.push({ k, ...monthTotals(k) });
  }
  const current = { k: cur, ...monthTotals(cur) };
  const recent = history.filter(x => x.inc || x.exp).slice(-3);
  const basis = recent.length ? recent : [current];
  const avgIncome = basis.reduce((a, x) => a + x.inc, 0) / basis.length;
  const avgExpense = basis.reduce((a, x) => a + x.exp, 0) / basis.length;
  const basisKeys = new Set(basis.map(x => x.k));
  const expenseByCategory: Record<string, number> = {};
  for (const x of state.expenses) {
    if (basisKeys.has(monthKey(x.date))) {
      expenseByCategory[x.category] = (expenseByCategory[x.category] || 0) + (Number(x.amount) || 0) / basis.length;
    }
  }

  const allDuesList = state.contracts
    .map(c => ({ c, st: contractStatus(c, state.lessons, state.payments, today), s: state.students.find(st => st.id === c.studentId) }))
    .filter(x => x.s);

  return {
    today,
    history,
    current,
    basisMonths: basis.map(x => x.k),
    basisPartial: !recent.length,
    avgIncome,
    avgExpense,
    avgNet: avgIncome - avgExpense,
    expenseByCategory,
    outstanding: allDuesList.reduce((a, x) => a + Math.max(0, x.st.balance), 0),
    expected: expectedMonthlyFees(state, today),
    activeStudents: state.students.filter(s => s.active !== false).length,
  };
}

export interface GoalPlanResult {
  remaining: number;
  pct: number;
  status: 'done' | 'on-track' | 'short' | 'open' | 'past' | 'no-savings';
  perMonth: number | null;
  eta: string | null;
  monthsLeft: number | null;
}

export function goalPlan(g: Goal, avgNet: number, today: string = todayISO()): GoalPlanResult {
  const target = Number(g.target) || 0;
  const saved = Number(g.saved) || 0;
  const remaining = Math.max(0, target - saved);
  const pct = target > 0 ? Math.min(1, saved / target) : 0;
  if (!remaining) return { remaining, pct, status: 'done', perMonth: null, eta: null, monthsLeft: null };
  const daysLeft = g.targetDate ? daysBetween(today, g.targetDate) : null;
  const monthsLeft = daysLeft == null ? null : daysLeft / AVG_MONTH_DAYS;
  const perMonth = daysLeft == null || daysLeft <= 0 || !monthsLeft ? null : remaining / monthsLeft;
  const eta = avgNet > 0 ? addDays(today, Math.ceil((remaining / avgNet) * AVG_MONTH_DAYS)) : null;
  let status: GoalPlanResult['status'];
  if (daysLeft != null && daysLeft <= 0) status = 'past';
  else if (avgNet <= 0) status = 'no-savings';
  else if (perMonth == null) status = 'open';
  else status = perMonth <= avgNet + 0.005 ? 'on-track' : 'short';
  return { remaining, pct, status, perMonth, eta, monthsLeft };
}
