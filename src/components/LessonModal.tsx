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
  initialDate,
  initialTime,
  initialDuration,
  initialStatus,
  onClose,
}) => {
  const { state, saveLesson, deleteLesson, getStudent, studentName, toast } = useStore();
  const isNew = !lesson;

  const [studentId, setStudentId] = useState('');
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
    }
  }, [lesson, initialStudentId, initialDate, initialTime, initialDuration, initialStatus, isOpen]);

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
    if (!studentId || !date) return;

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
