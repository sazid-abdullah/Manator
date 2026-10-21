import React, { useState, useEffect } from 'react';
import { useStore } from '../store/context';
import { fmtClock, bnNum, fmtN } from '../utils/date';
import { renderMarkdown } from '../services/ai';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';
import { Question, MCQQuestion, CQQuestion, WrittenQuestion } from '../types';

interface ExamViewProps {
  attemptId: string;
  onNavigate: (route: string, param?: string) => void;
}

export const ExamView: React.FC<ExamViewProps> = ({ attemptId, onNavigate }) => {
  const { state, saveAttempt, toast } = useStore();
  const attempt = state.attempts.find(a => a.id === attemptId);
  const exam = attempt ? state.exams.find(e => e.id === attempt.examId) : null;

  const [timeLeft, setTimeLeft] = useState(
    attempt ? Math.max(0, attempt.endsAt - Date.now()) : 0
  );
  const [answers, setAnswers] = useState<Record<string, any>>(attempt?.answers || {});
  const [flags, setFlags] = useState<string[]>(attempt?.flags || []);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  // Set exam mode on document body
  useEffect(() => {
    document.body.classList.add('exam-mode');
    return () => {
      document.body.classList.remove('exam-mode');
    };
  }, []);

  // Timer loop
  useEffect(() => {
    if (!attempt || attempt.status !== 'running') return;

    const interval = setInterval(() => {
      const remaining = attempt.endsAt - Date.now();
      if (remaining <= 0) {
        clearInterval(interval);
        handleSubmit(true);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [attempt]);

  if (!attempt || !exam) {
    return (
      <div className="card empty">
        Exam not found.{' '}
        <a
          href="#/"
          onClick={e => {
            e.preventDefault();
            onNavigate('home');
          }}
        >
          Return home
        </a>
      </div>
    );
  }

  if (attempt.status !== 'running') {
    return (
      <div className="card exam-done">
        <h1>{attempt.auto ? "Time's up" : 'Exam submitted'}</h1>
        <p className="muted" style={{ margin: '8px 0 16px' }}>
          {attempt.title}
        </p>
        <p>Please return the device to your tutor to review and mark answers.</p>
        <div className="actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
          <button
            className="btn primary"
            onClick={() => onNavigate('result', attempt.id)}
          >
            See result and mark
          </button>
        </div>
      </div>
    );
  }

  const handleSelectMCQ = (qId: string, optIdx: number) => {
    const updated = { ...answers, [qId]: optIdx };
    setAnswers(updated);
    saveAttempt({ ...attempt, answers: updated });
  };

  const handleTextAnswer = (qId: string, val: string, partIdx?: number) => {
    let updated: Record<string, any>;
    if (partIdx !== undefined) {
      const cur = typeof answers[qId] === 'object' && answers[qId] !== null ? answers[qId] : {};
      updated = { ...answers, [qId]: { ...cur, [partIdx]: val } };
    } else {
      updated = { ...answers, [qId]: val };
    }
    setAnswers(updated);
    saveAttempt({ ...attempt, answers: updated });
  };

  const handleToggleBookmark = (qId: string) => {
    const updated = flags.includes(qId)
      ? flags.filter(x => x !== qId)
      : [...flags, qId];
    setFlags(updated);
    saveAttempt({ ...attempt, flags: updated });
  };

  const handleSubmit = (auto: boolean = false) => {
    const submitted = {
      ...attempt,
      status: 'submitted' as const,
      auto,
      submittedAt: Math.min(Date.now(), attempt.endsAt),
      answers,
      flags,
    };
    saveAttempt(submitted);
    if (auto) {
      toast("Time's up! Exam submitted.", 'info');
    } else {
      toast('Exam submitted successfully', 'success');
    }
    onNavigate('result', attempt.id);
  };

  // Compute question answering stats
  const totalQuestions = exam.questions.length;
  const answeredCount = exam.questions.filter(q => {
    if (q.type === 'mcq') return answers[q.id] !== undefined;
    if (q.type === 'cq') {
      const parts = answers[q.id];
      return parts && Object.values(parts).some((v: any) => String(v).trim().length > 0);
    }
    return answers[q.id] && String(answers[q.id]).trim().length > 0;
  }).length;

  const L = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'];

  return (
    <div>
      <div className="exam-head">
        <h1>{attempt.title}</h1>
        <div className="exam-time">Time allowed: {exam.duration} minutes</div>
      </div>

      {exam.instructions && (
        <div className="notice" style={{ marginBottom: '16px' }}>
          {exam.instructions}
        </div>
      )}

      <div className="exam-body">
        {exam.questions.map((q: Question, qIdx: number) => {
          const isFlagged = flags.includes(q.id);

          return (
            <div key={q.id} id={`eq-${q.id}`} className="card exam-q">
              <div className="exam-qn">
                <span>
                  <b>Question {q.n || qIdx + 1}</b>
                  {q.type !== 'mcq' && 'marks' in q && (
                    <span className="muted small"> · {fmtN(q.marks)} marks</span>
                  )}
                </span>
                <button
                  type="button"
                  className={`exam-bm ${isFlagged ? 'on' : ''}`}
                  onClick={() => handleToggleBookmark(q.id)}
                  aria-label="Bookmark"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={isFlagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M6 3h12v18l-6-4.5L6 21z" />
                  </svg>
                </button>
              </div>

              {'stimulus' in q && q.stimulus && (
                <div
                  className="doc exam-stim"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(q.stimulus) }}
                />
              )}

              {q.figure && (
                <img
                  className="exam-fig"
                  src={q.figure}
                  alt="Figure"
                  style={{ maxWidth: '100%', margin: '10px 0' }}
                />
              )}

              {/* MCQ format */}
              {q.type === 'mcq' && (
                <div>
                  <div
                    className="doc"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(q.text) }}
                  />
                  <div className="exam-opts">
                    {q.options.map((opt, optIdx) => (
                      <label key={optIdx} className="exam-opt">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          checked={answers[q.id] === optIdx}
                          onChange={() => handleSelectMCQ(q.id, optIdx)}
                        />
                        <span className="exam-ol">{L[optIdx]}</span>
                        <span className="doc">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* CQ format */}
              {q.type === 'cq' && (
                <div>
                  {q.parts.map((part, pIdx) => (
                    <div key={pIdx} className="exam-part">
                      <div className="doc">
                        <b>({part.label})</b> {part.text} *[{part.marks} marks]*
                      </div>
                      <textarea
                        rows={part.marks > 2 ? 5 : 3}
                        value={answers[q.id]?.[pIdx] || ''}
                        onChange={e => handleTextAnswer(q.id, e.target.value, pIdx)}
                        placeholder="Write your answer here or solve on test paper"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Written format */}
              {q.type === 'written' && (
                <div>
                  <div
                    className="doc"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(q.text) }}
                  />
                  <textarea
                    rows={4}
                    value={answers[q.id] || ''}
                    onChange={e => handleTextAnswer(q.id, e.target.value)}
                    placeholder="Write your answer here or write on paper"
                    style={{ marginTop: '8px' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating question grid drawer button */}
      <button
        type="button"
        className="exam-listbtn"
        onClick={() => setListModalOpen(true)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>Questions</span>
      </button>

      {/* Sticky footer with timer and submit button */}
      <div className="exam-foot">
        <div className="exam-foot-in">
          <span
            className={`exam-timer ${timeLeft <= 60000 ? 'danger' : timeLeft <= 300000 ? 'warn' : ''}`}
          >
            {fmtClock(timeLeft)}
          </span>
          <button
            type="button"
            className="exam-submit"
            onClick={() => setConfirmSubmitOpen(true)}
          >
            Submit Exam
          </button>
          <span className="exam-count">
            {answeredCount} / {totalQuestions}
          </span>
        </div>
      </div>

      {/* Question list modal */}
      <Modal
        title="Question Overview"
        isOpen={listModalOpen}
        onClose={() => setListModalOpen(false)}
      >
        <div className="exam-qgrid">
          {exam.questions.map((q, idx) => {
            const isAnswered =
              q.type === 'mcq'
                ? answers[q.id] !== undefined
                : answers[q.id] && String(answers[q.id]).trim().length > 0;
            const isFlagged = flags.includes(q.id);

            return (
              <button
                key={q.id}
                type="button"
                className={`exam-qnum ${isAnswered ? 'done' : ''}`}
                onClick={() => {
                  setListModalOpen(false);
                  const el = document.getElementById(`eq-${q.id}`);
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {q.n || idx + 1}
                {isFlagged && <i className="flag" />}
              </button>
            );
          })}
        </div>
        <div className="exam-legend">
          <span>
            <i className="sw done" /> Answered
          </span>
          <span>
            <i className="sw" /> Unanswered
          </span>
          <span>
            <i className="sw flagged" /> Bookmarked
          </span>
        </div>
      </Modal>

      {/* Confirm submit modal */}
      <ConfirmModal
        isOpen={confirmSubmitOpen}
        title="Submit exam?"
        message={`You have answered ${answeredCount} of ${totalQuestions} questions.${
          totalQuestions - answeredCount > 0
            ? ` ${totalQuestions - answeredCount} question(s) are still unanswered.`
            : ''
        } You will not be able to modify answers once submitted.`}
        confirmLabel="Submit now"
        onConfirm={() => handleSubmit(false)}
        onClose={() => setConfirmSubmitOpen(false)}
      />
    </div>
  );
};
