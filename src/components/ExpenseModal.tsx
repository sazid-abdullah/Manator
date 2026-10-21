import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Expense } from '../types';
import { todayISO } from '../utils/date';
import { useStore } from '../store/context';

const EXPENSE_CATS = ['Transport', 'Books & materials', 'Printing', 'Phone & internet', 'Food', 'Other'];

interface ExpenseModalProps {
  isOpen: boolean;
  expense?: Expense | null;
  onClose: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  expense,
  onClose,
}) => {
  const { state, saveExpense, deleteExpense, toast } = useStore();
  const isNew = !expense;

  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState('Transport');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (expense) {
      setAmount(expense.amount);
      setDate(expense.date);
      setCategory(expense.category || 'Transport');
      setNote(expense.note || '');
    } else {
      setAmount('');
      setDate(todayISO());
      setCategory('Transport');
      setNote('');
    }
  }, [expense, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (amount === '' || !date) return;

    const data: Omit<Expense, 'id'> & { id?: string } = {
      id: expense?.id,
      amount: Number(amount) || 0,
      date,
      category,
      note: note.trim(),
    };

    saveExpense(data);
    toast(isNew ? 'Expense added' : 'Expense saved', 'success');
    onClose();
  };

  const handleDelete = () => {
    if (!expense) return;
    deleteExpense(expense.id);
    toast('Expense deleted', 'info');
    onClose();
  };

  return (
    <Modal title={isNew ? 'Add expense' : 'Edit expense'} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="field">
            Amount ({state.settings.currency}) *
            <input
              name="amount"
              type="number"
              min="0"
              step="any"
              required
              value={amount}
              onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 150"
            />
          </label>
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
        </div>

        <label className="field">
          Category
          <select
            name="category"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            {EXPENSE_CATS.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Note
          <input
            name="note"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Rickshaw to student home, Xerox"
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
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
};
