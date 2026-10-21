import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Payment } from '../types';
import { defaultContractFor, contractStatus } from '../store/contracts';
import { todayISO } from '../utils/date';
import { useStore } from '../store/context';

const PAY_METHODS = ['Cash', 'bKash', 'Nagad', 'Rocket', 'Bank', 'Other'];

interface PaymentModalProps {
  isOpen: boolean;
  payment?: Payment | null;
  initialStudentId?: string;
  initialContractId?: string;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  payment,
  initialStudentId,
  initialContractId,
  onClose,
}) => {
  const { state, savePayment, deletePayment, getContract, money, toast } = useStore();
  const isNew = !payment;

  const [studentId, setStudentId] = useState('');
  const [contractId, setContractId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('Cash');
  const [note, setNote] = useState('');

  const suggestAmount = (cid: string) => {
    const c = cid && getContract(cid);
    if (!c) return '';
    const st = contractStatus(c, state.lessons, state.payments);
    return st.balance > 0 ? Math.round(st.balance * 100) / 100 : c.fee;
  };

  useEffect(() => {
    if (payment) {
      setStudentId(payment.studentId);
      setContractId(payment.contractId || '');
      setAmount(payment.amount);
      setDate(payment.date);
      setMethod(payment.method || 'Cash');
      setNote(payment.note || '');
    } else {
      const sid = initialStudentId || (state.students[0]?.id ?? '');
      const cid = initialContractId || defaultContractFor(sid, state.contracts, todayISO()) || '';
      setStudentId(sid);
      setContractId(cid);
      setAmount(suggestAmount(cid));
      setDate(todayISO());
      setMethod('Cash');
      setNote('');
    }
  }, [payment, initialStudentId, initialContractId, isOpen]);

  const studentContractsList = state.contracts.filter(c => c.studentId === studentId);

  const handleStudentChange = (sid: string) => {
    setStudentId(sid);
    const cid = defaultContractFor(sid, state.contracts, date) || '';
    setContractId(cid);
    if (isNew) {
      setAmount(suggestAmount(cid));
    }
  };

  const handleContractChange = (cid: string) => {
    setContractId(cid);
    if (isNew) {
      setAmount(suggestAmount(cid));
    }
  };

  const selectedContract = contractId ? getContract(contractId) : null;
  const contractStatusInfo = selectedContract
    ? contractStatus(selectedContract, state.lessons, state.payments)
    : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || amount === '' || !date) return;

    const data: Omit<Payment, 'id'> & { id?: string } = {
      id: payment?.id,
      studentId,
      contractId: contractId || null,
      amount: Number(amount) || 0,
      date,
      method,
      note: note.trim(),
    };

    savePayment(data);
    toast(`Payment of ${money(data.amount)} saved`, 'success');
    onClose();
  };

  const handleDelete = () => {
    if (!payment) return;
    deletePayment(payment.id);
    toast('Payment deleted', 'info');
    onClose();
  };

  return (
    <Modal title={isNew ? 'Record payment' : 'Edit payment'} isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Student *
          <select
            name="studentId"
            required
            value={studentId}
            onChange={e => handleStudentChange(e.target.value)}
          >
            {state.students
              .filter(s => s.active !== false || s.id === studentId)
              .map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>

        {studentContractsList.length > 0 && (
          <label className="field">
            Contract
            <select
              name="contractId"
              value={contractId}
              onChange={e => handleContractChange(e.target.value)}
            >
              {studentContractsList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title} ({money(c.fee)})
                </option>
              ))}
              <option value="">Not linked to a contract</option>
            </select>
          </label>
        )}

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
          <label className="field">
            Method
            <select
              name="method"
              value={method}
              onChange={e => setMethod(e.target.value)}
            >
              {PAY_METHODS.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          Note
          <input
            name="note"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. October fee, bonus"
          />
        </label>

        {contractStatusInfo && (
          <div className="help" id="pay-hint">
            {contractStatusInfo.balance > 0.005
              ? `Currently owed on this contract: ${money(contractStatusInfo.balance)}`
              : contractStatusInfo.balance < -0.005
              ? `Already ${money(-contractStatusInfo.balance)} paid in advance.`
              : 'Nothing owed right now; this will count as advance payment.'}
          </div>
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
            Save payment
          </button>
        </div>
      </form>
    </Modal>
  );
};
