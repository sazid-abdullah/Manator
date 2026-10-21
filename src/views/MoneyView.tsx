import React, { useState } from 'react';
import { useStore } from '../store/context';
import { monthKey, todayISO, fmtMonth, fmtDate, parseISO, addMonths } from '../utils/date';
import { moneySnapshot, contractStatus, goalPlan, MoneySnapshotResult } from '../store/contracts';
import { callAI, MONEY_SYSTEM, moneyPrompt, renderMarkdown } from '../services/ai';
import { Payment, Expense, Goal } from '../types';

interface MoneyViewProps {
  onNavigate: (route: string, param?: string) => void;
  onRecordPayment: (opts?: { studentId?: string; contractId?: string; payment?: Payment }) => void;
  onAddExpense: (expense?: Expense) => void;
  onAddGoal: (goal?: Goal) => void;
  onDepositGoal: (goalId: string) => void;
}

const MONEY_QUESTIONS = [
  'How is my money this month compared to before?',
  'Where can I cut my spending?',
  'How should I save for my goals?',
  'How much should I keep as an emergency fund?',
];

export const MoneyView: React.FC<MoneyViewProps> = ({
  onNavigate,
  onRecordPayment,
  onAddExpense,
  onAddGoal,
  onDepositGoal,
}) => {
  const { state, money, studentName, downloadFile, toast } = useStore();
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKey(todayISO()));
  const [moneyQ, setMoneyQ] = useState('');
  const [moneyAIResult, setMoneyAIResult] = useState<{ q: string; content: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const pays = state.payments.filter(p => monthKey(p.date) === selectedMonth);
  const exps = state.expenses.filter(x => monthKey(x.date) === selectedMonth);
  const income = pays.reduce((a, p) => a + Number(p.amount || 0), 0);
  const spent = exps.reduce((a, x) => a + Number(x.amount || 0), 0);

  const dues = state.contracts
    .map(c => ({
      c,
      st: contractStatus(c, state.lessons, state.payments),
      s: state.students.find(st => st.id === c.studentId),
    }))
    .filter(x => x.st.balance > 0.005);
  const outstanding = dues.reduce((a, x) => a + x.st.balance, 0);

  const snap: MoneySnapshotResult = moneySnapshot(state);

  // 6 months bar chart
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    months.push(monthKey(addMonths(selectedMonth + '-01', -i)));
  }
  const series = months.map(k => ({
    k,
    inc: state.payments.filter(p => monthKey(p.date) === k).reduce((a, p) => a + Number(p.amount || 0), 0),
    exp: state.expenses.filter(x => monthKey(x.date) === k).reduce((a, x) => a + Number(x.amount || 0), 0),
  }));
  const maxBar = Math.max(1, ...series.map(x => Math.max(x.inc, x.exp)));

  // Transactions list
  const transactions: Array<{
    id: string;
    date: string;
    type: 'income' | 'expense';
    title: string;
    meta: string;
    amount: number;
    payment?: Payment;
    expense?: Expense;
  }> = [
    ...pays.map(p => ({
      id: p.id,
      date: p.date,
      type: 'income' as const,
      title: studentName(p.studentId),
      meta: `${fmtDate(p.date, { day: 'numeric', month: 'short' })} · ${p.method || 'Cash'}${p.note ? ' · ' + p.note : ''}`,
      amount: p.amount,
      payment: p,
    })),
    ...exps.map(x => ({
      id: x.id,
      date: x.date,
      type: 'expense' as const,
      title: x.category,
      meta: `${fmtDate(x.date, { day: 'numeric', month: 'short' })}${x.note ? ' · ' + x.note : ''}`,
      amount: -x.amount,
      expense: x,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Income by student
  const perStudent: Record<string, number> = {};
  for (const p of pays) perStudent[p.studentId] = (perStudent[p.studentId] || 0) + Number(p.amount || 0);

  // Expense by category
  const byCat: Record<string, number> = {};
  for (const x of exps) byCat[x.category] = (byCat[x.category] || 0) + Number(x.amount || 0);

  const handleAskAI = async (q: string) => {
    if (!q.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const promptText = moneyPrompt(q, snap, state);
      const text = await callAI(MONEY_SYSTEM, promptText, state, { temperature: 0.4, maxTokens: 2048 });
      setMoneyAIResult({ q, content: text });
    } catch (err: any) {
      toast(err.message || 'Could not fetch AI financial advice', 'error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleExportCSV = () => {
    const rows = [['Type', 'Date', 'Student', 'Contract', 'Method/Category', 'Amount', 'Note']];
    for (const p of [...state.payments].sort((a, b) => a.date.localeCompare(b.date))) {
      const c = p.contractId ? state.contracts.find(x => x.id === p.contractId) : null;
      rows.push(['Income', p.date, studentName(p.studentId), c ? c.title : '', p.method || '', String(p.amount), p.note || '']);
    }
    for (const x of [...state.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
      rows.push(['Expense', x.date, '', '', x.category, String(-x.amount), x.note || '']);
    }
    const cell = (v: any) => {
      let t = String(v == null ? '' : v);
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const csv = rows.map(r => r.map(cell).join(',')).join('\r\n');
    downloadFile(`tuitrix-money-${todayISO()}.csv`, '\ufeff' + csv, 'text/csv');
    toast('Money CSV exported', 'success');
  };

  const goalPlans = state.goals.map(g => ({
    g,
    p: goalPlan(g, snap.avgNet, snap.today),
  }));

  const goalAdviceText = (g: Goal, p: any, net: number) => {
    const m = (n: number) => money(Math.ceil(n));
    const by = g.targetDate ? fmtDate(g.targetDate) : '';
    const when = p.eta ? fmtMonth(monthKey(p.eta)) : '';
    switch (p.status) {
      case 'done':
        return 'Goal reached! You have enough saved.';
      case 'on-track':
        return `Save ${m(p.perMonth)}/month until ${by}. You have about ${m(net)}/month left over, so this fits.`;
      case 'short':
        return `Needs ${m(p.perMonth)}/month to reach it by ${by}, but you only have ${m(net)}/month left over. At that pace you'd reach it around ${when}.`;
      case 'open':
        return `Saving all of your ${m(net)}/month left over, you'd reach it around ${when}.`;
      case 'past':
        return `The date has passed and ${m(p.remaining)} is still to go.`;
      default:
        return 'Lately expenses match or exceed income, leaving little to save. Ask AI for ideas.';
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Money</h1>
          <div className="sub">{fmtMonth(selectedMonth)}</div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => onRecordPayment()}>
            + Payment
          </button>
          <button className="btn" onClick={() => onAddExpense()}>
            + Expense
          </button>
          <button className="btn ghost" onClick={handleExportCSV}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="month"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          aria-label="Month"
        />
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="label">Income</div>
          <div className="value pos">{money(income)}</div>
          <div className="hint">{pays.length} payment{pays.length === 1 ? '' : 's'}</div>
        </div>
        <div className="card stat">
          <div className="label">Expenses</div>
          <div className="value neg">{money(spent)}</div>
        </div>
        <div className="card stat">
          <div className="label">Net profit</div>
          <div className={`value ${income - spent >= 0 ? 'pos' : 'neg'}`}>{money(income - spent)}</div>
        </div>
        <div className="card stat">
          <div className="label">Outstanding now</div>
          <div className={`value ${outstanding > 0 ? 'neg' : ''}`}>{money(outstanding)}</div>
          <div className="hint">across {dues.length} contract{dues.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div className="grid-2 section">
        {/* Typical month */}
        <div className="card">
          <h2>Your typical month</h2>
          <div className="list">
            <div className="row">
              <div className="grow">
                <div className="title">Average income</div>
              </div>
              <span className="nowrap pos">{money(Math.round(snap.avgIncome))}</span>
            </div>
            <div className="row">
              <div className="grow">
                <div className="title">Average expenses</div>
              </div>
              <span className="nowrap neg">{money(Math.round(snap.avgExpense))}</span>
            </div>
            <div className="row">
              <div className="grow">
                <div className="title">Left over to save</div>
              </div>
              <span className={`nowrap ${snap.avgNet < 0 ? 'neg' : 'pos'}`}>
                {money(Math.round(snap.avgNet))}{' '}
                {snap.avgIncome > 0 && `(${Math.round((snap.avgNet / snap.avgIncome) * 100)}%)`}
              </span>
            </div>
            <div className="row">
              <div className="grow">
                <div className="title">Expected from active contracts</div>
                <div className="meta">
                  Estimate from {snap.expected.count} active contract{snap.expected.count === 1 ? '' : 's'}
                </div>
              </div>
              <span className="nowrap">{money(Math.round(snap.expected.total))}</span>
            </div>
            <div className="row">
              <div className="grow">
                <div className="title">Owed to you right now</div>
              </div>
              <span className={`nowrap ${snap.outstanding > 0 ? 'neg' : ''}`}>
                {money(snap.outstanding)}
              </span>
            </div>
          </div>
          <div className="help" style={{ marginTop: '8px' }}>
            {snap.basisPartial
              ? 'Based on this month so far.'
              : `Average of ${snap.basisMonths.map(k => parseISO(k + '-01').toLocaleDateString(undefined, { month: 'short' })).join(', ')}.`}
          </div>
        </div>

        {/* Savings goals */}
        <div className="card">
          <div className="card-head">
            <h2>Savings goals</h2>
            <button className="btn sm primary" onClick={() => onAddGoal()}>
              + Goal
            </button>
          </div>
          <div className="list">
            {goalPlans.length === 0 ? (
              <div className="empty">
                Planning a purchase or emergency fund? Add a goal to see how much to save monthly.
              </div>
            ) : (
              goalPlans.map(({ g, p }) => (
                <div key={g.id} className="row">
                  <div className="grow">
                    <div className="title">{g.name}</div>
                    <div className="meta">
                      {money(g.saved)} of {money(g.target)}
                      {g.targetDate ? ` · by ${fmtDate(g.targetDate)}` : ''}
                    </div>
                    <div
                      className={`progress ${['short', 'past', 'no-savings'].includes(p.status) ? 'warn' : ''}`}
                    >
                      <span style={{ width: `${Math.round(p.pct * 100)}%` }} />
                    </div>
                    <div className="meta small" style={{ marginTop: '4px' }}>
                      {goalAdviceText(g, p, snap.avgNet)}
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn sm" onClick={() => onDepositGoal(g.id)}>
                      + Add money
                    </button>
                    <button className="btn sm ghost" onClick={() => onAddGoal(g)}>
                      Edit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ask AI about money */}
      <div className="card section">
        <h2>Ask AI about your money</h2>
        <p className="muted small">
          Personalized advice on fee collection, saving for goals and budgeting. Your student names and private details are never sent.
        </p>
        <div className="chips money-chips">
          {MONEY_QUESTIONS.map((q, i) => (
            <button
              key={i}
              className="btn sm ghost"
              onClick={() => {
                setMoneyQ(q);
                handleAskAI(q);
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="form"
          onSubmit={e => {
            e.preventDefault();
            handleAskAI(moneyQ);
          }}
        >
          <label className="field">
            Your question
            <textarea
              rows={2}
              value={moneyQ}
              onChange={e => setMoneyQ(e.target.value)}
              placeholder="e.g. I want to buy a laptop by next month. How much should I save?"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={aiBusy || !moneyQ.trim()}>
              {aiBusy ? <span className="spinner" /> : 'Ask AI'}
            </button>
          </div>
        </form>

        {moneyAIResult && (
          <div className="ai-output" style={{ marginTop: '16px' }}>
            <div className="card-head">
              <h3>{moneyAIResult.q}</h3>
              <button
                className="btn sm"
                onClick={() => {
                  navigator.clipboard?.writeText(moneyAIResult.content);
                  toast('Copied', 'info');
                }}
              >
                Copy
              </button>
            </div>
            <div
              className="doc"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(moneyAIResult.content) }}
            />
          </div>
        )}
      </div>

      <div className="grid-2 section">
        {/* Last 6 months bar chart */}
        <div className="card">
          <div className="card-head">
            <h2>Last 6 months</h2>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--green)' }} />
                Income
              </span>
              <span>
                <i style={{ background: 'var(--red)' }} />
                Expenses
              </span>
            </div>
          </div>
          <div className="bars">
            {series.map(x => (
              <div
                key={x.k}
                className="bar-col"
                title={`${fmtMonth(x.k)}: +${money(x.inc)} / -${money(x.exp)}`}
              >
                <div className="bar-pair">
                  <div className="bar" style={{ height: `${(x.inc / maxBar) * 100}%` }} />
                  <div
                    className="bar exp"
                    style={{ height: `${(x.exp / maxBar) * 100}%` }}
                  />
                </div>
                <div className="bar-label">
                  {parseISO(x.k + '-01').toLocaleDateString(undefined, { month: 'short' })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Who owes you */}
        <div className="card">
          <h2>Who owes you</h2>
          <div className="list">
            {dues.length === 0 ? (
              <div className="empty">Everyone is paid up!</div>
            ) : (
              dues
                .sort((a, b) => b.st.balance - a.st.balance)
                .map(({ c, st, s }) => (
                  <div key={c.id} className="row">
                    <a
                      className="grow"
                      href={`#/student/${s?.id}`}
                      onClick={e => {
                        e.preventDefault();
                        if (s) onNavigate('student', s.id);
                      }}
                      style={{ color: 'inherit' }}
                    >
                      <div className="title">{s?.name}</div>
                      <div className="meta">
                        {c.title}
                        {st.owedSince && ` · since ${fmtDate(st.owedSince, { day: 'numeric', month: 'short' })}`}
                      </div>
                    </a>
                    <span className="neg nowrap">{money(st.balance)}</span>
                    <button
                      className="btn sm"
                      onClick={() => onRecordPayment({ studentId: s?.id, contractId: c.id })}
                    >
                      Paid
                    </button>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      <div className="grid-2 section">
        <div className="card">
          <h2>Income by student</h2>
          <div className="list">
            {Object.keys(perStudent).length === 0 ? (
              <div className="empty">No income this month.</div>
            ) : (
              Object.entries(perStudent)
                .sort((a, b) => b[1] - a[1])
                .map(([sid, v]) => (
                  <div key={sid} className="row">
                    <div className="grow title">{studentName(sid)}</div>
                    <span className="nowrap pos">{money(v)}</span>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="card">
          <h2>Expenses by category</h2>
          <div className="list">
            {Object.keys(byCat).length === 0 ? (
              <div className="empty">No expenses this month.</div>
            ) : (
              Object.entries(byCat)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k} className="row">
                    <div className="grow title">{k}</div>
                    <span className="nowrap neg">{money(v)}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Transactions list */}
      <div className="section">
        <h2>Transactions</h2>
        <div className="card">
          <div className="list">
            {transactions.length === 0 ? (
              <div className="empty">Nothing recorded this month.</div>
            ) : (
              transactions.map(t => (
                <div key={t.id} className="row">
                  <div className="grow">
                    <div className="title">{t.title}</div>
                    <div className="meta">{t.meta}</div>
                  </div>
                  <span className={`nowrap ${t.type === 'income' ? 'pos' : 'neg'}`}>
                    {t.type === 'income' ? `+${money(t.amount)}` : `-${money(Math.abs(t.amount))}`}
                  </span>
                  <button
                    className="btn sm ghost"
                    onClick={() =>
                      t.type === 'income'
                        ? onRecordPayment({ payment: t.payment })
                        : onAddExpense(t.expense)
                    }
                  >
                    Edit
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
