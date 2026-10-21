import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Goal } from '../types';
import { useStore } from '../store/context';

interface GoalModalProps {
  isOpen: boolean;
  goal?: Goal | null;
  onClose: () => void;
}

export const GoalModal: React.FC<GoalModalProps> = ({
  isOpen,
  goal,
  onClose,
}) => {
  const { state, saveGoal, deleteGoal, toast } = useStore();
  const isNew = !goal;

  const [name, setName] = useState('');
  const [target, setTarget] = useState<number | ''>('');
  const [saved, setSaved] = useState<number | ''>(0);
  const [targetDate, setTargetDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTarget(goal.target);
      setSaved(goal.saved);
      setTargetDate(goal.targetDate || '');
      setNote(goal.note || '');
    } else {
      setName('');
      setTarget('');
      setSaved(0);
      setTargetDate('');
      setNote('');
    }
  }, [goal, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || target === '') return;

    const data: Omit<Goal, 'id'> & { id?: string } = {
      id: goal?.id,
      name: name.trim(),
      target: Number(target) || 0,
      saved: Math.max(0, Number(saved) || 0),
      targetDate: targetDate || undefined,
      note: note.trim(),
    };

    saveGoal(data);
    toast(isNew ? 'Savings goal created' : 'Goal saved', 'success');
    onClose();
  };

  const handleDelete = () => {
    if (!goal) return;
    deleteGoal(goal.id);
    toast('Goal deleted', 'info');
    onClose();
  };

  return (
    <Modal title={isNew ? 'New savings goal' : 'Edit goal'} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          What are you saving for? *
          <input
            name="name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. New laptop, Camera, Book shelf"
          />
        </label>

        <div className="form-row">
          <label className="field">
            Cost ({state.settings.currency}) *
            <input
              name="target"
              type="number"
              min="1"
              step="any"
              required
              value={target}
              onChange={e => setTarget(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="field">
            Saved so far
            <input
              name="saved"
              type="number"
              min="0"
              step="any"
              value={saved}
              onChange={e => setSaved(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </label>
          <label className="field">
            Target date (optional)
            <input
              name="targetDate"
              type="date"
              value={targetDate}
              onChange={e => setTargetDate(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          Note
          <input
            name="note"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Dell XPS, used or new"
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
            Save goal
          </button>
        </div>
      </form>
    </Modal>
  );
};
