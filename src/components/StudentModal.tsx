import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Student, ScheduleSlot } from '../types';
import { WEEKDAYS } from '../utils/date';
import { useStore } from '../store/context';

interface StudentModalProps {
  isOpen: boolean;
  student?: Student | null;
  onClose: () => void;
  onStudentSaved?: (id: string, isNew: boolean) => void;
}

export const StudentModal: React.FC<StudentModalProps> = ({
  isOpen,
  student,
  onClose,
  onStudentSaved,
}) => {
  const { saveStudent, toast } = useStore();
  const isNew = !student;

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [subjects, setSubjects] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([
    { day: 6, time: '17:00', duration: 60 },
  ]);

  useEffect(() => {
    if (student) {
      setName(student.name || '');
      setGrade(student.grade || '');
      setCurriculum(student.curriculum || '');
      setSubjects((student.subjects || []).join(', '));
      setPhone(student.phone || '');
      setGuardianName(student.guardianName || '');
      setGuardianPhone(student.guardianPhone || '');
      setAddress(student.address || '');
      setNotes(student.notes || '');
      setSchedule(student.schedule && student.schedule.length ? student.schedule : []);
    } else {
      setName('');
      setGrade('');
      setCurriculum('');
      setSubjects('');
      setPhone('');
      setGuardianName('');
      setGuardianPhone('');
      setAddress('');
      setNotes('');
      setSchedule([{ day: 6, time: '17:00', duration: 60 }]);
    }
  }, [student, isOpen]);

  const handleAddSlot = () => {
    const last = schedule[schedule.length - 1];
    const nextDay = last ? (last.day + 2) % 7 : 6;
    const nextTime = last ? last.time : '17:00';
    const nextDuration = last ? last.duration : 60;
    setSchedule([...schedule, { day: nextDay, time: nextTime, duration: nextDuration }]);
  };

  const handleRemoveSlot = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  };

  const handleUpdateSlot = (index: number, key: keyof ScheduleSlot, val: any) => {
    setSchedule(
      schedule.map((slot, i) => (i === index ? { ...slot, [key]: val } : slot))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const data: Omit<Student, 'id'> & { id?: string } = {
      id: student?.id,
      name: name.trim(),
      grade: grade.trim(),
      curriculum: curriculum.trim(),
      subjects: subjects
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      phone: phone.trim(),
      guardianName: guardianName.trim(),
      guardianPhone: guardianPhone.trim(),
      address: address.trim(),
      notes: notes.trim(),
      schedule,
      active: student?.active !== false,
    };

    const savedId = saveStudent(data);
    toast(isNew ? 'Student added' : 'Student saved', 'success');
    onClose();
    if (onStudentSaved) {
      onStudentSaved(savedId, isNew);
    }
  };

  return (
    <Modal title={isNew ? 'Add student' : 'Edit student'} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Name *
          <input
            name="name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Student's full name"
            autoComplete="off"
            autoFocus
          />
        </label>

        <div className="form-row">
          <label className="field">
            Class / Grade
            <input
              name="grade"
              value={grade}
              onChange={e => setGrade(e.target.value)}
              placeholder="e.g. Class 8, HSC 1st year"
            />
          </label>
          <label className="field">
            Curriculum / Board
            <input
              name="curriculum"
              value={curriculum}
              onChange={e => setCurriculum(e.target.value)}
              placeholder="e.g. National, English version, O Level"
            />
          </label>
        </div>

        <label className="field">
          Subjects
          <input
            name="subjects"
            value={subjects}
            onChange={e => setSubjects(e.target.value)}
            placeholder="Math, Physics (comma separated)"
          />
        </label>

        <div className="form-row">
          <label className="field">
            Student phone
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="017..."
            />
          </label>
          <label className="field">
            Guardian name
            <input
              name="guardianName"
              value={guardianName}
              onChange={e => setGuardianName(e.target.value)}
            />
          </label>
          <label className="field">
            Guardian phone
            <input
              name="guardianPhone"
              type="tel"
              value={guardianPhone}
              onChange={e => setGuardianPhone(e.target.value)}
              placeholder="018..."
            />
          </label>
        </div>

        <label className="field">
          Address
          <input
            name="address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="House/Road/Area"
          />
        </label>

        <div className="field">
          <span className="muted small" style={{ fontWeight: 500 }}>
            Weekly schedule (day · time · minutes)
          </span>
          <div className="grid" style={{ gap: '8px', marginTop: '6px' }}>
            {schedule.map((slot, index) => (
              <div key={index} className="sched-row">
                <select
                  value={slot.day}
                  onChange={e => handleUpdateSlot(index, 'day', Number(e.target.value))}
                  aria-label="Day"
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => handleUpdateSlot(index, 'time', e.target.value)}
                  aria-label="Time"
                />
                <input
                  type="number"
                  min="10"
                  step="5"
                  value={slot.duration}
                  onChange={e => handleUpdateSlot(index, 'duration', Number(e.target.value))}
                  aria-label="Minutes"
                  placeholder="min"
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleRemoveSlot(index)}
                  aria-label="Remove"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div>
            <button
              type="button"
              className="btn sm"
              onClick={handleAddSlot}
              style={{ marginTop: '8px' }}
            >
              + Add day
            </button>
          </div>
        </div>

        <label className="field">
          Notes
          <textarea
            name="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Strengths, weak areas, exam dates…"
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {isNew ? 'Add student' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
