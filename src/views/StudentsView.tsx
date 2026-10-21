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

export const StudentsView: React.FC<StudentsViewProps> = ({
  onNavigate,
  onOpenStudentModal,
}) => {
  const { state, money } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');

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

  const balanceBadge = (bal: number) => {
    if (bal > 0.005) return <span className="badge red">Owes {money(bal)}</span>;
    if (bal < -0.005) return <span className="badge green">Advance {money(-bal)}</span>;
    return <span className="badge green">Paid up</span>;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Students</h1>
          <div className="sub">{activeCount} active</div>
        </div>
        <button className="btn primary" onClick={onOpenStudentModal}>
          + Add student
        </button>
      </div>

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
    </div>
  );
};
