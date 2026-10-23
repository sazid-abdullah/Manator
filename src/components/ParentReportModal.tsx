import React, { useMemo } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';
import { fmtDate, fmtTime } from '../utils/date';
import { Student, Lesson } from '../types';
import { contractStatus } from '../store/contracts';
import { statusBadge } from '../views/HomeView';
import { generateWhatsAppMessage } from '../utils/whatsapp';

interface ParentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
}

export const ParentReportModal: React.FC<ParentReportModalProps> = ({ isOpen, onClose, student }) => {
  const { state, money, toast } = useStore();

  const lessons = useMemo(() => {
    return state.lessons
      .filter(l => l.studentId === student.id)
      .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  }, [state.lessons, student.id]);

  const activeContract = useMemo(() => {
    return state.contracts.find(c => c.studentId === student.id && c.status !== 'ended');
  }, [state.contracts, student.id]);

  const payments = useMemo(() => {
    return state.payments
      .filter(p => p.studentId === student.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [state.payments, student.id]);

  const cStatus = activeContract ? contractStatus(activeContract, state.lessons, state.payments) : null;
  const paidTotal = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const totalDue = cStatus ? cStatus.balance : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleSendWhatsApp = () => {
    const phone = student.guardianPhone || student.phone;
    if (!phone) {
      toast('No phone number found for student or guardian.', 'error');
      return;
    }

    let d = String(phone).replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('01')) d = '88' + d;

    const lastClass = lessons.find(l => l.status === 'taught');

    const text = generateWhatsAppMessage({
      studentName: student.name,
      lang: 'en',
      completedClasses: cStatus?.taught !== undefined && activeContract?.cycleType === 'classes' ? cStatus.taught - (cStatus.completed * activeContract.cycleLength) : lessons.filter(l => l.status === 'taught').length,
      targetClasses: activeContract?.cycleLength || 'N/A',
      lastClassDate: lastClass ? fmtDate(lastClass.date) : undefined,
      lastClassTopic: lastClass?.subject || lastClass?.topics || undefined,
      dueAmount: String(totalDue),
      tutorName: state.settings.tutorName || 'Tutor',
      hasLastClass: !!lastClass
    });

    window.open(`https://wa.me/${d}?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <Modal title="Parent Report Card" isOpen={isOpen} onClose={onClose}>
      <div className="report-print-container">
        <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <h2>{student.name}</h2>
          <div className="muted small">
            {[student.grade, student.curriculum, (student.subjects || []).join(', ')].filter(Boolean).join(' · ')}
          </div>
          <div className="muted small" style={{ marginTop: '8px' }}>
            Tutor: <strong>{state.settings.tutorName || 'Private Tutor'}</strong>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: '24px' }}>
          <div className="card">
            <h3>Cycle & Payment Status</h3>
            {activeContract ? (
              <>
                <p className="small muted">{activeContract.title}</p>
                <div style={{ marginTop: '8px' }}>
                  <span className="badge">
                    {activeContract.cycleType === 'classes' && cStatus ?
                      `${cStatus.taught - (cStatus.completed * activeContract.cycleLength)} / ${activeContract.cycleLength} Classes` :
                      'Active Contract'}
                  </span>
                </div>
              </>
            ) : (
              <p className="small muted">No active contract.</p>
            )}
            <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
              <div>
                <div className="small muted">Total Paid</div>
                <div className="pos">{money(paidTotal)}</div>
              </div>
              <div>
                <div className="small muted">Total Due</div>
                <div className={totalDue > 0 ? 'neg' : 'pos'}>{money(totalDue)}</div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3>Verified Attendance (Recent Classes)</h3>
          {lessons.length === 0 ? (
            <p className="small muted" style={{ marginTop: '8px' }}>No classes recorded yet.</p>
          ) : (
            <div className="card" style={{ marginTop: '12px', padding: 0, overflowX: 'auto' }}>
              <table className="table" style={{ minWidth: '500px' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Topic / Subject</th>
                    <th>Duration</th>
                    <th>Homework</th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.slice(0, 15).map(l => (
                    <tr key={l.id}>
                      <td>
                        {fmtDate(l.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {l.time && <span className="muted small" style={{display: 'block'}}>{fmtTime(l.time)}</span>}
                      </td>
                      <td>{statusBadge(l.status)}</td>
                      <td>
                        {l.subject && <strong>{l.subject}</strong>}
                        {l.subject && l.topics && <br/>}
                        {l.topics && <span className="small muted">{l.topics}</span>}
                      </td>
                      <td>{l.duration ? `${l.duration}m` : '-'}</td>
                      <td>
                        {l.homework ? <span className="small">{l.homework}</span> : <span className="muted">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="actions" style={{ marginTop: '32px' }}>
          <button className="btn primary" onClick={handlePrint}>Print / Save as PDF</button>
          <button className="btn" onClick={handleSendWhatsApp}>Send Report on WhatsApp</button>
        </div>
      </div>
    </Modal>
  );
};
