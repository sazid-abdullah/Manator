import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Batch } from '../types';
import { useStore } from '../store/context';
import { contractStatus, defaultContractFor, ContractStatusResult } from '../store/contracts';
import { generateWhatsAppMessage } from '../utils/whatsapp';
import { todayISO, fmtDate } from '../utils/date';

interface BatchFeeModalProps {
  isOpen: boolean;
  batch: Batch | null;
  onClose: () => void;
}

export const BatchFeeModal: React.FC<BatchFeeModalProps> = ({ isOpen, batch, onClose }) => {
  const { state, money, getContract, savePayment, toast } = useStore();
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(todayISO());

  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountType: 'flat' | 'percent'; value: number } | null>(null);

  useEffect(() => {
    setSelectedStudents(new Set());
    setDate(todayISO());
    setPromoInput('');
    setAppliedPromo(null);
  }, [batch, isOpen]);

  if (!batch) return null;

  const handleApplyPromo = () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) {
      setAppliedPromo(null);
      return;
    }
    const found = state.promoCodes?.find(p => p.code.toUpperCase() === code);
    if (found) {
      setAppliedPromo(found);
      toast(`Promo ${code} applied!`, 'success');
    } else {
      toast(`Invalid promo code`, 'error');
    }
  };

  const studentsData = batch.studentIds.map(sid => {
    const student = state.students.find(s => s.id === sid);
    const cid = defaultContractFor(sid, state.contracts, date);
    const contract = cid ? getContract(cid) : null;
    let status: ContractStatusResult | null = null;
    if (contract) {
      status = contractStatus(contract, state.lessons, state.payments, date);
    }
    let due = status ? Math.max(0, status.balance) : 0;
    const fee = contract ? contract.fee : batch.defaultFee || 0;

    let originalAmount = due > 0 ? due : fee;
    let finalAmount = originalAmount;
    let discount = 0;

    if (appliedPromo && finalAmount > 0) {
      if (appliedPromo.discountType === 'percent') {
        discount = finalAmount * (appliedPromo.value / 100);
      } else {
        discount = appliedPromo.value;
      }
      finalAmount = Math.max(0, finalAmount - discount);
    }

    return {
      student,
      contract,
      status,
      due,
      fee,
      originalAmount,
      finalAmount,
      discount,
    };
  }).filter(x => x.student); // ensure student exists

  const toggleStudent = (sid: string) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(sid)) newSet.delete(sid);
    else newSet.add(sid);
    setSelectedStudents(newSet);
  };

  const handleSelectAll = () => {
    if (selectedStudents.size === studentsData.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(studentsData.map(d => d.student!.id)));
    }
  };

  const recordPayments = () => {
    if (selectedStudents.size === 0) return;
    let count = 0;
    for (const data of studentsData) {
      if (selectedStudents.has(data.student!.id)) {
        if (data.finalAmount >= 0) {
          savePayment({
            studentId: data.student!.id,
            contractId: data.contract?.id || null,
            amount: data.finalAmount,
            discountApplied: data.discount > 0 ? data.discount : undefined,
            promoCodeUsed: data.discount > 0 && appliedPromo ? appliedPromo.code : undefined,
            date: date,
            method: 'Cash',
            note: `Batch fee - ${batch.name}`
          });
          count++;
        }
      }
    }
    toast(`Recorded ${count} payment${count === 1 ? '' : 's'}`, 'success');
    onClose();
  };

  return (
    <Modal title={`Collect Fees: ${batch.name}`} isOpen={isOpen} onClose={onClose}>
      <div style={{ marginBottom: '16px' }} className="grid-2">
        <label className="field">
          Payment Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field">
          Promo Code
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. EARLY10"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
            />
            <button type="button" className="btn" onClick={handleApplyPromo}>Apply</button>
          </div>
          {appliedPromo && (
            <div className="small pos" style={{ marginTop: '4px' }}>
              Applied: {appliedPromo.code} (-{appliedPromo.discountType === 'percent' ? `${appliedPromo.value}%` : money(appliedPromo.value)})
            </div>
          )}
        </label>
      </div>

      <div className="list" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
        {studentsData.length === 0 ? (
          <div className="empty" style={{ padding: '16px', textAlign: 'center' }}>No students in this batch.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>
                  <input
                    type="checkbox"
                    checked={selectedStudents.size === studentsData.length && studentsData.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Student</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Progress</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Due</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>Remind</th>
              </tr>
            </thead>
            <tbody>
              {studentsData.map(d => {
                const sid = d.student!.id;
                const isSelected = selectedStudents.has(sid);
                const hasDue = d.due > 0;

                let progressText = 'No contract';
                let lastClassDate = '';
                let lastClassTopic = '';
                let hasLastClass = false;

                if (d.status) {
                   if (d.status.nextDue?.kind === 'classes') {
                      progressText = `${d.status.taught} classes`;
                   } else {
                      progressText = 'Monthly cycle';
                   }

                   // find last class for this contract
                   const contractLessons = state.lessons
                     .filter(l => l.studentId === sid && l.contractId === d.contract!.id && l.status === 'taught' && l.date <= date)
                     .sort((a,b) => (b.date + (b.time||'')).localeCompare(a.date + (a.time||'')));

                   if (contractLessons.length > 0) {
                      hasLastClass = true;
                      lastClassDate = fmtDate(contractLessons[0].date);
                      lastClassTopic = contractLessons[0].topics || contractLessons[0].subject || '';
                   }
                }

                const waMessageEn = generateWhatsAppMessage({
                  studentName: d.student!.name,
                  lang: 'en',
                  completedClasses: d.status?.taught || 0,
                  targetClasses: d.contract?.cycleType === 'classes' ? d.contract.cycleLength : 'N/A',
                  lastClassDate,
                  lastClassTopic,
                  dueAmount: d.finalAmount.toString(),
                  tutorName: state.settings.tutorName,
                  hasLastClass
                });

                return (
                  <tr key={sid} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleStudent(sid)}
                      />
                    </td>
                    <td style={{ padding: '8px', fontWeight: 500 }}>{d.student!.name}</td>
                    <td style={{ padding: '8px', fontSize: '0.85em', color: 'var(--muted)' }}>
                      {progressText}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>
                      {d.discount > 0 && <div className="small muted" style={{ textDecoration: 'line-through' }}>{money(d.originalAmount)}</div>}
                      <div style={{ fontWeight: hasDue ? 'bold' : 'normal', color: hasDue ? 'var(--red)' : 'inherit' }}>
                        {money(d.finalAmount)}
                      </div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {hasDue ? (
                        <a
                           href={`https://wa.me/?text=${encodeURIComponent(waMessageEn)}`}
                           target="_blank"
                           rel="noopener noreferrer"
                           title="Send reminder on WhatsApp"
                           style={{ textDecoration: 'none' }}
                        >
                           💬
                        </a>
                      ) : (
                        <span style={{ color: 'var(--green)' }}>✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="form-actions" style={{ marginTop: '16px' }}>
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={recordPayments}
          disabled={selectedStudents.size === 0}
        >
          Record {selectedStudents.size} Payment{selectedStudents.size === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  );
};
