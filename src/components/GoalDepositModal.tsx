import React, { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';

interface GoalDepositModalProps {
  isOpen: boolean;
  goalId: string;
  onClose: () => void;
}

export const GoalDepositModal: React.FC<GoalDepositModalProps> = ({
  isOpen,
  goalId,
  onClose,
}) => {
  const { state, depositGoal, money, toast } = useStore();
  const goal = state.goals.find(g => g.id === goalId);
  const [amount, setAmount] = useState<number | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === '' || !goal) return;

    depositGoal(goalId, Number(amount));
    const newTotal = Math.max(0, goal.saved + Number(amount));
    toast(`${money(newTotal)} saved of ${money(goal.target)}`, 'success');
    onClose();
    setAmount('');
  };

  if (!goal) return null;

  return (
    <Modal title={`Add money to "${goal.name}"`} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Amount ({state.settings.currency})
          <input
            name="amount"
            type="number"
            step="any"
            required
            autoFocus
            value={amount}
            onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g. 2000"
          />
        </label>
        <div className="help">Use a negative amount (e.g. -500) if you withdrew money from this goal.</div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
};
