import React, { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';

interface OnboardingModalProps {
  isOpen: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen }) => {
  const { updateProfile, updateSettings } = useStore();

  const [brandTitle, setBrandTitle] = useState('');
  const [currency, setCurrency] = useState('৳');
  const [primarySubject, setPrimarySubject] = useState('');

  const CURRENCIES = ['৳', '₹', 'Rs ', '$', '£', '€', 'RM ', 'SAR '];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandTitle.trim()) return;

    updateProfile({
      brandTitle: brandTitle.trim(),
      primarySubject: primarySubject.trim(),
    });

    updateSettings({
      currency,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Welcome to Tuitrix">
      <div style={{ marginBottom: '16px' }}>
        <p>Before you begin, please set up your workspace. These details will be used on your receipts and documents.</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <label>
          Workspace / Brand Name *
          <input
            type="text"
            className="input"
            value={brandTitle}
            onChange={e => setBrandTitle(e.target.value)}
            placeholder="e.g. Acme Tutorials"
            required
          />
        </label>

        <label>
          Primary Teaching Subject *
          <input
            type="text"
            className="input"
            value={primarySubject}
            onChange={e => setPrimarySubject(e.target.value)}
            placeholder="e.g. Mathematics"
            required
          />
        </label>

        <label>
          Default Currency *
          <select
            className="input"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            required
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <div style={{ marginTop: '8px' }}>
          <button type="submit" className="btn primary" style={{ width: '100%' }}>
            Complete Setup
          </button>
        </div>
      </form>
    </Modal>
  );
};
