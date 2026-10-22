import React, { useState } from 'react';
import { useStore } from '../store/context';
import { fmtDate, fmtN } from '../utils/date';
import { renderMarkdown, callAI, MARK_SYSTEM, markPrompt } from '../services/ai';
import { ConfirmModal } from '../components/ConfirmModal';
import { Question } from '../types';

interface ResultViewProps {
  attemptId: string;
  onNavigate: (route: string, param?: string) => void;
}

export const ResultView: React.FC<ResultViewProps> = ({ attemptId, onNavigate }) => {
  const { state, studentName, saveAttempt, deleteAttempt, saveExam, toast } = useStore();
  const attempt = state.attempts.find(a => a.id === attemptId);
  const exam = attempt ? state.exams.find(e => e.id === attempt.examId) : null;

  const [marksState, setMarksState] = useState<Record<string, any>>(attempt?.marks || {});
  const [aiMarks, setAiMarks] = useState<Record<string, { marks: number; reason: string }>>(
    attempt?.aiMarks || {}
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (!attempt || !exam) {
    return (
      <div className="card empty">
        Result not found.{' '}
        <a
          href="#/ai?tool=results"
          onClick={e => {
            e.preventDefault();
            onNavigate('ai', 'tool=results');
          }}
        >
          All results
        </a>
      </div>
    );
  }

  const mcqs = exam.questions.filter(q => q.type === 'mcq');
  const wqs = exam.questions.filter(q => q.type !== 'mcq');

  // Calculate scores
  let mcqGot = 0;
  let mcqRight = 0;
  for (const q of mcqs) {
    if (q.type === 'mcq' && q.answer != null && attempt.answers[q.id] === q.answer) {
      mcqGot += q.marks || 1;
      mcqRight++;
    }
  }

  let writtenGot = 0;
  let pendingCount = 0;
  for (const q of wqs) {
    if (q.type === 'cq') {
      for (let i = 0; i < q.parts.length; i++) {
        const m = marksState[`${q.id}:${i}`];
        if (m !== undefined && m !== '') {
          writtenGot += Number(m);
        } else {
          pendingCount++;
        }
      }
    } else {
      const m = marksState[q.id];
      if (m !== undefined && m !== '') {
        writtenGot += Number(m);
      } else {
        pendingCount++;
      }
    }
  }

  const totalMax = exam.questions.reduce((sum, q) => {
    if (q.type === 'cq') {
      return sum + q.parts.reduce((pSum, p) => pSum + p.marks, 0);
    }
    return sum + (q.marks || 1);
  }, 0);

  const totalScore = mcqGot + writtenGot;

  const handleAIMark = async () => {
    if (aiBusy) return;
    setAiBusy(true);

    try {
      const items: any[] = [];
      for (const q of wqs) {
        if (q.type === 'cq') {
          items.push({
            id: q.id,
            stimulus: q.stimulus,
            parts: q.parts.map((p, i) => ({
              part: i,
              question: `${p.label ? p.label + '. ' : ''}${p.text}`,
              max: p.marks,
              model_answer: p.answer,
              student_answer: String(attempt.answers[q.id]?.[i] || '').trim(),
            })).filter(p => p.student_answer),
          });
        } else {
          items.push({
            id: q.id,
            parts: [{
              part: 0,
              question: q.text,
              max: q.marks,
              model_answer: q.answer,
              student_answer: String(attempt.answers[q.id] || '').trim(),
            }].filter(p => p.student_answer),
          });
        }
      }

      if (!items.length) {
        toast('No typed answers to evaluate automatically.', 'info');
        setAiBusy(false);
        return;
      }

      const promptText = markPrompt(items);
      const res = await callAI(MARK_SYSTEM, promptText, state, { temperature: 0.2, json: true, onFallback: (msg) => toast(msg, 'info') });
      const parsed = JSON.parse(res);

      const out: Record<string, { marks: number; reason: string }> = {};
      for (const m of parsed.marks || []) {
        out[`${m.id}:${m.part}`] = { marks: Number(m.marks) || 0, reason: m.reason || '' };
      }

      setAiMarks(out);
      saveAttempt({ ...attempt, aiMarks: out });
      toast('AI mark recommendations ready! Review and apply.', 'success');
    } catch (err: any) {
      toast(err.message || 'AI marking failed', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleUseAIMarks = () => {
    const updated = { ...marksState };
    for (const [k, v] of Object.entries(aiMarks)) {
      updated[k] = v.marks;
    }
    setMarksState(updated);
    toast('Applied AI suggested marks', 'info');
  };

  const handleSaveMarks = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...attempt,
      status: 'marked' as const,
      marks: marksState,
      aiMarks,
    };
    saveAttempt(updated);
    toast('Marks saved successfully', 'success');
  };

  const handleSetMCQAnswer = (qId: string, correctIdx: number) => {
    const updatedQuestions = exam.questions.map(q => {
      if (q.id === qId && q.type === 'mcq') {
        return { ...q, answer: correctIdx };
      }
      return q;
    });
    saveExam({ ...exam, questions: updatedQuestions });
    toast('MCQ answer key updated', 'success');
  };

  const L = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{attempt.title}</h1>
          <div className="sub">
            {attempt.studentId ? `${studentName(attempt.studentId)} · ` : ''}
            {fmtDate(new Date(attempt.startedAt).toISOString().slice(0, 10))}
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setDeleteConfirmOpen(true)}>
            Delete result
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Total Score</div>
          <div className="value">
            {fmtN(totalScore)} / {fmtN(totalMax)}
          </div>
          <div className="hint">
            {totalMax ? Math.round((totalScore / totalMax) * 100) : 0}%
            {pendingCount > 0 ? ' (partial)' : ''}
          </div>
        </div>
        {mcqs.length > 0 && (
          <div className="card stat">
            <div className="label">MCQ Score</div>
            <div className="value">
              {mcqRight} / {mcqs.length}
            </div>
            <div className="hint">correct</div>
          </div>
        )}
        {wqs.length > 0 && (
          <div className="card stat">
            <div className="label">Written Grading</div>
            <div className="value">{pendingCount ? `${pendingCount} to mark` : 'Marked'}</div>
          </div>
        )}
      </div>

      {/* Written questions marking */}
      {wqs.length > 0 && (
        <div className="section">
          <h2>Mark written answers</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Review student responses and assign marks. You can also ask AI for scoring recommendations.
          </p>

          <form onSubmit={handleSaveMarks}>
            {wqs.map(q => (
              <div key={q.id} className="card exam-q" style={{ marginBottom: '14px' }}>
                <div className="exam-qn">
                  <b>Question {q.n}</b>
                </div>

                {'stimulus' in q && q.stimulus && (
                  <details style={{ marginBottom: '8px' }}>
                    <summary className="small muted">Stimulus</summary>
                    <div
                      className="doc exam-stim"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(q.stimulus) }}
                    />
                  </details>
                )}

                {q.type === 'cq' ? (
                  q.parts.map((p, pIdx) => {
                    const ans = String(attempt.answers[q.id]?.[pIdx] || '').trim();
                    const key = `${q.id}:${pIdx}`;
                    const sug = aiMarks[key];

                    return (
                      <div key={pIdx} className="exam-part">
                        <div className="doc">
                          <b>({p.label})</b> {p.text} *[{p.marks} marks]*
                        </div>
                        <div className="exam-ans">
                          {ans || <span className="muted">No typed response (written on paper)</span>}
                        </div>
                        {p.answer && (
                          <details style={{ margin: '4px 0' }}>
                            <summary className="small muted">Model answer</summary>
                            <div className="doc small">{p.answer}</div>
                          </details>
                        )}
                        <div className="mark-row">
                          <label className="mark-in">
                            Marks{' '}
                            <input
                              type="number"
                              min="0"
                              max={p.marks}
                              step="0.5"
                              value={marksState[key] ?? ''}
                              onChange={e =>
                                setMarksState({
                                  ...marksState,
                                  [key]: e.target.value === '' ? '' : Number(e.target.value),
                                })
                              }
                            />{' '}
                            / {p.marks}
                          </label>
                          {sug && (
                            <span className="help">
                              AI suggests <b>{sug.marks}</b>: {sug.reason}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div>
                    <div
                      className="doc"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(q.text) }}
                    />
                    <div className="exam-ans">
                      {String(attempt.answers[q.id] || '').trim() || (
                        <span className="muted">No typed response</span>
                      )}
                    </div>
                    {q.answer && (
                      <details style={{ margin: '4px 0' }}>
                        <summary className="small muted">Model answer</summary>
                        <div className="doc small">{q.answer}</div>
                      </details>
                    )}
                    <div className="mark-row">
                      <label className="mark-in">
                        Marks{' '}
                        <input
                          type="number"
                          min="0"
                          max={q.marks}
                          step="0.5"
                          value={marksState[q.id] ?? ''}
                          onChange={e =>
                            setMarksState({
                              ...marksState,
                              [q.id]: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                        />{' '}
                        / {q.marks}
                      </label>
                      {aiMarks[`${q.id}:0`] && (
                        <span className="help">
                          AI suggests <b>{aiMarks[`${q.id}:0`].marks}</b>:{' '}
                          {aiMarks[`${q.id}:0`].reason}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={handleAIMark}
                disabled={aiBusy}
              >
                {aiBusy ? <span className="spinner" /> : 'Suggest marks with AI'}
              </button>
              {Object.keys(aiMarks).length > 0 && (
                <button type="button" className="btn" onClick={handleUseAIMarks}>
                  Use AI suggestions
                </button>
              )}
              <button type="submit" className="btn primary">
                Save marks
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MCQ review section */}
      {mcqs.length > 0 && (
        <div className="section">
          <h2>Multiple Choice Review</h2>
          <div className="card">
            <div className="list">
              {mcqs.map((q: Question) => {
                if (q.type !== 'mcq') return null;
                const studentChoice = attempt.answers[q.id];
                const isCorrect = q.answer != null && studentChoice === q.answer;

                return (
                  <div key={q.id} className="row">
                    <div className="grow">
                      <div className="title">
                        <b>{q.n}.</b> {q.text}
                      </div>
                      <div className="meta">
                        Student answered:{' '}
                        {studentChoice != null
                          ? `${L[studentChoice]} ${q.options[studentChoice] || ''}`
                          : 'Nothing'}
                        {q.answer != null && !isCorrect && (
                          <> · Correct: {L[q.answer]} {q.options[q.answer]}</>
                        )}
                      </div>
                    </div>
                    {q.answer == null ? (
                      <select
                        onChange={e =>
                          e.target.value !== '' &&
                          handleSetMCQAnswer(q.id, Number(e.target.value))
                        }
                        defaultValue=""
                      >
                        <option value="">Set key…</option>
                        {q.options.map((opt, i) => (
                          <option key={i} value={i}>
                            {L[i]} {opt}
                          </option>
                        ))}
                      </select>
                    ) : isCorrect ? (
                      <span className="badge green">✓</span>
                    ) : (
                      <span className="badge red">✗</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete this result?"
        message="The student's recorded score and answers will be permanently deleted."
        confirmLabel="Delete"
        isDanger
        onConfirm={() => {
          deleteAttempt(attempt.id);
          toast('Result deleted', 'info');
          onNavigate('ai', 'tool=results');
        }}
        onClose={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
};
