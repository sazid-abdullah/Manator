import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Contract, CycleType, BillingType } from '../types';
import { CYCLE_TYPES, cycleLabel } from '../store/contracts';
import { todayISO, addDays, addMonths, fmtDate } from '../utils/date';
import { useStore } from '../store/context';

interface ContractModalProps {
  isOpen: boolean;
  studentId: string;
  contract?: Contract | null;
  fromNewStudent?: boolean;
  onClose: () => void;
}

export const ContractModal: React.FC<ContractModalProps> = ({
  isOpen,
  studentId,
  contract,
  fromNewStudent,
  onClose,
}) => {
  const { getStudent, saveContract, money, toast, state } = useStore();
  const student = getStudent(studentId);
  const isNew = !contract;

  const [title, setTitle] = useState('');
  const [fee, setFee] = useState<number | ''>('');
  const [cycleType, setCycleType] = useState<CycleType>('classes');
  const [cycleLength, setCycleLength] = useState<number>(12);
  const [startDate, setStartDate] = useState(todayISO());
  const [billing, setBilling] = useState<BillingType>('end');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (contract) {
      setTitle(contract.title || '');
      setFee(contract.fee);
      setCycleType(contract.cycleType);
      setCycleLength(contract.cycleLength);
      setStartDate(contract.startDate);
      setBilling(contract.billing);
      setNotes(contract.notes || '');
    } else {
      const defaultTitle =
        student?.subjects && student.subjects.length
          ? student.subjects.join(' & ')
          : 'Tuition';
      setTitle(defaultTitle);
      setFee('');
      setCycleType('classes');
      setCycleLength(12);
      setStartDate(todayISO());
      setBilling('end');
      setNotes('');
    }
  }, [contract, student, isOpen]);

  const previewText = () => {
    const f = Number(fee) || 0;
    const n = Number(cycleLength) || 1;
    const label = cycleLabel({ cycleType, cycleLength: n });
    let extra =
      cycleType === 'classes'
        ? ' Only classes marked "Taught" count toward the cycle.'
        : '';
    if (cycleType !== 'classes' && startDate) {
      const first =
        cycleType === 'months'
          ? addMonths(startDate, n)
          : addDays(startDate, n);
      extra =
        billing === 'start'
          ? ` First fee due ${fmtDate(startDate)}, next on ${fmtDate(first)}.`
          : ` First fee due ${fmtDate(first)}.`;
    }
    return `${money(f)} ${label}, ${
      billing === 'start' ? 'paid in advance' : 'paid after each cycle'
    }.${extra}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (fee === '' || !studentId) return;

    const data: Omit<Contract, 'id'> & { id?: string } = {
      id: contract?.id,
      studentId,
      title: title.trim() || 'Tuition',
      fee: Number(fee) || 0,
      cycleType,
      cycleLength: Math.max(1, Math.round(Number(cycleLength) || 1)),
      startDate,
      billing,
      status: contract?.status || 'active',
      notes: notes.trim(),
    };

    saveContract(data);
    toast(isNew ? 'Contract created' : 'Contract saved', 'success');
    onClose();
  };

  return (
    <Modal
      title={isNew ? `Fee contract${student ? ' for ' + student.name : ''}` : 'Edit contract'}
      isOpen={isOpen}
      onClose={onClose}
    >
      <form className="form" onSubmit={handleSubmit}>
        {fromNewStudent && (
          <div className="notice">
            Student added! Now set how and when they pay — or skip and set it later.
          </div>
        )}

        <label className="field">
          Title
          <input
            name="title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Math & Physics"
          />
        </label>

        <div className="form-row">
          <label className="field">
            Fee per cycle ({state.settings.currency}) *
            <input
              name="fee"
              type="number"
              min="0"
              step="any"
              required
              value={fee}
              onChange={e => setFee(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 3000"
            />
          </label>

          <label className="field">
            Paid every
            <input
              name="cycleLength"
              type="number"
              min="1"
              step="1"
              required
              value={cycleLength}
              onChange={e => setCycleLength(Math.max(1, Number(e.target.value)))}
            />
          </label>

          <label className="field">
            Cycle type
            <select
              name="cycleType"
              value={cycleType}
              onChange={e => setCycleType(e.target.value as CycleType)}
            >
              {Object.keys(CYCLE_TYPES).map(k => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="field">
            Start date
            <input
              name="startDate"
              type="date"
              required
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </label>

          <label className="field">
            When is it paid?
            <select
              name="billing"
              value={billing}
              onChange={e => setBilling(e.target.value as BillingType)}
            >
              <option value="end">After each cycle</option>
              <option value="start">In advance (start of cycle)</option>
            </select>
          </label>
        </div>

        <div className="help" id="contract-preview">
          {previewText()}
        </div>

        <label className="field">
          Notes
          <textarea
            name="notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Exam month fee is higher"
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {fromNewStudent ? 'Skip' : 'Cancel'}
          </button>
          <button type="submit" className="btn primary">
            {isNew ? 'Save contract' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
