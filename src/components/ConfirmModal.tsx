import React from 'react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDanger = false,
  onConfirm,
  onClose,
}) => {
  return (
    <Modal title={title} isOpen={isOpen} onClose={onClose}>
      <p style={{ whiteSpace: 'pre-wrap', marginBottom: '16px' }}>{message}</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn ${isDanger ? 'danger' : 'primary'}`}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
