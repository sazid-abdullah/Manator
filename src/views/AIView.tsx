import React, { useState, useEffect } from 'react';
import { useStore } from '../store/context';
import {
  callAI,
  AI_SYSTEM,
  CHECK_SYSTEM,
  lessonPlanPrompt,
  examPrompt,
  worksheetPrompt,
  checkPrompt,
  parseCheck,
  revisePrompt,
  renderMarkdown,
  splitAnswerKey,
  cleanDoc,
  examMarks,
  AI_PROVIDERS,
  autoModel,
} from '../services/ai';
import { fmtDate, uid, todayISO } from '../utils/date';
import { SavedDoc, SavedAiResource } from '../types';
import { isProUser, FREE_TIER_MAX_SAVED_RESOURCES, getDailyAiQuotaState } from '../utils/tierLimits';
import { RewardedAdModal } from '../components/RewardedAdModal';

interface AIViewProps {
  initialTool?: string;
  initialStudentId?: string;
  onNavigate: (route: string, param?: string) => void;
  onStartExam: (doc: SavedDoc) => void;
  onUploadPaper: () => void;
  onImportDoc: () => void;
}

const AI_TOOLS = {
  plan: 'Lesson plan',
  exam: 'Exam paper',
  worksheet: 'Worksheet',
  library: 'Saved Library',
  saved: 'Old Legacy Docs',
  results: 'Exam results',
};

const EXAM_TYPES = [
  'Multiple choice (MCQ)',
  'Short answer',
  'Broad / creative questions',
  'Fill in the blanks',
  'True / False',
  'Matching',
  'Problem solving / numericals',
];

const LANGS = ['English', 'Bangla', 'English + Bangla'];

