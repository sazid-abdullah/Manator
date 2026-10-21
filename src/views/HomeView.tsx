import React from 'react';
import { useStore } from '../store/context';
import { todayISO, fmtDate, fmtTime, monthKey, daysBetween, WEEKDAYS } from '../utils/date';
import { contractStatus, isDueSoon, describeNextDue } from '../store/contracts';
import { Lesson, Student } from '../types';

interface HomeViewProps {
  onNavigate: (route: string, param?: string) => void;
  onOpenLessonModal: (opts: { studentId?: string; time?: string; duration?: number; lesson?: Lesson }) => void;
  onOpenPaymentModal: (opts: { studentId?: string; contractId?: string }) => void;
  onOpenStudentModal: () => void;
}

const AVATAR_COLORS = ['#5b8cff', '#3ecf8e', '#f59e0b', '#ef6f9b', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

export function renderAvatar(s: Student, size?: number) {
  let h = 0;
  for (const ch of s.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initials = s.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  const style = size
    ? {
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.round(size / 2.6)}px`,
        background: AVATAR_COLORS[h % AVATAR_COLORS.length],
      }
    : { background: AVATAR_COLORS[h % AVATAR_COLORS.length] };
  return <div className="avatar" style={style}>{initials || '?'}</div>;
}

export function statusBadge(status: string) {
  if (status === 'absent') return <span className="badge yellow">Absent</span>;
  if (status === 'cancelled') return <span className="badge">Cancelled</span>;
  return <span className="badge green">Taught</span>;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  onOpenLessonModal,
  onOpenPaymentModal,
  onOpenStudentModal,
}) => {
  const { state, money, studentName, saveLesson, toast, loadDemoData } = useStore();
  const today = todayISO();
  const dow = new Date().getDay();
  const greetName = state.settings.tutorName
    ? `, ${state.settings.tutorName.split(' ')[0]}`
    : '';

  if (!state.students.length) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>Welcome{greetName}</h1>
            <div className="sub">Your private tuition manager. Everything stays securely on this device.</div>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '36px 20px' }}>
          <h2>Start by adding your first student</h2>
          <p className="muted" style={{ margin: '8px auto 18px', maxWidth: '460px' }}>
            Add their weekly schedule and fee contract (e.g. {money(3000)} every 12 classes, or monthly).
            Then log what you teach each day and Tuitrix keeps track of the money.
          </p>
          <div className="actions" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={onOpenStudentModal}>
              + Add student
            </button>
            <button className="btn" onClick={loadDemoData}>
              Try with demo data
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeStudents = state.students.filter(s => s.active !== false);
  const todaysLessons = state.lessons.filter(l => l.date === today);

  // Scheduled classes for today
  const scheduled: Array<{ s: Student; slot: { day: number; time: string; duration: number }; lesson?: Lesson }> = [];
  for (const s of activeStudents) {
    for (const slot of s.schedule || []) {
      if (Number(slot.day) === dow) {
        scheduled.push({ s, slot });
      }
    }
  }
  scheduled.sort((a, b) => (a.slot.time || '').localeCompare(b.slot.time || ''));

  const used = new Set<string>();
  const slotsPerStudent: Record<string, number> = {};
  for (const x of scheduled) {
    slotsPerStudent[x.s.id] = (slotsPerStudent[x.s.id] || 0) + 1;
  }
  for (const x of scheduled) {
    x.lesson = todaysLessons.find(
      l => !used.has(l.id) && l.studentId === x.s.id && (l.time || '') === (x.slot.time || '')
    );
    if (x.lesson) used.add(x.lesson.id);
  }
  for (const x of scheduled) {
    if (x.lesson || slotsPerStudent[x.s.id] > 1) continue;
    x.lesson = todaysLessons.find(l => !used.has(l.id) && l.studentId === x.s.id);
    if (x.lesson) used.add(x.lesson.id);
  }
  const extraLessons = todaysLessons.filter(l => !used.has(l.id));

  // Stats
  const currentMonth = monthKey(today);
  const income = state.payments
    .filter(p => monthKey(p.date) === currentMonth)
    .reduce((a, p) => a + Number(p.amount || 0), 0);
  const taughtMonth = state.lessons.filter(
    l => monthKey(l.date) === currentMonth && l.status === 'taught'
  ).length;

  const dues = state.contracts
    .map(c => ({
      c,
      st: contractStatus(c, state.lessons, state.payments, today),
      s: state.students.find(st => st.id === c.studentId),
    }))
    .filter(x => x.s);

  const owed = dues
    .filter(x => x.st.balance > 0.005)
    .sort((a, b) => (a.st.owedSince || '9').localeCompare(b.st.owedSince || '9'));
  const soon = dues.filter(x => isDueSoon(x.c, x.st));
  const outstanding = owed.reduce((a, x) => a + x.st.balance, 0);

  const recentLessons = [...state.lessons]
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .slice(0, 5);

  const backupDays = state.settings.lastBackup
    ? daysBetween(state.settings.lastBackup.slice(0, 10), today)
    : null;
  const backupNotice =
    (backupDays === null || backupDays > 14) && state.lessons.length >= 5 ? (
      <div className="notice warn">
        Your data lives safely in this browser. {backupDays === null ? "You haven't made a backup yet." : `Last backup was ${backupDays} days ago.`}{' '}
        <a href="#/settings" onClick={e => { e.preventDefault(); onNavigate('settings'); }}>
          Download a backup in Settings
        </a>
      </div>
    ) : null;

  const waLink = (phone?: string, text?: string) => {
    let d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 11 && d.startsWith('01')) d = '88' + d;
    return `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`;
  };

  const reminderText = (s: Student, c: any, st: any) => {
    const sign = state.settings.tutorName ? `\n— ${state.settings.tutorName}` : '';
    const why =
      c.cycleType === 'classes' ? ` (${st.billedCycles * c.cycleLength} classes completed)` : '';
    return `Hello! A friendly reminder that the tuition fee of ${money(st.balance)} for ${s.name}${why} is due. Thank you!${sign}`;
  };

  const handleQuickAbsent = (sid: string, slotTime: string) => {
    const s = state.students.find(x => x.id === sid);
    saveLesson({
      studentId: sid,
      date: today,
      time: slotTime,
      status: 'absent',
      subject: s?.subjects?.[0] || '',
    });
    toast(`${studentName(sid)} marked absent`, 'info');
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Hello{greetName}</h1>
          <div className="sub">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => onOpenLessonModal({})}>
            + Log class
          </button>
          <button className="btn" onClick={() => onOpenPaymentModal({})}>
            + Payment
          </button>
        </div>
      </div>

      {backupNotice}

      <div className="stats">
        <div className="card stat">
          <div className="label">Active students</div>
          <div className="value">{activeStudents.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Classes this month</div>
          <div className="value">{taughtMonth}</div>
        </div>
        <div className="card stat">
          <div className="label">Collected this month</div>
          <div className="value pos">{money(income)}</div>
        </div>
        <div className="card stat">
          <div className="label">Outstanding</div>
          <div className={`value ${outstanding > 0 ? 'neg' : ''}`}>{money(outstanding)}</div>
          <div className="hint">{owed.length} payment{owed.length === 1 ? '' : 's'} due</div>
        </div>
      </div>

      <div className="grid-2">
        {/* Today's classes */}
        <div className="card">
          <div className="card-head">
            <h2>Today's classes</h2>
            <span className="muted small">{scheduled.length} scheduled</span>
          </div>
          <div className="list">
            {scheduled.length === 0 && extraLessons.length === 0 ? (
              <div className="empty">No classes scheduled today.</div>
            ) : (
              <>
                {scheduled.map(({ s, slot, lesson }, idx) => (
                  <div key={idx} className="row">
                    <span className="time-pill">{fmtTime(slot.time) || '—'}</span>
                    <a
                      className="grow"
                      href={`#/student/${s.id}`}
                      onClick={e => {
                        e.preventDefault();
                        onNavigate('student', s.id);
                      }}
                      style={{ color: 'inherit' }}
                    >
                      <div className="title">{s.name}</div>
                      <div className="meta">
                        {[s.grade, (s.subjects || []).join(', ')].filter(Boolean).join(' · ')}
                      </div>
                    </a>
                    <div className="actions">
                      {lesson ? (
                        <>
                          {statusBadge(lesson.status)}
                          <button
                            className="btn sm ghost"
                            onClick={() => onOpenLessonModal({ lesson })}
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn sm green"
                            onClick={() =>
                              onOpenLessonModal({
                                studentId: s.id,
                                time: slot.time,
                                duration: slot.duration,
                              })
                            }
                          >
                            Log class
                          </button>
                          <button
                            className="btn sm ghost"
                            onClick={() => handleQuickAbsent(s.id, slot.time)}
                          >
                            Absent
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {extraLessons.map(l => (
                  <div key={l.id} className="row">
                    <span className="time-pill">{fmtTime(l.time) || 'Extra'}</span>
                    <div className="grow">
                      <div className="title">{studentName(l.studentId)}</div>
                      <div className="meta">{l.subject || ''} · extra class</div>
                    </div>
                    <div className="actions">
                      {statusBadge(l.status)}
                      <button
                        className="btn sm ghost"
                        onClick={() => onOpenLessonModal({ lesson: l })}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Payments due */}
        <div className="card">
          <div className="card-head">
            <h2>Payments due</h2>
            {outstanding > 0 && <span className="badge red">{money(outstanding)}</span>}
          </div>
          <div className="list">
            {owed.length === 0 ? (
              <div className="empty">Nobody owes you anything right now.</div>
            ) : (
              owed.map(({ c, st, s }) => {
                const days = st.owedSince ? daysBetween(st.owedSince, today) : null;
                const since = st.owedSince
                  ? days! <= 0
                    ? 'due today'
                    : `overdue ${days} day${days === 1 ? '' : 's'} (since ${fmtDate(st.owedSince, { day: 'numeric', month: 'short' })})`
                  : '';
                const phone = s?.guardianPhone || s?.phone;
                const wa = waLink(phone, s ? reminderText(s, c, st) : '');

                return (
                  <div key={c.id} className="row">
                    {s && renderAvatar(s)}
                    <a
                      className="grow"
                      href={`#/student/${s?.id}`}
                      onClick={e => {
                        e.preventDefault();
                        if (s) onNavigate('student', s.id);
                      }}
                      style={{ color: 'inherit' }}
                    >
                      <div className="title">
                        {s?.name} <span className="badge red">{money(st.balance)}</span>
                      </div>
                      <div className="meta">
                        {c.title || 'Contract'} ·{' '}
                        {st.unpaidCycles > 1 ? `${st.unpaidCycles} cycles unpaid · ` : ''}
                        {since}
                      </div>
                    </a>
                    <div className="actions">
                      {wa ? (
                        <a className="btn sm ghost" href={wa} target="_blank" rel="noopener noreferrer">
                          Remind
                        </a>
                      ) : (
                        <button
                          className="btn sm ghost"
                          onClick={() => {
                            if (s) {
                              navigator.clipboard?.writeText(reminderText(s, c, st));
                              toast('Reminder message copied', 'info');
                            }
                          }}
                        >
                          Copy reminder
                        </button>
                      )}
                      <button
                        className="btn sm primary"
                        onClick={() =>
                          onOpenPaymentModal({ studentId: s?.id, contractId: c.id })
                        }
                      >
                        Record payment
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {soon.length > 0 && (
            <>
              <h3
                className="muted small"
                style={{ marginTop: '14px', textTransform: 'uppercase', letterSpacing: '.04em' }}
              >
                Coming up
              </h3>
              <div className="list">
                {soon.map(({ c, st, s }) => (
                  <div key={c.id} className="row">
                    {s && renderAvatar(s)}
                    <div className="grow">
                      <div className="title">{s?.name}</div>
                      <div className="meta">
                        {c.title || 'Contract'} · {money(c.fee)} · {describeNextDue(c, st)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent classes */}
      <div className="section">
        <h2>
          Recent classes{' '}
          <a
            className="small"
            href="#/classes"
            onClick={e => {
              e.preventDefault();
              onNavigate('classes');
            }}
          >
            See all
          </a>
        </h2>
        {recentLessons.length === 0 ? (
          <div className="card empty">No classes logged yet.</div>
        ) : (
          recentLessons.map(l => (
            <div key={l.id} className="lesson">
              <div className="top">
                <div>
                  <div className="title">
                    <b>
                      <a
                        href={`#/student/${l.studentId}`}
                        onClick={e => {
                          e.preventDefault();
                          onNavigate('student', l.studentId);
                        }}
                      >
                        {studentName(l.studentId)}
                      </a>
                      {l.subject ? ` · ${l.subject}` : ''}
                    </b>
                  </div>
                  <div className="meta muted small">
                    {fmtDate(l.date, { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                    · {l.time ? fmtTime(l.time) + ' · ' : ''}
                    {l.duration ? `${l.duration} min` : ''}
                  </div>
                </div>
                <div className="actions">
                  {statusBadge(l.status)}
                  <button
                    className="btn sm ghost"
                    onClick={() => onOpenLessonModal({ lesson: l })}
                    aria-label="Edit class"
                  >
                    Edit
                  </button>
                </div>
              </div>
              {l.topics && <div className="topics">{l.topics}</div>}
              {l.homework && (
                <div className="hw">
                  <b>Homework:</b> {l.homework}
                </div>
              )}
              {l.notes && (
                <div className="hw">
                  <b>Notes:</b> {l.notes}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
