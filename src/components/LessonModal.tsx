import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Lesson, LessonStatus } from '../types';
import { defaultContractFor, contractStatus } from '../store/contracts';
import { todayISO, nowTime, parseISO } from '../utils/date';
import { useStore } from '../store/context';

interface LessonModalProps {
  isOpen: boolean;
  lesson?: Lesson | null;
  initialStudentId?: string;
  initialBatchId?: string;
  initialDate?: string;
  initialTime?: string;
  initialDuration?: number;
  initialStatus?: LessonStatus;
  onClose: () => void;
}

export const LessonModal: React.FC<LessonModalProps> = ({
  isOpen,
  lesson,
  initialStudentId,
  initialBatchId,
  initialDate,
  initialTime,
  initialDuration,
  initialStatus,
  onClose,
}) => {
  const { state, saveLesson, logBatchLesson, deleteLesson, getStudent, studentName, toast } = useStore();
  const isNew = !lesson;

  const [mode, setMode] = useState<'single' | 'batch'>(initialBatchId ? 'batch' : 'single');
  const [batchId, setBatchId] = useState(initialBatchId || '');
  const [studentId, setStudentId] = useState('');

  const [attendance, setAttendance] = useState<Record<string, LessonStatus>>({});
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(nowTime());
  const [duration, setDuration] = useState<number | ''>(60);
  const [status, setStatus] = useState<LessonStatus>('taught');
  const [subject, setSubject] = useState('');
  const [contractId, setContractId] = useState<string>('');
  const [topics, setTopics] = useState('');
  const [homework, setHomework] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (lesson) {
      setMode(lesson.batchId ? 'batch' : 'single');
      setBatchId(lesson.batchId || '');
      setStudentId(lesson.studentId);
      setDate(lesson.date);
      setTime(lesson.time || nowTime());
      setDuration(lesson.duration || 60);
      setStatus(lesson.status || 'taught');
      setSubject(lesson.subject || '');
      setContractId(lesson.contractId || '');
      setTopics(lesson.topics || '');
      setHomework(lesson.homework || '');
      setNotes(lesson.notes || '');
    } else {
      const sid = initialStudentId || (state.students[0]?.id ?? '');
      const s = getStudent(sid);
      const curDate = initialDate || todayISO();
      setStudentId(sid);
      setDate(curDate);
      setTime(initialTime || nowTime());
      setDuration(initialDuration || (s?.schedule?.[0]?.duration ?? 60));
      setStatus(initialStatus || 'taught');
      setSubject(s?.subjects?.[0] || '');
      setContractId(defaultContractFor(sid, state.contracts, curDate) || '');
      setTopics('');
      setHomework('');
      setNotes('');
      if (initialBatchId) {
         setMode('batch');
         setBatchId(initialBatchId);
      }
    }
  }, [lesson, initialStudentId, initialBatchId, initialDate, initialTime, initialDuration, initialStatus, isOpen]);

  // Set default attendance when batch changes
  useEffect(() => {
    if (mode === 'batch' && batchId) {
      const b = state.batches?.find(x => x.id === batchId);
      if (b) {
        const att: Record<string, LessonStatus> = {};

        // If we are editing an existing batch session, populate with actual data
        if (lesson?.batchSessionId) {
          const siblingLessons = state.lessons.filter(l => l.batchSessionId === lesson.batchSessionId);
          siblingLessons.forEach(l => {
            att[l.studentId] = l.status;
          });
        } else {
           // New batch lesson, default to all taught
           b.studentIds.forEach(sid => att[sid] = 'taught');
        }

        setAttendance(att);
        if (!subject && b.subjects?.[0]) {
          setSubject(b.subjects[0]);
        }
      }
    }
  }, [mode, batchId, state.batches, lesson]);

  const student = getStudent(studentId);
  const studentContractsList = state.contracts.filter(c => c.studentId === studentId);

  const handleStudentChange = (newSid: string) => {
    setStudentId(newSid);
    const s = getStudent(newSid);
    if (s) {
      setSubject(s.subjects?.[0] || '');
      const dayOfWeek = parseISO(date).getDay();
      const slot = (s.schedule || []).find(x => x.day === dayOfWeek);
      if (slot) {
        if (slot.time) setTime(slot.time);
        if (slot.duration) setDuration(slot.duration);
      }
      setContractId(defaultContractFor(newSid, state.contracts, date) || '');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;

    if (mode === 'batch') {
      if (!batchId) return;
      logBatchLesson({
        batchId,
        batchSessionId: lesson?.batchSessionId || undefined,
        date,
        time: time || undefined,
        duration: duration === '' ? null : Number(duration),
        subject: subject.trim(),
        topics: topics.trim(),
        homework: homework.trim(),
        notes: notes.trim(),
        attendance
      });
      toast(lesson?.batchSessionId ? 'Batch class updated' : 'Batch class logged', 'success');
      onClose();
      return;
    }

    if (!studentId) return;

    const data: Omit<Lesson, 'id'> & { id?: string } = {
      id: lesson?.id,
      studentId,
      date,
      time: time || undefined,
      duration: duration === '' ? null : Number(duration),
      status,
      subject: subject.trim(),
      contractId: contractId || null,
      topics: topics.trim(),
      homework: homework.trim(),
      notes: notes.trim(),
    };

    saveLesson(data);
    toast(isNew ? 'Class logged' : 'Class saved', 'success');

    // Notify if cycle complete
    if (isNew && status === 'taught' && contractId) {
      const c = state.contracts.find(x => x.id === contractId);
      if (c && c.cycleType === 'classes') {
        const st = contractStatus(c, [...state.lessons, { id: 'temp', ...data } as Lesson], state.payments);
        if (st.taught > 0 && st.taught % c.cycleLength === 0) {
          setTimeout(() => {
            toast(
              `${studentName(c.studentId)} completed ${c.cycleLength} classes — fee ${
                c.billing === 'start' ? 'for the next cycle ' : ''
              }is due.`,
              'info'
            );
          }, 300);
        }
      }
    }

    onClose();
  };

  const handleDelete = () => {
    if (!lesson) return;
    deleteLesson(lesson.id);
    toast('Class deleted', 'info');
    onClose();
  };

  return (
    <Modal title={isNew ? 'Log class' : 'Edit class'} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        {isNew && (
          <div className="toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
            <div className="seg">
              <button type="button" className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>Single Student</button>
              <button type="button" className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>Batch / Group</button>
            </div>
          </div>
        )}

        {mode === 'batch' ? (
          <label className="field">
            Batch *
            <select
              name="batchId"
              required
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
            >
              <option value="">Select a batch...</option>
              {(state.batches || [])
                .filter(b => b.active !== false || b.id === batchId)
                .map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label className="field">
            Student *
          <select
            name="studentId"
            required
            value={studentId}
            onChange={e => handleStudentChange(e.target.value)}
          >
            {state.students
              .filter(s => s.active !== false || s.id === studentId)
              .map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        )}

        <div className="form-row">
          <label className="field">
            Date
            <input
              type="date"
              name="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </label>
          <label className="field">
            Time
            <input
              type="time"
              name="time"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </label>
          <label className="field">
            Minutes
            <input
              type="number"
              name="duration"
              min="5"
              step="5"
              value={duration}
              onChange={e => setDuration(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
        </div>

        {mode === 'single' ? (
          <>
            <div className="field">
              <span className="muted small" style={{ fontWeight: 500 }}>
                Status
              </span>
              <div className="checks" style={{ marginTop: '4px' }}>
                <label className="check">
                  <input
                    type="radio"
                    name="status"
                    value="taught"
                    checked={status === 'taught'}
                    onChange={() => setStatus('taught')}
                  />{' '}
                  Taught
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="status"
                    value="absent"
                    checked={status === 'absent'}
                    onChange={() => setStatus('absent')}
                  />{' '}
                  Student absent
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="status"
                    value="cancelled"
                    checked={status === 'cancelled'}
                    onChange={() => setStatus('cancelled')}
                  />{' '}
                  Cancelled
                </label>
              </div>
            </div>

            <div className="form-row">
              <label className="field">
                Subject
                <input
                  name="subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  list="subject-list"
                  placeholder="e.g. Math"
                />
                <datalist id="subject-list">
                  {(student?.subjects || []).map((sub, i) => (
                    <option key={i} value={sub} />
                  ))}
                </datalist>
              </label>

              {studentContractsList.length > 0 && (
                <label className="field">
                  Counts toward
                  <select
                    name="contractId"
                    value={contractId}
                    onChange={e => setContractId(e.target.value)}
                  >
                    {studentContractsList.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                    <option value="">Not linked to a contract</option>
                  </select>
                </label>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="form-row">
              <label className="field">
                Subject
                <input
                  name="subject"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Math"
                />
              </label>
            </div>

            {batchId && (
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="muted small" style={{ fontWeight: 500 }}>Attendance</span>
                  <button
                    type="button"
                    className="btn xs ghost"
                    onClick={() => {
                      const att = { ...attendance };
                      Object.keys(att).forEach(k => att[k] = 'taught');
                      setAttendance(att);
                    }}
                  >
                    Mark All Taught
                  </button>
                </div>

                <div className="card" style={{ padding: '8px', marginTop: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                  {state.batches?.find(b => b.id === batchId)?.studentIds.map(sid => {
                    const s = getStudent(sid);
                    if (!s) return null;
                    return (
                      <div key={sid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 500 }}>{s.name}</span>
                        <div className="seg small">
                          <button
                            type="button"
                            className={attendance[sid] === 'taught' ? 'active' : ''}
                            onClick={() => setAttendance({...attendance, [sid]: 'taught'})}
                          >Taught</button>
                          <button
                            type="button"
                            className={attendance[sid] === 'absent' ? 'active' : ''}
                            onClick={() => setAttendance({...attendance, [sid]: 'absent'})}
                          >Absent</button>
                          <button
                            type="button"
                            className={attendance[sid] === 'cancelled' ? 'active' : ''}
                            onClick={() => setAttendance({...attendance, [sid]: 'cancelled'})}
                          >Cancelled</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <label className="field">
          What did you teach?
          <textarea
            name="topics"
            rows={3}
            value={topics}
            onChange={e => setTopics(e.target.value)}
            placeholder="e.g. Algebra: quadratic formulas, Exercise 4.2 Q1–10"
          />
        </label>

        <label className="field">
          Homework
          <input
            name="homework"
            value={homework}
            onChange={e => setHomework(e.target.value)}
            placeholder="e.g. Exercise 4.2 Q11–20"
          />
        </label>

        <label className="field">
          Notes
          <input
            name="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Strengths, weaknesses, progress"
          />
        </label>

        <div className="form-actions">
          {!isNew && (
            <button
              type="button"
              className="btn danger left"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {isNew ? 'Save class' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
