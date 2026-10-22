import React, { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';
import { callAI, EXAM_JSON_SYSTEM, examJsonPrompt, normalizeExam } from '../services/ai';
import { uid } from '../utils/date';

interface UploadPaperModalProps {
  isOpen: boolean;
  initialStudentId?: string;
  onClose: () => void;
  onExamReady?: (docId: string, examId: string) => void;
}

export const UploadPaperModal: React.FC<UploadPaperModalProps> = ({
  isOpen,
  initialStudentId,
  onClose,
  onExamReady,
}) => {
  const { state, saveDoc, saveExam, toast } = useStore();
  const [studentId, setStudentId] = useState(initialStudentId || '');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      setFile(f);
      if (!title) {
        setTitle(f.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  const toBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a question paper file.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let textContent = '';
      let filesData: Array<{ mimeType: string; data: string }> = [];

      const isImage = /\.(png|jpe?g|webp)$/i.test(file.name);
      const isPdf = /\.pdf$/i.test(file.name);

      if (isImage || isPdf) {
        const b64 = await toBase64(file);
        const mime = isPdf ? 'application/pdf' : file.type || 'image/jpeg';
        filesData = [{ mimeType: mime, data: b64 }];
      } else {
        textContent = await file.text();
      }

      const prompt = examJsonPrompt(textContent || file.name);
      const res = await callAI(EXAM_JSON_SYSTEM, prompt, state, {
        temperature: 0.1,
        json: true,
        files: filesData,
        onFallback: (msg) => toast(msg, 'info'),
      });

      const parsedJson = JSON.parse(res);
      const normalized = normalizeExam(parsedJson);

      const examTitle = title.trim() || normalized.title || file.name.replace(/\.[^.]+$/, '');
      const docId = uid();
      const examId = uid();
      const now = new Date().toISOString();

      saveDoc({
        id: docId,
        type: 'exam',
        title: examTitle,
        content: textContent || `Exam paper generated from ${file.name}`,
        studentId: studentId || null,
        createdAt: now,
      });

      saveExam({
        ...normalized,
        id: examId,
        docId,
        title: examTitle,
        createdAt: now,
      });

      toast(`"${examTitle}" processed successfully!`, 'success');
      onClose();

      if (onExamReady) {
        onExamReady(docId, examId);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to read and process the question paper.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Upload question paper" isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Question paper (PDF, photo, Word or text file) *
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.doc,.docx"
            required
            onChange={handleFileChange}
          />
        </label>
        <p className="help" style={{ margin: 0 }}>
          AI reads the paper and turns it into an on-screen interactive test with MCQs, creative questions, and answer boxes.
        </p>

        <label className="field">
          Title
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Taken from paper if left blank"
          />
        </label>

        <label className="field">
          Student (optional)
          <select
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
          >
            <option value="">— No specific student —</option>
            {state.students.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {error && <div className="notice err">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Reading paper with AI…' : 'Read paper'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
