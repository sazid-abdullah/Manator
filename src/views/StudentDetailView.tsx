import React, { useState } from 'react';
import { useStore } from '../store/context';
import { renderAvatar, statusBadge } from './HomeView';
import { scheduleSummary } from './StudentsView';
import { studentBalance, contractStatus, cycleLabel, describeNextDue } from '../store/contracts';
import { fmtDate, fmtTime, toISO, fmtN, todayISO } from '../utils/date';
import { ConfirmModal } from '../components/ConfirmModal';
import { ParentReportModal } from '../components/ParentReportModal';
import { generateWhatsAppMessage } from '../utils/whatsapp';
import { Student, Lesson, Contract, Payment, ExamScore } from '../types';

interface StudentDetailViewProps {
  studentId: string;
  onNavigate: (route: string, param?: string) => void;
  onEditStudent: (student: Student) => void;
  onAddContract: (studentId: string) => void;
  onEditContract: (contract: Contract) => void;
  onLogLesson: (opts: { studentId: string; lesson?: Lesson }) => void;
  onRecordPayment: (opts: { studentId: string; contractId?: string; payment?: Payment }) => void;
  onUploadPaper: (studentId: string) => void;
}

export const StudentDetailView: React.FC<StudentDetailViewProps> = ({
  studentId,
  onNavigate,
  onEditStudent,
  onAddContract,
  onEditContract,
  onLogLesson,
  onRecordPayment,
  onUploadPaper,
}) => {
  const { state, getStudent, money, deleteStudent, deleteContract, saveContract, saveStudent, toast, addExamScore, deleteExamScore } = useStore();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [waLang, setWaLang] = useState<'en' | 'bn'>('en');
  const [scoreFormOpen, setScoreFormOpen] = useState(false);
  const [scoreForm, setScoreForm] = useState<Partial<ExamScore>>({
    title: '',
    subject: '',
    date: todayISO(),
    obtainedMarks: 0,
    totalMarks: 100,
    remarks: ''
  });

  const student = getStudent(studentId);
  if (!student) {
    return (
      <div className="card empty">
        Student not found.{' '}
        <a
          href="#/students"
          onClick={e => {
            e.preventDefault();
            onNavigate('students');
          }}
        >
          Back to students
        </a>
      </div>
    );
  }

  const contracts = state.contracts
    .filter(c => c.studentId === student.id)
    .sort((a, b) => (a.status === 'ended' ? 1 : 0) - (b.status === 'ended' ? 1 : 0) || b.startDate.localeCompare(a.startDate));

  const lessons = state.lessons
    .filter(l => l.studentId === student.id)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

  const payments = state.payments
    .filter(p => p.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const docs = state.docs
    .filter(d => d.studentId === student.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const attempts = state.attempts
    .filter(a => a.studentId === student.id)
    .sort((a, b) => b.startedAt - a.startedAt);

  const taught = lessons.filter(l => l.status === 'taught').length;
  const absentCount = lessons.filter(l => l.status === 'absent').length;
  const paidTotal = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const bal = studentBalance(student.id, state.contracts, state.lessons, state.payments);

  const waLink = (phone?: string, text?: string) => {
    let d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 11 && d.startsWith('01')) d = '88' + d;
    return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  };

  const handleToggleArchive = () => {
    saveStudent({ ...student, active: student.active === false });
    toast(student.active === false ? 'Student unarchived' : 'Student archived', 'info');
  };

  const handleEndContract = (c: Contract) => {
    saveContract({ ...c, status: 'ended', endDate: toISO(new Date()) });
    toast('Contract ended', 'info');
  };

  const handleReopenContract = (c: Contract) => {
    const { endDate, ...rest } = c;
    saveContract({ ...rest, status: 'active' });
    toast('Contract reopened', 'info');
  };

  const handleSaveScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scoreForm.title || !scoreForm.subject || !scoreForm.date || scoreForm.obtainedMarks === undefined || !scoreForm.totalMarks) {
      toast('Please fill all required fields', 'error');
      return;
    }

    addExamScore(student.id, scoreForm as ExamScore);
    setScoreFormOpen(false);
    toast('Exam score logged successfully', 'success');
  };

  const examScores = student?.examScores || [];
  const validScores = examScores.filter(s => s.totalMarks > 0).sort((a, b) => b.date.localeCompare(a.date));
  const avgScore = validScores.length > 0
    ? Math.round(validScores.reduce((sum, s) => sum + (s.obtainedMarks / s.totalMarks), 0) / validScores.length * 100)
    : 0;
  const highestScore = validScores.length > 0
    ? Math.max(...validScores.map(s => Math.round((s.obtainedMarks / s.totalMarks) * 100)))
    : 0;

  return (
    <div>
      <div className="page-head">
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', minWidth: 0 }}>
          {renderAvatar(student, 56)}
          <div style={{ minWidth: 0 }}>
            <h1>
              {student.name}
              {student.active === false && <span className="badge">Archived</span>}
              {(state.batches || []).filter(b => b.studentIds.includes(student.id)).map(b => (
                <span key={b.id} className="badge blue" style={{ marginLeft: '6px' }}>👥 {b.name}</span>
              ))}
            </h1>
            <div className="sub">
              {[student.grade, student.curriculum, (student.subjects || []).join(', ')].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => onLogLesson({ studentId: student.id })}>
            + Log class
          </button>
          <button className="btn" onClick={() => onRecordPayment({ studentId: student.id })}>
            + Payment
          </button>
          <button className="btn" onClick={() => setReportModalOpen(true)}>
            Report / Receipt
          </button>
          <button className="btn" onClick={() => onEditStudent(student)}>
            Edit
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Balance</div>
          <div className={`value ${bal > 0 ? 'neg' : 'pos'}`}>
            {money(Math.abs(bal))}
          </div>
          <div className="hint">
            {bal > 0.005 ? 'owed to you' : bal < -0.005 ? 'paid in advance' : 'all settled'}
          </div>
          {bal > 0.005 && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(student.guardianPhone || student.phone) && (() => {
                const activeC = contracts.find(c => c.status !== 'ended');
                const cStatus = activeC ? contractStatus(activeC, state.lessons, state.payments) : null;
                const lastClass = lessons.find(l => l.status === 'taught');
                const msg = generateWhatsAppMessage({
                  studentName: student.name,
                  lang: waLang,
                  completedClasses: cStatus?.taught !== undefined && activeC?.cycleType === 'classes' ? cStatus.taught - (cStatus.completed * activeC.cycleLength) : taught,
                  targetClasses: activeC?.cycleLength || 'N/A',
                  lastClassDate: lastClass ? fmtDate(lastClass.date) : undefined,
                  lastClassTopic: lastClass?.subject || lastClass?.topics || undefined,
                  dueAmount: String(bal),
                  tutorName: state.settings.tutorName || 'Private Tutor',
                  hasLastClass: !!lastClass
                });

                return (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <a
                      href={waLink(
                        student.guardianPhone || student.phone,
                        msg
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn xs"
                      style={{ fontSize: '0.75rem', padding: '3px 8px', textDecoration: 'none' }}
                    >
                      💬 WhatsApp Bill
                    </a>
                    <select
                      className="btn xs ghost"
                      style={{ fontSize: '0.75rem', padding: '2px 6px', minWidth: '60px' }}
                      value={waLang}
                      onChange={e => setWaLang(e.target.value as 'en' | 'bn')}
                    >
                      <option value="en">EN</option>
                      <option value="bn">বাংলা</option>
                    </select>
                    <button
                      type="button"
                      className="btn xs ghost"
                      style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                      onClick={() => {
                        navigator.clipboard.writeText(msg);
                        toast('Bill text copied to clipboard', 'success');
                      }}
                    >
                      📋 Copy Bill
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div className="card stat">
          <div className="label">Classes taught</div>
          <div className="value">{taught}</div>
          <div className="hint">{absentCount} absent</div>
        </div>
        <div className="card stat">
          <div className="label">Total paid</div>
          <div className="value">{money(paidTotal)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Details</h2>
          <dl className="kv">
            <dt>Schedule</dt>
            <dd>{scheduleSummary(student)}</dd>

            {student.phone && (
              <>
                <dt>Student</dt>
                <dd>
                  <a href={`tel:${student.phone}`}>{student.phone}</a>
                  {waLink(student.phone) && (
                    <>
                      {' · '}
                      <a href={waLink(student.phone)} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    </>
                  )}
                </dd>
              </>
            )}

            {(student.guardianName || student.guardianPhone) && (
              <>
                <dt>Guardian</dt>
                <dd>
                  {student.guardianName}
                  {student.guardianName && student.guardianPhone ? ' · ' : ''}
                  {student.guardianPhone && (
                    <>
                      <a href={`tel:${student.guardianPhone}`}>{student.guardianPhone}</a>
                      {waLink(student.guardianPhone) && (
                        <>
                          {' · '}
                          <a href={waLink(student.guardianPhone)} target="_blank" rel="noopener noreferrer">
                            WhatsApp
                          </a>
                        </>
                      )}
                    </>
                  )}
                </dd>
              </>
            )}

            {student.address && (
              <>
                <dt>Address</dt>
                <dd>{student.address}</dd>
              </>
            )}

            {student.notes && (
              <>
                <dt>Notes</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{student.notes}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="card">
          <h2>AI for {student.name.split(' ')[0]}</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Uses student class, subjects and logged topics. Personal info stays private on your device.
          </p>
          <div className="actions">
            <button
              className="btn"
              onClick={() => onNavigate('ai', `tool=plan&student=${student.id}`)}
            >
              Lesson plan
            </button>
            <button
              className="btn"
              onClick={() => onNavigate('ai', `tool=exam&student=${student.id}`)}
            >
              Exam from classes
            </button>
            <button
              className="btn"
              onClick={() => onNavigate('ai', `tool=worksheet&student=${student.id}`)}
            >
              Worksheet
            </button>
          </div>
          {docs.length > 0 && (
            <div className="list" style={{ marginTop: '12px' }}>
              {docs.slice(0, 5).map(d => (
                <div key={d.id} className="row">
                  <div className="grow">
                    <div className="title">
                      <a
                        href="#/ai"
                        onClick={e => {
                          e.preventDefault();
                          onNavigate('ai', `tool=saved&doc=${d.id}`);
                        }}
                      >
                        {d.title}
                      </a>
                    </div>
                    <div className="meta">
                      {d.type} · {fmtDate(d.createdAt.slice(0, 10))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fee contracts */}
      <div className="section">
        <h2>
          Fee contracts{' '}
          <button className="btn sm" onClick={() => onAddContract(student.id)}>
            + Add contract
          </button>
        </h2>
        {contracts.length === 0 ? (
          <div className="card empty">
            No fee contract yet. Add one to track fees (e.g. {money(3000)} every 12 classes, or monthly).
          </div>
        ) : (
          <div className="grid-2">
            {contracts.map(c => {
              const st = contractStatus(c, state.lessons, state.payments);
              const pct = Math.round(st.progress * 100);
              const progressText =
                c.cycleType === 'classes'
                  ? `${st.taught - st.completed * c.cycleLength} of ${c.cycleLength} classes in this cycle · ${st.taught} taught total`
                  : `${pct}% of current cycle`;

              return (
                <div key={c.id} className="card">
                  <div className="card-head">
                    <div>
                      <h3>{c.title}</h3>
                      <div className="muted small">
                        {money(c.fee)} {cycleLabel(c)} ·{' '}
                        {c.billing === 'start' ? 'paid in advance' : 'paid after cycle'} · since{' '}
                        {fmtDate(c.startDate)}
                        {c.status === 'ended' && c.endDate ? ` · ended ${fmtDate(c.endDate)}` : ''}
                      </div>
                    </div>
                    {c.status === 'ended' ? (
                      <span className="badge">Ended</span>
                    ) : (
                      <span className={`badge ${st.balance > 0.005 ? 'red' : 'green'}`}>
                        {st.balance > 0.005
                          ? `Owes ${money(st.balance)}`
                          : st.balance < -0.005
                          ? `Advance ${money(-st.balance)}`
                          : 'Paid up'}
                      </span>
                    )}
                  </div>

                  {c.status !== 'ended' && st.started && (
                    <>
                      <div className={`progress ${st.remaining && st.remaining <= 2 ? 'warn' : ''}`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <div className="muted small">{progressText}</div>
                    </>
                  )}

                  <div className="small" style={{ marginTop: '6px' }}>
                    {describeNextDue(c, st)}
                  </div>

                  <dl className="kv small" style={{ marginTop: '10px' }}>
                    <dt>Billed so far</dt>
                    <dd>
                      {money(st.billed)} ({st.billedCycles} cycle{st.billedCycles === 1 ? '' : 's'})
                    </dd>
                    <dt>Paid</dt>
                    <dd>{money(st.paid)}</dd>
                  </dl>

                  {c.notes && <p className="muted small" style={{ marginTop: '6px' }}>{c.notes}</p>}

                  <div className="actions" style={{ marginTop: '12px' }}>
                    <button
                      className="btn sm primary"
                      onClick={() => onRecordPayment({ studentId: student.id, contractId: c.id })}
                    >
                      Record payment
                    </button>
                    <button className="btn sm" onClick={() => onEditContract(c)}>
                      Edit
                    </button>
                    {c.status === 'ended' ? (
                      <button className="btn sm ghost" onClick={() => handleReopenContract(c)}>
                        Reopen
                      </button>
                    ) : (
                      <button className="btn sm ghost" onClick={() => handleEndContract(c)}>
                        End contract
                      </button>
                    )}
                    <button
                      className="btn sm ghost"
                      onClick={() => setContractToDelete(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Classes */}
      <div className="section">
        <h2>
          Classes{' '}
          <a
            className="small"
            href={`#/classes?student=${student.id}`}
            onClick={e => {
              e.preventDefault();
              onNavigate('classes', `student=${student.id}`);
            }}
          >
            Open in class log
          </a>
        </h2>
        {lessons.length === 0 ? (
          <div className="card empty">No classes logged yet.</div>
        ) : (
          lessons.slice(0, 10).map(l => (
            <div key={l.id} className="lesson">
              <div className="top">
                <div>
                  <div className="title">
                    <b>{l.subject || 'Class'}</b>
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
                    onClick={() => onLogLesson({ studentId: student.id, lesson: l })}
                  >
                    Edit
                  </button>
                </div>
              </div>
              {l.topics && <div className="topics">{l.topics}</div>}
              {l.homework && <div className="hw"><b>Homework:</b> {l.homework}</div>}
              {l.notes && <div className="hw"><b>Notes:</b> {l.notes}</div>}
            </div>
          ))
        )}
      </div>

      <div className="section">
        <h2>
          📈 Exam Scores & Performance
          <button className="btn sm outline" onClick={() => setScoreFormOpen(true)} style={{ float: 'right' }}>
            Log Exam Score
          </button>
        </h2>

        {scoreFormOpen && (
          <div className="card" style={{ marginBottom: '16px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <h3>Log New Score</h3>
            <form onSubmit={handleSaveScore}>
              <div className="form-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div className="field" style={{ flex: 1, minWidth: '200px' }}>
                  <label>Exam Title *</label>
                  <input type="text" value={scoreForm.title} onChange={e => setScoreForm({ ...scoreForm, title: e.target.value })} placeholder="e.g. Chapter 4 Quiz" required style={{ width: '100%' }} />
                </div>
                <div className="field" style={{ flex: 1, minWidth: '150px' }}>
                  <label>Subject *</label>
                  <input type="text" value={scoreForm.subject} onChange={e => setScoreForm({ ...scoreForm, subject: e.target.value })} placeholder="e.g. Math" required style={{ width: '100%' }} />
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div className="field" style={{ flex: 1, minWidth: '120px' }}>
                  <label>Date *</label>
                  <input type="date" value={scoreForm.date} onChange={e => setScoreForm({ ...scoreForm, date: e.target.value })} required style={{ width: '100%' }} />
                </div>
                <div className="field" style={{ flex: 1, minWidth: '80px' }}>
                  <label>Obtained *</label>
                  <input type="number" min="0" step="0.1" value={scoreForm.obtainedMarks} onChange={e => setScoreForm({ ...scoreForm, obtainedMarks: parseFloat(e.target.value) })} required style={{ width: '100%' }} />
                </div>
                <div className="field" style={{ flex: 1, minWidth: '80px' }}>
                  <label>Total *</label>
                  <input type="number" min="1" step="0.1" value={scoreForm.totalMarks} onChange={e => setScoreForm({ ...scoreForm, totalMarks: parseFloat(e.target.value) })} required style={{ width: '100%' }} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: '16px' }}>
                <label>Remarks</label>
                <input type="text" value={scoreForm.remarks || ''} onChange={e => setScoreForm({ ...scoreForm, remarks: e.target.value })} placeholder="Optional notes" style={{ width: '100%' }} />
              </div>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setScoreFormOpen(false)}>Cancel</button>
                <button type="submit" className="btn primary">Save Score</button>
              </div>
            </form>
          </div>
        )}

        <div className="grid-2" style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          <div className="card stat">
            <div className="label">Average Score</div>
            <div className="value pos">{avgScore}%</div>
            <div className="hint">across {validScores.length} logged exams</div>
          </div>
          <div className="card stat">
            <div className="label">Highest Score</div>
            <div className="value">{highestScore}%</div>
          </div>
        </div>

        {validScores.length > 1 && (
          <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-light)' }}>Performance Trend</h3>
            <div style={{ height: '120px', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
              {[...validScores].reverse().map(s => {
                const percent = Math.round((s.obtainedMarks / s.totalMarks) * 100);
                const height = Math.max(5, percent); // min height 5%
                const color = percent >= 80 ? 'var(--green-main)' : percent >= 60 ? 'var(--yellow-main)' : 'var(--red-main)';
                return (
                  <div key={s.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ fontSize: '10px', marginBottom: '4px', fontWeight: 'bold' }}>{percent}%</div>
                    <div
                      title={`${s.title} (${percent}%)`}
                      style={{
                        width: '100%',
                        maxWidth: '40px',
                        height: `${height}%`,
                        background: color,
                        borderRadius: '4px 4px 0 0',
                        opacity: 0.8
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {validScores.length > 0 && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="list">
              {validScores.map(s => {
                const percent = Math.round((s.obtainedMarks / s.totalMarks) * 100);
                return (
                  <div key={s.id} className="row" style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="grow" style={{ flex: 1 }}>
                      <div className="title" style={{ fontWeight: 'bold' }}>{s.title} <span className="badge" style={{ marginLeft: '8px' }}>{s.subject}</span></div>
                      <div className="meta" style={{ fontSize: '12px', color: 'var(--text-light)' }}>{fmtDate(s.date)} {s.remarks && `• ${s.remarks}`}</div>
                    </div>
                    <div style={{ textAlign: 'right', paddingRight: '12px' }}>
                      <div className="title" style={{ fontWeight: 'bold', color: percent >= 80 ? 'var(--green-main)' : percent >= 60 ? 'var(--yellow-main)' : 'var(--red-main)' }}>
                        {percent}%
                      </div>
                      <div className="meta" style={{ fontSize: '12px', color: 'var(--text-light)' }}>{s.obtainedMarks} / {s.totalMarks}</div>
                    </div>
                    <button className="btn sm ghost" onClick={() => deleteExamScore(student.id, s.id)} title="Delete" style={{ color: 'var(--red-main)', padding: '4px 8px' }}>
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Exams & Attempts */}
      <div className="section">
        <h2>
          Digital Exams{' '}
          <button className="btn sm" onClick={() => onUploadPaper(student.id)}>
            Upload question paper
          </button>
        </h2>
        <div className="card">
          <div className="list">
            {attempts.length === 0 ? (
              <div className="empty">
                No exams taken yet. Upload a question paper or create one in AI to start an on-screen test.
              </div>
            ) : (
              attempts.map(at => {
                const ex = state.exams.find(e => e.id === at.examId);
                return (
                  <a
                    key={at.id}
                    className="row"
                    href={`#/${at.status === 'running' ? 'exam' : 'result'}/${at.id}`}
                    onClick={e => {
                      e.preventDefault();
                      onNavigate(at.status === 'running' ? 'exam' : 'result', at.id);
                    }}
                  >
                    <div className="grow">
                      <div className="title">{at.title}</div>
                      <div className="meta">
                        {fmtDate(toISO(new Date(at.startedAt)))}
                        {ex ? ` · ${ex.questions.length} questions` : ''}
                      </div>
                    </div>
                    {at.status === 'running' ? (
                      <span className="badge yellow">Running</span>
                    ) : (
                      <span className="badge green">View result</span>
                    )}
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Payments history */}
      <div className="section">
        <h2>Payments</h2>
        <div className="card">
          <div className="list">
            {payments.length === 0 ? (
              <div className="empty">No payments recorded yet.</div>
            ) : (
              payments.map(p => {
                const c = p.contractId ? state.contracts.find(x => x.id === p.contractId) : null;
                return (
                  <div key={p.id} className="row">
                    <div className="grow">
                      <div className="title">
                        {money(p.amount)}{' '}
                        <span className="muted small">· {p.method || 'Cash'}</span>
                      </div>
                      <div className="meta">
                        {fmtDate(p.date)}
                        {c ? ` · ${c.title}` : ''}
                        {p.note ? ` · ${p.note}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn sm ghost"
                      onClick={() =>
                        onRecordPayment({ studentId: student.id, payment: p })
                      }
                    >
                      Edit
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="section actions" style={{ marginTop: '24px' }}>
        <button className="btn ghost" onClick={handleToggleArchive}>
          {student.active === false ? 'Unarchive student' : 'Archive student'}
        </button>
        <button className="btn danger" onClick={() => setDeleteConfirmOpen(true)}>
          Delete student
        </button>
      </div>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete student?"
        message={`This permanently deletes ${student.name} along with all their logged classes, fee contracts and payments. You can archive the student instead to retain their history.`}
        confirmLabel="Delete permanently"
        isDanger
        onConfirm={() => {
          deleteStudent(student.id);
          toast('Student deleted', 'info');
          onNavigate('students');
        }}
        onClose={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={!!contractToDelete}
        title="Delete contract?"
        message="Classes and payments already linked will be kept but no longer tied to this contract."
        confirmLabel="Delete"
        isDanger
        onConfirm={() => {
          if (contractToDelete) {
            deleteContract(contractToDelete);
            toast('Contract deleted', 'info');
            setContractToDelete(null);
          }
        }}
        onClose={() => setContractToDelete(null)}
      />
    </div>
  );
};
