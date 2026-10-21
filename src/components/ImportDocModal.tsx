import React, { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';
import { uid } from '../utils/date';

interface ImportDocModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportDocModal: React.FC<ImportDocModalProps> = ({ isOpen, onClose }) => {
  const { state, saveDoc, toast } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'exam' | 'worksheet' | 'plan'>('exam');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    try {
      const content = await file.text();
      saveDoc({
        id: uid(),
        type,
        title: title || file.name.replace(/\.[^.]+$/, ''),
        content,
        studentId: studentId || null,
        createdAt: new Date().toISOString(),
      });
      toast('Document imported to library', 'success');
      onClose();
    } catch (err: any) {
      toast(err.message || 'Import failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Import questions or notes" isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          File (Word, Markdown or text) *
          <input
            type="file"
            accept=".txt,.md,.doc,.docx"
            required
            onChange={handleFileChange}
          />
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          Text, questions and answer keys are saved to your offline AI library.
        </p>

        <label className="field">
          Title
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Uses file name if blank"
          />
        </label>

        <div className="form-row">
          <label className="field">
            Type
            <select value={type} onChange={e => setType(e.target.value as any)}>
              <option value="exam">Exam paper</option>
              <option value="worksheet">Worksheet</option>
              <option value="plan">Lesson plan</option>
            </select>
          </label>

          <label className="field">
            Student (optional)
            <select value={studentId} onChange={e => setStudentId(e.target.value)}>
              <option value="">— No student —</option>
              {state.students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
