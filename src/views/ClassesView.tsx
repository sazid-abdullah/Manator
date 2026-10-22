import React, { useState } from 'react';
import { useStore } from '../store/context';
import { statusBadge } from './HomeView';
import { monthKey, todayISO, fmtMonth, fmtDate, fmtTime } from '../utils/date';
import { Lesson } from '../types';

interface ClassesViewProps {
  initialStudentFilter?: string;
  initialBatchFilter?: string;
  onNavigate: (route: string, param?: string) => void;
  onLogLesson: (opts: { studentId?: string; batchId?: string; lesson?: Lesson }) => void;
}

export const ClassesView: React.FC<ClassesViewProps> = ({
  initialStudentFilter = '',
  initialBatchFilter = '',
  onNavigate,
  onLogLesson,
}) => {
  const { state, studentName } = useStore();
  const [studentFilter, setStudentFilter] = useState(initialStudentFilter);
  const [batchFilter, setBatchFilter] = useState(initialBatchFilter);
  const [monthFilter, setMonthFilter] = useState<string>(monthKey(todayISO()));

  const filtered = state.lessons
    .filter(l => !studentFilter || l.studentId === studentFilter)
    .filter(l => !batchFilter || l.batchId === batchFilter)
    .filter(l => !monthFilter || monthKey(l.date) === monthFilter)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

  const groups: Record<string, Lesson[]> = {};
  for (const l of filtered) {
    (groups[l.date] = groups[l.date] || []).push(l);
  }

  const taught = filtered.filter(l => l.status === 'taught');
  const minutes = taught.reduce((a, l) => a + (Number(l.duration) || 0), 0);
  const hours = Math.round(minutes / 6) / 10;
  const absentOrCancelled = filtered.length - taught.length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Class log</h1>
          <div className="sub">What you taught, day by day</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn primary"
            onClick={() => onLogLesson({ studentId: studentFilter })}
          >
            + Log class
          </button>
          <button
            className="btn"
            onClick={() => onLogLesson({ batchId: batchFilter || (state.batches?.[0]?.id ?? '') })}
          >
            + Log Batch
          </button>
        </div>
      </div>

      <div className="toolbar">
        <select
          value={studentFilter}
          onChange={e => { setStudentFilter(e.target.value); setBatchFilter(''); }}
          aria-label="Filter by Student"
        >
          <option value="">All students</option>
          {state.students.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {state.batches && state.batches.length > 0 && (
          <select
            value={batchFilter}
            onChange={e => { setBatchFilter(e.target.value); setStudentFilter(''); }}
            aria-label="Filter by Batch"
          >
            <option value="">All batches</option>
            {state.batches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <input
          type="month"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          aria-label="Filter by Month"
        />

        {monthFilter && (
          <button className="btn ghost" onClick={() => setMonthFilter('')}>
            All time
          </button>
        )}
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Classes taught</div>
          <div className="value">{taught.length}</div>
          <div className="hint">{monthFilter ? fmtMonth(monthFilter) : 'all time'}</div>
        </div>
        <div className="card stat">
          <div className="label">Hours</div>
          <div className="value">{hours}</div>
        </div>
        <div className="card stat">
          <div className="label">Absent / cancelled</div>
          <div className="value">{absentOrCancelled}</div>
        </div>
      </div>

      {Object.keys(groups).length === 0 ? (
        <div className="card empty">No classes found for this filter.</div>
      ) : (
        Object.keys(groups).map(date => (
          <div key={date} className="day-group">
            <h3>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            {groups[date].map(l => (
              <div key={l.id} className="lesson">
                <div className="top">
                  <div>
                    <div className="title">
                      <b>
                        <a
                          href={`#/student/${l.studentId}`}
                          onClick={e => {
                            e.preventDefault();
                            onNavigate('student', l.studentId);
                          }}
                        >
                          {studentName(l.studentId)}
                        </a>
                        {l.subject ? ` · ${l.subject}` : ''}
                        {l.batchId && (
                          <span className="badge blue" style={{ marginLeft: '6px' }}>
                            👥 {state.batches?.find(b => b.id === l.batchId)?.name || 'Batch'}
                          </span>
                        )}
                      </b>
                    </div>
                    <div className="meta muted small">
                      {l.time ? fmtTime(l.time) + ' · ' : ''}
                      {l.duration ? `${l.duration} min` : ''}
                    </div>
                  </div>
                  <div className="actions">
                    {statusBadge(l.status)}
                    <button
                      className="btn sm ghost"
                      onClick={() => onLogLesson({ studentId: l.studentId, lesson: l })}
                    >
                      Edit
                    </button>
                  </div>
                </div>
                {l.topics && <div className="topics">{l.topics}</div>}
                {l.homework && (
                  <div className="hw">
                    <b>Homework:</b> {l.homework}
                  </div>
                )}
                {l.notes && (
                  <div className="hw">
                    <b>Notes:</b> {l.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};