export const AIView: React.FC<AIViewProps> = ({
  initialTool = 'plan',
  initialStudentId = '',
  onNavigate,
  onStartExam,
  onUploadPaper,
  onImportDoc,
}) => {
  const { state, updateSettings, billingState, toast, saveDoc, deleteDoc, studentName, saveAiResource, deleteAiResource, toggleFavoriteAiResource, setState } = useStore();
  const [currentTool, setCurrentTool] = useState<string>(initialTool);
  const isPro = isProUser(billingState, state.settings.tutorName);
  const [studentId, setStudentId] = useState(initialStudentId);

  // Form states
  const [grade, setGrade] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [topics, setTopics] = useState('');
  const [duration, setDuration] = useState<number>(60);
  const [level, setLevel] = useState('average');
  const [difficulty, setDifficulty] = useState('mixed (easy → hard)');
  const [language, setLanguage] = useState('English');
  const [examFormat, setExamFormat] = useState('custom');
  const [cqCount, setCqCount] = useState(8);
  const [cqAnswer, setCqAnswer] = useState(5);
  const [mcqCount, setMcqCount] = useState(25);
  const [marks, setMarks] = useState(50);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    'Multiple choice (MCQ)',
    'Short answer',
  ]);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [checkWithAI, setCheckWithAI] = useState(true);
  const [worksheetCount, setWorksheetCount] = useState(15);
  const [notes, setNotes] = useState('');

  // Result & execution states
  const [busy, setBusy] = useState<string | false>(false);
  const [result, setResult] = useState<{
    tool: string;
    title: string;
    content: string;
    prev?: string;
    studentId?: string | null;
    savedId?: string | null;
    check?: any;
    error?: string;
  } | null>(null);
  const [revisionInput, setRevisionInput] = useState('');

  // Saved docs & results filters
  const [docsFilterType, setDocsFilterType] = useState('');
  const [docsFilterStudent, setDocsFilterStudent] = useState('');
  const [viewingDoc, setViewingDoc] = useState<SavedDoc | null>(null);

  // Library filters
  const [libraryFilterSearch, setLibraryFilterSearch] = useState('');
  const [libraryFilterType, setLibraryFilterType] = useState('');
  const [libraryFilterFavorite, setLibraryFilterFavorite] = useState(false);

  // Print Settings
  const [printMarks, setPrintMarks] = useState('');
  const [printTime, setPrintTime] = useState('');
  const [printDate, setPrintDate] = useState('');
  const [localShowHeader, setLocalShowHeader] = useState(state.profile?.showPrintHeader ?? true);
  const [localShowWatermark, setLocalShowWatermark] = useState(state.profile?.showPrintWatermark ?? true);

  // Prefill student details if student changes
  useEffect(() => {
    if (studentId) {
      const s = state.students.find(x => x.id === studentId);
      if (s) {
        setGrade(s.grade || '');
        setCurriculum(s.curriculum || '');
        if (s.subjects && s.subjects[0]) setSubject(s.subjects[0]);
      }
    }
  }, [studentId, state.students]);

  const handleFillTopicsFromLog = () => {
    if (!studentId) {
      toast('Select a student first', 'error');
      return;
    }
    const logged = state.lessons
      .filter(l => l.studentId === studentId && l.status === 'taught' && l.topics)
      .filter(l => !subject || !l.subject || l.subject.toLowerCase() === subject.toLowerCase())
      .map(l => l.topics!.trim());
    const unique = [...new Set(logged)];
    if (!unique.length) {
      toast('No topics found in class log for this student and subject', 'info');
      return;
    }
    setTopics(unique.join('\n'));
    toast(`Added ${unique.length} topic(s) from class log`, 'success');
  };

  const [rewardModalOpen, setRewardModalOpen] = useState(false);

  const quota = getDailyAiQuotaState(state.dailyAiUsage, todayISO());
  const hasKey = state.ai.provider === 'ollama' || !!(state.ai.keys[state.ai.provider] && state.ai.keys[state.ai.provider].trim());
  const canUseAI = hasKey || isPro || quota.remainingToday > 0 || quota.adCreditsAvailable > 0;

  const consumeAiCredit = () => {
    if (hasKey || isPro) return; // Unmetered
    setState(s => {
       const currentUsage = s.dailyAiUsage?.date === todayISO() ? s.dailyAiUsage : { date: todayISO(), adsWatchedToday: 0, requestsUsedToday: 0, unlockedCredits: 0 };

       let newUnlocked = currentUsage.unlockedCredits;
       let newUsed = currentUsage.requestsUsedToday;

       if (newUnlocked > 0) {
         newUnlocked--;
       } else {
         newUsed++;
       }

       return {
         ...s,
         dailyAiUsage: {
           ...currentUsage,
           unlockedCredits: newUnlocked,
           requestsUsedToday: newUsed
         }
       };
    });
  };

  const handleRewardEarned = () => {
    setState(s => {
       const currentUsage = s.dailyAiUsage?.date === todayISO() ? s.dailyAiUsage : { date: todayISO(), adsWatchedToday: 0, requestsUsedToday: 0, unlockedCredits: 0 };
       return {
         ...s,
         dailyAiUsage: {
           ...currentUsage,
           adsWatchedToday: currentUsage.adsWatchedToday + 1,
           unlockedCredits: currentUsage.unlockedCredits + 1
         }
       };
    });
    toast('Unlocked 1 AI Request!', 'success');
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!canUseAI) {
      if (quota.canWatchAd) {
         setRewardModalOpen(true);
      } else {
         toast('Daily Free AI limit reached. Add your own API key or upgrade to Pro.', 'error');
      }
      return;
    }

    setBusy('Generating document with AI…');
    setResult(null);

    try {
      const formParams = {
        grade,
        curriculum,
        subject,
        topic,
        topics,
        duration,
        level,
        difficulty,
        language,
        format: examFormat,
        cqCount,
        cqAnswer,
        mcqCount,
        marks,
        types: selectedTypes,
        answerKey: includeAnswerKey,
        count: worksheetCount,
        notes,
        studentId,
      };

      const title =
        currentTool === 'plan'
          ? `Lesson plan: ${subject} – ${topic}`
          : currentTool === 'exam'
          ? `Exam: ${subject}${grade ? ' (' + grade + ')' : ''} – ${examMarks(formParams)} marks`
          : `Worksheet: ${subject} – ${topic}`;

      const promptText =
        currentTool === 'plan'
          ? lessonPlanPrompt(formParams)
          : currentTool === 'exam'
          ? examPrompt(formParams)
          : worksheetPrompt(formParams);

      const generated = cleanDoc(await callAI(AI_SYSTEM, promptText, state, { onFallback: (msg) => toast(msg, 'info') }));
      consumeAiCredit();

      const newResult = {
        tool: currentTool,
        title,
        content: generated,
        studentId: studentId || null,
        savedId: null,
      };

      setResult(newResult);
      setBusy(false);

      if (checkWithAI && currentTool !== 'plan') {
        runCheck(newResult, formParams);
      }
    } catch (err: any) {
      setBusy(false);
      setResult({
        tool: currentTool,
        title: 'Error',
        content: '',
        error: err.message || 'Generation failed',
      });
      toast(err.message || 'Generation failed', 'error');
    }
  };

  const runCheck = async (r: any, formParams: any) => {
    setBusy('Examining and verifying answers…');
    try {
      const checkText = await callAI(
        CHECK_SYSTEM,
        checkPrompt(r.tool, formParams, r.content),
        state,
        { temperature: 0.2, onFallback: (msg) => toast(msg, 'info') }
      );
      const parsed = parseCheck(checkText);
      setResult(prev => (prev ? { ...prev, check: parsed } : null));
    } catch (err: any) {
      setResult(prev => (prev ? { ...prev, check: { error: err.message } } : null));
    } finally {
      setBusy(false);
    }
  };

  const handleRevise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result || !revisionInput.trim() || busy) return;

    setBusy('Applying requested changes…');
    try {
      const revised = cleanDoc(
        await callAI(
          AI_SYSTEM,
          revisePrompt(result.tool, {}, result.content, revisionInput),
          state,
          { onFallback: (msg) => toast(msg, 'info') }
        )
      );
      setResult(prev =>
        prev
          ? {
              ...prev,
              prev: prev.content,
              content: revised,
              savedId: null,
              check: null,
            }
          : null
      );
      setRevisionInput('');
      toast('Document revised', 'success');
    } catch (err: any) {
      toast(err.message || 'Revision failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveResult = () => {
    if (!result || result.savedId) return;

    // Enforce quota
    const savedCount = (state.savedResources || []).length;
    if (!isPro && savedCount >= FREE_TIER_MAX_SAVED_RESOURCES) {
      toast(`Free Tier limit reached (${FREE_TIER_MAX_SAVED_RESOURCES} saved resources). Upgrade to Pro for unlimited saves.`, 'error');
      return;
    }

    const resId = uid();
    saveAiResource({
      id: resId,
      title: result.title,
      type: result.tool,
      classLevel: grade || 'Unspecified',
      subject: subject || 'Unspecified',
      topic: topic || topics || 'Unspecified',
      content: result.content,
      createdAt: new Date().toISOString()
    });

    // Also save to legacy docs for backwards compatibility with exams
    const docId = resId;
    saveDoc({
      id: docId,
      type: result.tool as any,
      title: result.title,
      content: result.content,
      studentId: result.studentId || null,
      createdAt: new Date().toISOString(),
    });

    setResult(prev => (prev ? { ...prev, savedId: resId } : null));
    toast('💾 Saved to Resource Library', 'success');
  };

  const handlePrint = (title: string, md: string) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) return;

    let headerHtml = '';
    let watermarkHtml = '';
    let footerHtml = '';

    const tutorNameStr = state.settings.tutorName || '';
    const brandTitleStr = state.profile?.brandTitle || 'EXAM / LECTURE SHEET';
    const credentialsStr = state.profile?.credentials || '';

    if (localShowHeader) {
      const parts = [tutorNameStr, credentialsStr].filter(Boolean);
      const attribution = parts.length > 0 ? `Prepared by: ${parts.join(' | ')}` : '';

      headerHtml = `
        <div class="branded-header" style="text-align:center; margin-bottom: 20px; border-bottom: 2px solid #222; padding-bottom: 12px;">
          <h1 style="margin:0; font-size:18pt;">${brandTitleStr}</h1>
          ${attribution ? `<div style="font-size:11pt; color:#444; margin-top:4px;">${attribution}</div>` : ''}
          <div style="display:flex; justify-content:space-between; margin-top:16px; font-size:11pt;">
            <span><strong>Student Name:</strong> ______________________</span>
            <span><strong>Date:</strong> ${printDate || '__________'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11pt;">
            <span><strong>Time Allowed:</strong> ${printTime || '__________'}</span>
            <span><strong>Total Marks:</strong> ${printMarks || '__________'}</span>
          </div>
        </div>
      `;
    }

    if (localShowWatermark) {
      const wmText = state.profile?.brandTitle || state.settings.tutorName || 'Tuitrix';
      watermarkHtml = `<div class="watermark">${wmText}</div>`;
      footerHtml = `<div class="print-footer">Prepared by ${tutorNameStr || 'Tutor'} &bull; Powered by Tuitrix</div>`;
    }

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { margin: 12mm; }
      body { font:12pt/1.5 'Segoe UI','Noto Sans Bengali',Arial,sans-serif; color:#111; margin:0; position:relative; min-height: 100vh; }
      h2{font-size:16pt;margin:14pt 0 6pt}h3{font-size:13pt;margin:12pt 0 4pt}h4,h5{font-size:12pt;margin:10pt 0 4pt}
      table{border-collapse:collapse;width:100%;margin:6pt 0}th,td{border:1px solid #999;padding:4pt 6pt;text-align:left;vertical-align:top}
      hr{border:none;border-top:1px dashed #999;margin:14pt 0}ul,ol{margin:4pt 0 4pt 20pt}p{margin:4pt 0}
      pre,code{font-family:Consolas,monospace}blockquote{border-left:3px solid #999;padding-left:8pt;color:#444}
      .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 6rem; opacity: 0.04; pointer-events: none; z-index: -1; white-space: nowrap; text-align: center; color: #000; font-weight: bold; }
      .print-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9pt; color: #666; padding: 10px 0; border-top: 1px solid #ddd; }
      .content { padding-bottom: 40px; }
    </style></head><body>
      ${watermarkHtml}
      <div class="content">
        ${headerHtml}
        ${renderMarkdown(md)}
      </div>
      ${footerHtml}
    </body></html>`);
    doc.close();
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    }, 250);
  };

  const savedDocsList = state.docs
    .filter(d => !docsFilterType || d.type === docsFilterType)
    .filter(d => !docsFilterStudent || d.studentId === docsFilterStudent)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const attemptsList = state.attempts
    .filter(a => !docsFilterStudent || a.studentId === docsFilterStudent)
    .sort((a, b) => b.startedAt - a.startedAt);

  const libraryList = (state.savedResources || [])
    .filter(r => !libraryFilterType || r.type === libraryFilterType)
    .filter(r => !libraryFilterFavorite || r.isFavorite)
    .filter(r => !libraryFilterSearch || [r.title, r.subject, r.topic, r.classLevel].some(f => f?.toLowerCase().includes(libraryFilterSearch.toLowerCase())))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const handleLoadLibraryResource = (r: SavedAiResource) => {
    // Populate form fields
    setGrade(r.classLevel);
    setSubject(r.subject);
    setTopic(r.topic);

    // Switch to appropriate tool (use fallback if exact match not found, but it usually matches)
    const nextTool = ['plan', 'exam', 'worksheet'].includes(r.type) ? r.type : 'plan';
    setCurrentTool(nextTool);

    // Set result directly without hitting API
    setResult({
      tool: r.type,
      title: r.title,
      content: r.content,
      studentId: null,
      savedId: r.id // Important so it knows it's already saved
    });

    toast('Library resource loaded into editor', 'success');
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>AI Assistant</h1>
          <div className="sub">
            Lesson plans, exam papers, worksheets · {AI_PROVIDERS[state.ai.provider]?.name} (
            {autoModel(state.ai.provider, state)})
          </div>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: '16px' }}>
        {Object.entries(AI_TOOLS).map(([k, v]) => (
          <button
            key={k}
            className={currentTool === k ? 'active' : ''}
            onClick={() => setCurrentTool(k)}
          >
            {v}
          </button>
        ))}
      </div>

      {currentTool === 'results' ? (
        <div>
          <div className="toolbar">
            <select
              value={docsFilterStudent}
              onChange={e => setDocsFilterStudent(e.target.value)}
              aria-label="Filter by Student"
            >
              <option value="">All students</option>
              {state.students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={onUploadPaper}>
              Upload question paper
            </button>
          </div>
          <div className="card">
            <div className="list">
              {attemptsList.length === 0 ? (
                <div className="empty">
                  No exams taken yet. Start an exam from a saved paper or upload a new one.
                </div>
              ) : (
                attemptsList.map(at => (
                  <a
                    key={at.id}
                    className="row"
                    href={`#/${at.status === 'running' ? 'exam' : 'result'}/${at.id}`}
                    onClick={e => {
                      e.preventDefault();
                      onNavigate(at.status === 'running' ? 'exam' : 'result', at.id);
                    }}
                  >
                    <div className="grow">
                      <div className="title">{at.title || 'Exam'}</div>
                      <div className="meta">
                        {fmtDate(at.startedAt ? new Date(at.startedAt).toISOString().slice(0, 10) : '')}
                        {at.studentId ? ` · ${studentName(at.studentId)}` : ''}
                      </div>
                    </div>
                    {at.status === 'running' ? (
                      <span className="badge yellow">Running</span>
                    ) : (
                      <span className="badge green">View score</span>
                    )}
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      ) : currentTool === 'library' ? (
        <div>
          <div className="toolbar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search title, subject, topic..."
              value={libraryFilterSearch}
              onChange={e => setLibraryFilterSearch(e.target.value)}
              style={{ flex: 1, minWidth: '200px' }}
            />
            <select
              value={libraryFilterType}
              onChange={e => setLibraryFilterType(e.target.value)}
              aria-label="Filter by Type"
            >
              <option value="">All types</option>
              <option value="plan">Lesson plan</option>
              <option value="exam">Exam paper</option>
              <option value="worksheet">Worksheet</option>
            </select>
            <button
              className={`btn ${libraryFilterFavorite ? 'primary' : 'ghost'}`}
              onClick={() => setLibraryFilterFavorite(!libraryFilterFavorite)}
              title="Show only favorites"
            >
              ⭐ Favorites
            </button>
          </div>
          <div className="card">
            <div className="list">
              {libraryList.length === 0 ? (
                <div className="empty">
                  Nothing saved in your library yet. Generate a paper or lesson plan and click "Save to Resource Library"!
                </div>
              ) : (
                libraryList.map(r => (
                  <div key={r.id} className="row">
                    <div className="grow">
                      <div className="title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{r.title}</span>
                        <span className="badge">{r.subject}</span>
                        <span className="badge ghost">{AI_TOOLS[r.type as keyof typeof AI_TOOLS] || r.type}</span>
                      </div>
                      <div className="meta">
                        {r.classLevel} • {r.topic} • {fmtDate(r.createdAt.split('T')[0])}
                      </div>
                    </div>
                    <div className="actions" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn icon ghost"
                        onClick={() => toggleFavoriteAiResource(r.id)}
                        title={r.isFavorite ? "Unfavorite" : "Favorite"}
                      >
                        {r.isFavorite ? '⭐' : '☆'}
                      </button>
                      <button
                        className="btn primary sm outline"
                        onClick={() => handleLoadLibraryResource(r)}
                      >
                        Load & Print
                      </button>
                      <button
                        className="btn icon ghost"
                        onClick={() => deleteAiResource(r.id)}
                        style={{ color: 'var(--red-main)' }}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : currentTool === 'saved' ? (
        <div>
          <div className="toolbar">
            <select
              value={docsFilterType}
              onChange={e => setDocsFilterType(e.target.value)}
              aria-label="Filter by Type"
            >
              <option value="">All types</option>
              <option value="plan">Lesson plan</option>
              <option value="exam">Exam paper</option>
              <option value="worksheet">Worksheet</option>
            </select>
            <select
              value={docsFilterStudent}
              onChange={e => setDocsFilterStudent(e.target.value)}
              aria-label="Filter by Student"
            >
              <option value="">All students</option>
              {state.students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={onUploadPaper}>
              Upload question paper
            </button>
            <button className="btn" onClick={onImportDoc}>
              Import Word / text file
            </button>
          </div>
          <div className="card">
            <div className="list">
              {savedDocsList.length === 0 ? (
                <div className="empty">
                  Nothing saved yet. Generate a paper or lesson plan above and save it!
                </div>
              ) : (
                savedDocsList.map(d => (
                  <div key={d.id} className="row">
                    <div className="grow">
                      <div className="title">
                        <a
                          href="#"
                          onClick={e => {
                            e.preventDefault();
                            setViewingDoc(d);
                          }}
                        >
                          {d.title}
                        </a>
                      </div>
                      <div className="meta">
                        {AI_TOOLS[d.type as keyof typeof AI_TOOLS] || d.type} ·{' '}
                        {fmtDate(d.createdAt.slice(0, 10))}
                        {d.studentId ? ` · ${studentName(d.studentId)}` : ''}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Generator forms */
        <div>
          <div className="card">
            <form className="form" onSubmit={handleGenerate}>
              <label className="field">
                Student (optional)
                <select
                  value={studentId}
                  onChange={e => setStudentId(e.target.value)}
                >
                  <option value="">— Any / no student —</option>
                  {state.students.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-row">
                <label className="field">
                  Class / Grade
                  <input
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                    placeholder="e.g. Class 9, HSC 1st year"
                  />
                </label>
                <label className="field">
                  Curriculum / Board
                  <input
                    value={curriculum}
                    onChange={e => setCurriculum(e.target.value)}
                    placeholder="e.g. NCTB, Cambridge"
                  />
                </label>
                <label className="field">
                  Subject *
                  <input
                    required
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Physics"
                  />
                </label>
              </div>

              {currentTool === 'plan' && (
                <>
                  <label className="field">
                    Topic *
                    <input
                      required
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="e.g. Newton's laws of motion"
                    />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      Session duration (min)
                      <input
                        type="number"
                        min="15"
                        step="5"
                        value={duration}
                        onChange={e => setDuration(Number(e.target.value))}
                      />
                    </label>
                    <label className="field">
                      Student level
                      <select value={level} onChange={e => setLevel(e.target.value)}>
                        <option value="weak — needs basics">Weak — needs basics</option>
                        <option value="average">Average</option>
                        <option value="strong — needs challenge">Strong — needs challenge</option>
                      </select>
                    </label>
                    <label className="field">
                      Language
                      <select value={language} onChange={e => setLanguage(e.target.value)}>
                        {LANGS.map(l => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}

              {currentTool === 'exam' && (
                <>
                  <label className="field">
                    Topics to test
                    <textarea
                      rows={4}
                      value={topics}
                      onChange={e => setTopics(e.target.value)}
                      placeholder="One topic per line (or fill automatically from class log)"
                    />
                  </label>
                  <div className="actions" style={{ alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={handleFillTopicsFromLog}
                    >
                      Fill from class log
                    </button>
                  </div>

                  <label className="field">
                    Paper format
                    <select
                      value={examFormat}
                      onChange={e => setExamFormat(e.target.value)}
                    >
                      <option value="custom">Choose question types</option>
                      <option value="board">Board: MCQ + Creative Questions (CQ)</option>
                      <option value="cq">Board: Creative Questions only (সৃজনশীল)</option>
                      <option value="mcq">Board: MCQ only (বহুনির্বাচনি)</option>
                    </select>
                  </label>

                  <div className="form-row">
                    <label className="field">
                      Total marks
                      <input
                        type="number"
                        min="5"
                        value={marks}
                        onChange={e => setMarks(Number(e.target.value))}
                      />
                    </label>
                    <label className="field">
                      Time allowed (minutes)
                      <input
                        type="number"
                        min="10"
                        step="5"
                        value={duration}
                        onChange={e => setDuration(Number(e.target.value))}
                      />
                    </label>
                    <label className="field">
                      Difficulty
                      <select
                        value={difficulty}
                        onChange={e => setDifficulty(e.target.value)}
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="mixed (easy → hard)">Mixed (easy → hard)</option>
                        <option value="exam standard">Exam standard</option>
                      </select>
                    </label>
                    <label className="field">
                      Language
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                      >
                        {LANGS.map(l => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {examFormat === 'custom' && (
                    <div className="field">
                      <span className="muted small" style={{ fontWeight: 500 }}>
                        Question types
                      </span>
                      <div className="checks" style={{ marginTop: '4px' }}>
                        {EXAM_TYPES.map(t => (
                          <label key={t} className="check">
                            <input
                              type="checkbox"
                              checked={selectedTypes.includes(t)}
                              onChange={e => {
                                if (e.target.checked) setSelectedTypes([...selectedTypes, t]);
                                else setSelectedTypes(selectedTypes.filter(x => x !== t));
                              }}
                            />{' '}
                            {t}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <label className="check">
                    <input
                      type="checkbox"
                      checked={includeAnswerKey}
                      onChange={e => setIncludeAnswerKey(e.target.checked)}
                    />{' '}
                    Include answer key (printed separately)
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={checkWithAI}
                      onChange={e => setCheckWithAI(e.target.checked)}
                    />{' '}
                    Verify accuracy with automated second AI check
                  </label>
                </>
              )}

              {currentTool === 'worksheet' && (
                <>
                  <label className="field">
                    Topic *
                    <input
                      required
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="e.g. Trigonometry identities"
                    />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      Number of questions
                      <input
                        type="number"
                        min="3"
                        max="50"
                        value={worksheetCount}
                        onChange={e => setWorksheetCount(Number(e.target.value))}
                      />
                    </label>
                    <label className="field">
                      Difficulty
                      <select
                        value={difficulty}
                        onChange={e => setDifficulty(e.target.value)}
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="mixed (easy → hard)">Mixed (easy → hard)</option>
                      </select>
                    </label>
                    <label className="field">
                      Language
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                      >
                        {LANGS.map(l => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={checkWithAI}
                      onChange={e => setCheckWithAI(e.target.checked)}
                    />{' '}
                    Check answers with secondary AI review
                  </label>
                </>
              )}

              <label className="field">
                Extra instructions (optional)
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. focus on word problems, follow Dhaka board SSC pattern"
                />
              </label>

              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={!!busy}>
                  {busy ? <span className="spinner" /> : `Generate ${AI_TOOLS[currentTool as keyof typeof AI_TOOLS].toLowerCase()}`}
                </button>
              </div>
            </form>
          </div>

          {/* Generated Result display */}
          {result && (
            <div className="card ai-output" style={{ marginTop: '16px' }}>
              {result.error ? (
                <div className="notice err">
                  <b>Could not generate:</b> {result.error}
                </div>
              ) : (
                <>
                  <div className="print-controls" style={{ marginBottom: '16px', padding: '12px', background: 'var(--card2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <label className="field" style={{ flex: 1, minWidth: '100px' }}>
                        Total Marks
                        <input value={printMarks} onChange={e => setPrintMarks(e.target.value)} placeholder="e.g. 50" />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: '100px' }}>
                        Time Allowed
                        <input value={printTime} onChange={e => setPrintTime(e.target.value)} placeholder="e.g. 45 Mins" />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: '100px' }}>
                        Date
                        <input value={printDate} onChange={e => setPrintDate(e.target.value)} placeholder="e.g. 12/04/2024" />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <label className="check">
                        <input type="checkbox" checked={localShowHeader} onChange={e => setLocalShowHeader(e.target.checked)} />
                        Show Branded Header
                      </label>
                      <label className="check">
                        <input type="checkbox" checked={localShowWatermark} onChange={e => setLocalShowWatermark(e.target.checked)} />
                        Show Watermark
                      </label>
                    </div>
                  </div>

                  <div className="card-head">
                    <h2>{result.title}</h2>
                    <div className="actions">
                      {result.savedId ? (
                        <span className="badge green">Saved</span>
                      ) : (
                        <button className="btn sm primary" onClick={handleSaveResult}>
                          Save
                        </button>
                      )}
                      <button
                        className="btn sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(result.content);
                          toast('Copied to clipboard', 'info');
                        }}
                      >
                        Copy
                      </button>
                      <button
                        className="btn sm"
                        onClick={() => handlePrint(result.title, result.content)}
                      >
                        Print
                      </button>
                      {splitAnswerKey(result.content).answers && (
                        <button
                          className="btn sm"
                          onClick={() =>
                            handlePrint(result.title, splitAnswerKey(result.content).paper)
                          }
                        >
                          Print without answers
                        </button>
                      )}
                      {result.tool === 'exam' && (
                        <button
                          className="btn sm"
                          onClick={() => {
                            if (!result.savedId) handleSaveResult();
                            const doc = state.docs.find(d => d.id === result.savedId) || {
                              id: uid(),
                              type: 'exam' as const,
                              title: result.title,
                              content: result.content,
                              studentId: result.studentId,
                              createdAt: new Date().toISOString(),
                            };
                            onStartExam(doc);
                          }}
                        >
                          Start exam
                        </button>
                      )}
                    </div>
                  </div>

                  {result.check && (
                    <div
                      className={`notice ${result.check.ok ? 'green' : 'warn'}`}
                      style={{ marginTop: '10px' }}
                    >
                      <b>
                        {result.check.ok
                          ? 'AI check: no mistakes detected.'
                          : 'AI check found possible items to review:'}
                      </b>
                      {!result.check.ok && (
                        <div
                          className="doc"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(result.check.report),
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* Revision input */}
                  <form className="revise-row" onSubmit={handleRevise}>
                    <input
                      value={revisionInput}
                      onChange={e => setRevisionInput(e.target.value)}
                      placeholder='Refine output e.g. "Replace Q3 with a harder question" or "Translate to Bangla"'
                    />
                    <button type="submit" className="btn sm" disabled={!!busy}>
                      {busy ? 'Working…' : 'Refine'}
                    </button>
                  </form>

                  <div
                    className="doc"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(result.content) }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!hasKey && !isPro && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge blue">Free AI Credits: {quota.remainingToday + quota.adCreditsAvailable} remaining today</span>
          {quota.remainingToday === 0 && quota.canWatchAd && (
             <button className="btn outline small" onClick={() => setRewardModalOpen(true)}>🎁 Watch Ad for 1 Credit</button>
          )}
          {quota.remainingToday === 0 && !quota.canWatchAd && quota.adCreditsAvailable === 0 && (
             <span className="muted small">Daily ad limit reached. Come back tomorrow or upgrade!</span>
          )}
        </div>
      )}

      {/* Modal for viewing a saved document */}
      {viewingDoc && (
        <div id="modal-root">
          <div className="modal-backdrop" onClick={() => setViewingDoc(null)} />
          <div className="modal">
            <div className="modal-head">
              <h2>{viewingDoc.title}</h2>
              <button
                className="icon-btn"
                onClick={() => setViewingDoc(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="muted small" style={{ marginBottom: '10px' }}>
                {viewingDoc.type} · {fmtDate(viewingDoc.createdAt.slice(0, 10))}
                {viewingDoc.studentId ? ` · ${studentName(viewingDoc.studentId)}` : ''}
              </div>

              <div className="print-controls" style={{ marginBottom: '16px', padding: '12px', background: 'var(--card2)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <label className="field" style={{ flex: 1, minWidth: '100px' }}>
                    Total Marks
                    <input value={printMarks} onChange={e => setPrintMarks(e.target.value)} placeholder="e.g. 50" />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: '100px' }}>
                    Time Allowed
                    <input value={printTime} onChange={e => setPrintTime(e.target.value)} placeholder="e.g. 45 Mins" />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: '100px' }}>
                    Date
                    <input value={printDate} onChange={e => setPrintDate(e.target.value)} placeholder="e.g. 12/04/2024" />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <label className="check">
                    <input type="checkbox" checked={localShowHeader} onChange={e => setLocalShowHeader(e.target.checked)} />
                    Show Branded Header
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={localShowWatermark} onChange={e => setLocalShowWatermark(e.target.checked)} />
                    Show Watermark
                  </label>
                </div>
              </div>

              <div className="actions" style={{ marginBottom: '14px' }}>
                {viewingDoc.type === 'exam' && (
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      const doc = viewingDoc;
                      setViewingDoc(null);
                      onStartExam(doc);
                    }}
                  >
                    Start exam
                  </button>
                )}
                <button
                  className="btn sm"
                  onClick={() => handlePrint(viewingDoc.title, viewingDoc.content)}
                >
                  Print
                </button>
                {splitAnswerKey(viewingDoc.content).answers && (
                  <button
                    className="btn sm"
                    onClick={() =>
                      handlePrint(
                        viewingDoc.title,
                        splitAnswerKey(viewingDoc.content).paper
                      )
                    }
                  >
                    Print without answers
                  </button>
                )}
                <button
                  className="btn sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(viewingDoc.content);
                    toast('Copied', 'info');
                  }}
                >
                  Copy
                </button>
                <button
                  className="btn sm danger"
                  onClick={() => {
                    deleteDoc(viewingDoc.id);
                    toast('Document deleted', 'info');
                    setViewingDoc(null);
                  }}
                >
                  Delete
                </button>
              </div>
              <div
                className="doc"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(viewingDoc.content) }}
              />
            </div>
          </div>
        </div>
      )}

      <RewardedAdModal isOpen={rewardModalOpen} onClose={() => setRewardModalOpen(false)} onRewardEarned={handleRewardEarned} />
    </div>
  );
};
