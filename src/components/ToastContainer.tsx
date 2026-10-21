import React from 'react';
import { useStore } from '../store/context';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useStore();

  if (!toasts.length) return null;

  return (
    <div id="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>
          <span>{t.msg}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.fn();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
