import React, { useState } from 'react';
import { useStore } from '../store/context';
import { studentBalance } from '../store/contracts';
import { renderAvatar } from './HomeView';
import { WEEKDAYS, fmtTime } from '../utils/date';
import { Student } from '../types';

interface StudentsViewProps {
  onNavigate: (route: string, param?: string) => void;
  onOpenStudentModal: () => void;
}

export function scheduleSummary(s: Student): string {
  if (!s.schedule || !s.schedule.length) return 'No fixed schedule';
  const sorted = [...s.schedule].sort(
    (a, b) => a.day - b.day || (a.time || '').localeCompare(b.time || '')
  );
  const times = [...new Set(sorted.map(x => x.time))];
  if (times.length === 1) {
    return `${sorted.map(x => WEEKDAYS[x.day]).join(', ')}${
      times[0] ? ' · ' + fmtTime(times[0]) : ''
    }`;
  }
  return sorted.map(x => `${WEEKDAYS[x.day]} ${fmtTime(x.time)}`).join(', ');
}

import { BatchModal } from '../components/BatchModal';
import { BatchFeeModal } from '../components/BatchFeeModal';

export const StudentsView: React.FC<StudentsViewProps> = ({
  onNavigate,
  onOpenStudentModal,
}) => {
  const { state, money } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [viewMode, setViewMode] = useState<'individual' | 'batch'>('individual');

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<any>(null);

  const [batchFeeModalOpen, setBatchFeeModalOpen] = useState(false);
  const [feeBatch, setFeeBatch] = useState<any>(null);

  const q = search.toLowerCase();
  const list = state.students
    .filter(s =>
      filter === 'all'
        ? true
        : filter === 'active'
        ? s.active !== false
        : s.active === false
    )
    .filter(
      s =>
        !q ||
        [s.name, s.grade, (s.subjects || []).join(' '), s.guardianName]
          .join(' ')
          .toLowerCase()
          .includes(q)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeCount = state.students.filter(s => s.active !== false).length;
  const batches = state.batches || [];
  const activeBatchesCount = batches.filter(b => b.active !== false).length;

  const balanceBadge = (bal: number) => {
    if (bal > 0.005) return <span className="badge red">Owes {money(bal)}</span>;
    if (bal < -0.005) return <span className="badge green">Advance {money(-bal)}</span>;
    return <span className="badge green">Paid up</span>;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Students & Batches</h1>
          <div className="sub">
            {viewMode === 'individual' ? `${activeCount} active students` : `${activeBatchesCount} active batches`}
          </div>
        </div>
        <div>
          {viewMode === 'individual' ? (
            <button className="btn primary" onClick={onOpenStudentModal}>
              + Add student
            </button>
          ) : (
            <button className="btn primary" onClick={() => { setEditingBatch(null); setBatchModalOpen(true); }}>
              + New Batch
            </button>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
        <div className="seg">
          <button className={viewMode === 'individual' ? 'active' : ''} onClick={() => setViewMode('individual')}>Individual Students</button>
          <button className={viewMode === 'batch' ? 'active' : ''} onClick={() => setViewMode('batch')}>Batches (Group Tuition)</button>
        </div>
      </div>

      {viewMode === 'individual' && (
        <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, class, subject…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="seg">
          {(['active', 'archived', 'all'] as const).map(f => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="list">
          {list.length === 0 ? (
            <div className="empty">
              {state.students.length ? 'No students match your search.' : 'No students yet. Add your first one!'}
            </div>
          ) : (
            list.map(s => {
              const contracts = state.contracts.filter(c => c.studentId === s.id);
              const bal = studentBalance(s.id, state.contracts, state.lessons, state.payments);
              return (
                <a
                  key={s.id}
                  className="row"
                  href={`#/student/${s.id}`}
                  onClick={e => {
                    e.preventDefault();
                    onNavigate('student', s.id);
                  }}
                >
                  {renderAvatar(s)}
                  <div className="grow">
                    <div className="title">
                      {s.name}
                      {s.active === false && <span className="badge">Archived</span>}
                      {(state.batches || []).filter(b => b.studentIds.includes(s.id)).map(b => (
                        <span key={b.id} className="badge blue" style={{ marginLeft: '6px' }}>👥 {b.name}</span>
                      ))}
                    </div>
                    <div className="meta">
                      {[s.grade, (s.subjects || []).join(', ')].filter(Boolean).join(' · ')}
                    </div>
                    <div className="meta">{scheduleSummary(s)}</div>
                  </div>
                  {contracts.length ? balanceBadge(bal) : <span className="badge">No contract</span>}
                </a>
              );
            })
          )}
        </div>
      </div>
      </>
      )}

      {viewMode === 'batch' && (
        <div className="grid-2">
          {batches.length === 0 ? (
            <div className="card empty">No batches created yet. Add one for group tuition!</div>
          ) : (
            batches.map(b => {
              const count = b.studentIds.length;
              return (
                <div key={b.id} className="card">
                  <div className="card-head">
                    <div>
                      <h3>
                        {b.name}
                        {b.active === false && <span className="badge">Archived</span>}
                      </h3>
                      <div className="muted small">
                        {[b.grade, b.curriculum, (b.subjects || []).join(', ')].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>

                  <div className="small" style={{ margin: '12px 0' }}>
                    <b>{count} Students:</b>{' '}
                    {b.studentIds.map(id => state.students.find(s => s.id === id)?.name).filter(Boolean).join(', ') || 'None'}
                  </div>

                  {b.notes && <p className="muted small">{b.notes}</p>}

                  <div className="actions" style={{ marginTop: '12px' }}>
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        // Will implement this navigation in ClassesView later
                        onNavigate('classes', `batch=${b.id}`);
                      }}
                    >
                      Log Batch Class
                    </button>
                    <button className="btn sm primary outline" onClick={() => { setFeeBatch(b); setBatchFeeModalOpen(true); }}>
                      Collect Batch Fees
                    </button>
                    <button className="btn sm" onClick={() => { setEditingBatch(b); setBatchModalOpen(true); }}>
                      Edit Batch
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {batchModalOpen && (
        <BatchModal
          isOpen={batchModalOpen}
          batch={editingBatch}
          onClose={() => setBatchModalOpen(false)}
        />
      )}

      {batchFeeModalOpen && (
        <BatchFeeModal
          isOpen={batchFeeModalOpen}
          batch={feeBatch}
          onClose={() => setBatchFeeModalOpen(false)}
        />
      )}
    </div>
  );
};
