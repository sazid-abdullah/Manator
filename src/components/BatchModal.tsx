import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Batch, Student } from '../types';
import { useStore } from '../store/context';

interface BatchModalProps {
  isOpen: boolean;
  batch?: Batch | null;
  onClose: () => void;
}

export const BatchModal: React.FC<BatchModalProps> = ({
  isOpen,
  batch,
  onClose,
}) => {
  const { state, saveBatch, deleteBatch, toast } = useStore();
  const isNew = !batch;

  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [subjectsStr, setSubjectsStr] = useState('');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (batch) {
      setName(batch.name);
      setGrade(batch.grade || '');
      setCurriculum(batch.curriculum || '');
      setSubjectsStr((batch.subjects || []).join(', '));
      setStudentIds(batch.studentIds || []);
      setNotes(batch.notes || '');
      setActive(batch.active !== false);
    } else {
      setName('');
      setGrade('');
      setCurriculum('');
      setSubjectsStr('');
      setStudentIds([]);
      setNotes('');
      setActive(true);
    }
  }, [batch, isOpen]);

  const activeStudents = state.students.filter(s => s.active !== false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    saveBatch({
      id: batch?.id,
      name: name.trim(),
      grade: grade.trim() || undefined,
      curriculum: curriculum.trim() || undefined,
      subjects: subjectsStr
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      studentIds,
      notes: notes.trim() || undefined,
      active,
    });

    toast(isNew ? 'Batch created' : 'Batch saved', 'success');
    onClose();
  };

  const handleDelete = () => {
    if (!batch) return;
    deleteBatch(batch.id);
    toast('Batch deleted', 'info');
    onClose();
  };

  const handleToggleStudent = (id: string) => {
    if (studentIds.includes(id)) {
      setStudentIds(studentIds.filter(sid => sid !== id));
    } else {
      setStudentIds([...studentIds, id]);
    }
  };

  return (
    <Modal title={isNew ? 'New Batch' : 'Edit Batch'} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Batch Name *
          <input
            name="name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. HSC 26 Physics Batch A"
          />
        </label>

        <div className="form-row">
          <label className="field">
            Grade / Class
            <input
              name="grade"
              value={grade}
              onChange={e => setGrade(e.target.value)}
              placeholder="e.g. Class 11"
            />
          </label>
          <label className="field">
            Curriculum
            <input
              name="curriculum"
              value={curriculum}
              onChange={e => setCurriculum(e.target.value)}
              placeholder="e.g. Cambridge, Edexcel"
            />
          </label>
        </div>

        <label className="field">
          Subjects (comma separated)
          <input
            name="subjectsStr"
            value={subjectsStr}
            onChange={e => setSubjectsStr(e.target.value)}
            placeholder="e.g. Physics, Math"
          />
        </label>

        <div className="field">
          <span className="muted small" style={{ fontWeight: 500 }}>
            Students in Batch
          </span>
          <div className="card" style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px', marginTop: '4px' }}>
            {activeStudents.length === 0 ? (
              <div className="muted small">No active students available.</div>
            ) : (
              activeStudents.map(s => (
                <label key={s.id} className="check" style={{ display: 'block', marginBottom: '4px' }}>
                  <input
                    type="checkbox"
                    checked={studentIds.includes(s.id)}
                    onChange={() => handleToggleStudent(s.id)}
                  />
                  {' '}
                  {s.name} {s.grade ? `(${s.grade})` : ''}
                </label>
              ))
            )}
          </div>
        </div>

        <label className="field">
          Notes
          <textarea
            name="notes"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional batch notes"
          />
        </label>

        {!isNew && (
          <label className="check" style={{ marginTop: '8px' }}>
            <input
              type="checkbox"
              checked={active}
              onChange={e => setActive(e.target.checked)}
            />{' '}
            Active batch
          </label>
        )}

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
            {isNew ? 'Create batch' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
