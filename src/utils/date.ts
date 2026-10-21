export function pad2(n: number | string): string {
  return String(n).padStart(2, '0');
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function parseISO(s: string): Date {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function monthKey(iso: string): string {
  return String(iso).slice(0, 7);
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '';
  return parseISO(iso).toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtMonth(key: string): string {
  if (!key) return '';
  return parseISO(key + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function fmtTime(t?: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function nowTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes() - (d.getMinutes() % 5))}`;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export function bnNum(v: string | number): string {
  return String(v).replace(/\d/g, d => BN_DIGITS[Number(d)]);
}

export function fmtClock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function fmtN(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function esc(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
