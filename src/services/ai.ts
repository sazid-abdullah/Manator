import { AppState, Exam, Question, MCQQuestion, CQQuestion, WrittenQuestion } from '../types';
import { esc } from '../utils/date';
import { goalPlan, MoneySnapshotResult } from '../store/contracts';

export const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier with a Google account. Best all-round choice, handles Bangla exceptionally well.',
    fallback: 'gemini-2.5-flash',
  },
  groq: {
    name: 'Groq',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier, ultra-fast inference with open models.',
    fallback: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    name: 'OpenRouter',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Many free models (names ending in ":free"). Free model selection changes periodically.',
    fallback: 'openrouter/free',
  },
  ollama: {
    name: 'Ollama (local, offline)',
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    note: 'Runs directly on your computer, no API key or internet required. Ensure OLLAMA_ORIGINS is configured.',
    fallback: '',
  },
};

const MODEL_CACHE_KEY = 'tuitrix_models';

export function readModelCache(): Record<string, any> {
  try {
    const c = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY) || '{}');
    return c && typeof c === 'object' ? c : {};
  } catch (e) {
    return {};
  }
}

function writeModelCache(c: Record<string, any>) {
  try {
    localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(c));
  } catch (e) {
    // ignore
  }
}

export function autoModel(provider: 'gemini' | 'groq' | 'openrouter' | 'ollama', state: AppState): string {
  if (state.ai.models[provider]) return state.ai.models[provider];
  const cache = readModelCache()[provider];
  if (cache && Array.isArray(cache.list) && cache.list.length > 0) {
    const first = cache.list[0];
    return typeof first === 'object' && first !== null && first.id ? first.id : String(first);
  }
  return AI_PROVIDERS[provider]?.fallback || '';
}

export async function fetchModelList(provider: 'gemini' | 'groq' | 'openrouter' | 'ollama', state: AppState): Promise<{ id: string, name: string }[]> {
  const key = (state.ai.keys[provider] || '').trim();
  let models: { id: string, name: string }[] = [];
  if (provider === 'gemini') {
    const url = key ? `https://generativelanguage.googleapis.com/v1beta/models?key=${key}` : 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`);
    const d = await res.json();

    const freeTierModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.0-flash'];

    models = (d.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => ({
        id: String(m.name || '').replace(/^models\//, ''),
        name: String(m.displayName || m.name || '').replace(/^models\//, ''),
      }))
      .filter((m: any) => /^gemini-/.test(m.id) && !/embed|tts|image|live|audio|native|vision|computer-use|robotics|learnlm/.test(m.id))
      .sort((a: any, b: any) => {
        const aIndex = freeTierModels.indexOf(a.id);
        const bIndex = freeTierModels.indexOf(b.id);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.id.localeCompare(b.id);
      });
  } else {
    const urls: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1/models',
      openrouter: 'https://openrouter.ai/api/v1/models',
      ollama: 'http://localhost:11434/v1/models',
    };
    const res = await fetch(urls[provider], {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) throw new Error(`${provider} API error: ${res.statusText}`);
    const data = (await res.json()).data || [];
    models = data
      .map((m: any) => ({ id: String(m.id), name: String(m.name || m.id) }))
      .filter((m: any) => !/whisper|tts|guard|safety|embed|playai|distil|coder/.test(m.id));
  }

  const list = models.length ? models : [{ id: AI_PROVIDERS[provider].fallback, name: AI_PROVIDERS[provider].fallback }];
  const cache = readModelCache();
  cache[provider] = { list, at: Date.now() };
  writeModelCache(cache);
  return list;
}

export async function callAI(
  system: string,
  user: string,
  state: AppState,
  opts: { temperature?: number; maxTokens?: number; json?: boolean; files?: Array<{ mimeType: string; data: string }> } = {}
): Promise<string> {
  const provider = state.ai.provider;
  const key = (state.ai.keys[provider] || '').trim();
  const model = autoModel(provider, state);

  if (provider === 'gemini') {
    if (!key) throw new Error('Google Gemini API key is missing. Add your free key in Settings → AI.');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const files = opts.files || [];
    const contents = [
      {
        role: 'user',
        parts: [
          ...files.map(x => ({ inlineData: { mimeType: x.mimeType, data: x.data } })),
          { text: user },
        ],
      },
    ];

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          temperature: opts.temperature ?? 0.6,
          maxOutputTokens: opts.maxTokens || 8192,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(`Quota exceeded or model unavailable. Try switching to gemini-2.5-flash or gemini-2.5-flash-lite. (${err.error?.message || res.status})`);
      }
      throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
    }
    const data = await res.json();
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
    if (!text) throw new Error('AI returned an empty response.');
    return text;
  }

  // Fallback to OpenAI-compatible chat endpoints for Groq / OpenRouter / Ollama
  const urls: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    ollama: 'http://localhost:11434/v1/chat/completions',
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider === 'openrouter') headers['X-Title'] = 'Tuitrix';

  const res = await fetch(urls[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: opts.temperature ?? 0.6,
      max_tokens: opts.maxTokens || 4096,
      response_format: opts.json ? { type: 'json_object' } : undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `${provider} error: ${res.status}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI returned an empty response.');
  return text;
}

export function cleanDoc(text: string): string {
  const t = String(text || '').trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1].trim() : t;
}

export function splitAnswerKey(md: string) {
  const text = String(md || '');
  const m =
    text.match(/\n\s*-{3,}\s*\n(?=\s*#{1,4}\s*(answer|answers|উত্তর))/i) ||
    text.match(
      /\n(?=[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[ \t]*(?:answer[ \t]*key|answers|answer[ \t]*sheet|solutions|উত্তরমালা|উত্তর)[ \t]*:?[ \t]*(?:\*\*)?[ \t]*:?[ \t]*(?:\n|$))/i
    );
  if (!m) return { paper: text, answers: '' };
  const idx = m.index ?? 0;
  return { paper: text.slice(0, idx), answers: text.slice(idx + m[0].length) };
}

export function renderMarkdown(md: string): string {
  const lines = esc(md || '').replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const inline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flushPara();
      closeList();
      continue;
    }
    if (/^```/.test(t)) {
      flushPara();
      closeList();
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      out.push(`<pre>${code.join('\n')}</pre>`);
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara();
      closeList();
      out.push('<hr>');
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flushPara();
      closeList();
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(t);
      i++;
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        rows.push(cells(lines[++i]));
      }
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head
          .map(c => `<th>${c}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }
    const ul = t.match(/^[-*+]\s+(.*)$/);
    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      if (list !== type) {
        closeList();
        out.push(type === 'ol' ? `<ol start="${ol![1]}">` : '<ul>');
        list = type;
      }
      out.push(`<li>${inline(ul ? ul[1] : ol![2])}</li>`);
      continue;
    }
    if (/^&gt;\s?/.test(t)) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(t.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }
    closeList();
    para.push(t);
  }
  flushPara();
  closeList();
  return out.join('\n');
}

export const AI_SYSTEM = `You are an experienced private tutor, teacher-trainer and board-exam paper setter. You write practical, classroom-ready material for one-to-one or small-group home tuition, mostly for students in Bangladesh (NCTB curriculum, SSC/HSC boards, English version and English medium).
Write in clean Markdown (headings, numbered lists, bold, and pipe tables where useful). No preamble or closing chit-chat: output only the document.
Match the student's class level and the named curriculum/board. Accuracy matters more than length: solve every question yourself before writing its answer, and if you are not sure an answer is correct, replace the question with one you are sure about. Never invent textbook-specific details unless source material is provided.
When writing in Bangla, use correct, natural standard Bangla (প্রমিত বাংলা) in Bangla script throughout, with the subject's usual Bangla textbook terms; keep formulas, units and symbols in standard notation.`;

export function lessonPlanPrompt(f: any): string {
  return `Create a comprehensive lesson plan for one tuition session.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Session length: ${f.duration || 60} minutes
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Student level: ${f.level || 'average'}
- Language: ${f.language || 'English'}
${f.recent ? `- Recently covered with this student: ${f.recent}\n` : ''}${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}

Include these practical sections:
1. **Learning objectives** (3–5, measurable)
2. **Prior knowledge check** (2–3 quick questions, with expected answers)
3. **Timeline** – a table with columns: Time (min) | Activity | What the tutor does | What the student does. Times must add up to ${f.duration || 60} minutes.
4. **Key explanations & worked examples** – the actual step-by-step explanation, key definitions/formulas, and 2–4 fully worked examples from easy to exam level.
5. **Practice questions** (5–8, increasing difficulty, answers at the end of this section)
6. **Common mistakes and misconceptions** – and how to correct each one
7. **If the student struggles / finishes early** – one easier step and one challenge
8. **How this topic comes in exams** – board-style creative question and 3 MCQs with answers
9. **Homework** (short and specific)
10. **Quick check for next session** (3 recap questions)`;
}

export function examMarks(f: any): number {
  const fmt = f.format || 'custom';
  if (fmt === 'custom') return Number(f.marks) || 50;
  return (fmt !== 'mcq' ? (Number(f.cqAnswer) || 0) * 10 : 0) + (fmt !== 'cq' ? Number(f.mcqCount) || 0 : 0);
}

export function examPrompt(f: any): string {
  const marks = examMarks(f);
  const types = (f.types && f.types.length ? f.types : ['Multiple choice', 'Short answer']).join(', ');
  return `Create an exam paper.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topics covered: ${f.topics || 'Standard syllabus'}
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Total marks: ${marks}
- Time allowed: ${f.duration || 60} minutes
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Question types: ${types}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}

Rules:
- Start with a clear header: exam title, subject, class, time, total marks, and lines for student name and date.
- Group questions into sections by type with marks per question e.g. **[2]**.
- Total marks of all questions must sum to exactly ${marks}.
${f.answerKey ? '- After the paper, add a line containing only "---" and then a section titled "## Answer Key" with correct answers and step-by-step marking guidelines.' : '- Do not include answers.'}`;
}

export function worksheetPrompt(f: any): string {
  return `Create a practice worksheet.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Number of questions: ${f.count || 15}
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}
Start with a short "Remember" box of key formulas and rules, then numbered questions grouped from easy to hard. After a line containing only "---", add "## Answers" with solutions.`;
}

export const CHECK_SYSTEM = `You are a strict, experienced exam moderator and board examiner. You check papers that someone else wrote. You report only real problems, and you never rewrite the paper.`;

export function checkPrompt(tool: string, f: any, content: string): string {
  return `Check this ${tool === 'exam' ? 'exam paper' : 'worksheet'} before it is given to a student.
Reply in English. The first line must be exactly "VERDICT: OK" or "VERDICT: PROBLEMS".
If there are problems, provide a numbered list of issues with questions or answers.

<<<PAPER
${content}
PAPER>>>`;
}

export function parseCheck(text: string) {
  const m = String(text || '').match(/VERDICT:\s*(OK|PROBLEMS)/i);
  const report = String(text || '').replace(/^[\s\S]*?VERDICT:\s*(OK|PROBLEMS)\s*/i, '').trim();
  return { ok: !!m && m[1].toUpperCase() === 'OK' && !/\*\*Q\d/.test(report), report: m ? report : String(text || '').trim() };
}

export function revisePrompt(tool: string, f: any, content: string, instruction: string): string {
  return `Below is a ${tool === 'plan' ? 'lesson plan' : tool === 'exam' ? 'exam paper' : 'worksheet'} you wrote. Revise it according to this instruction:
${instruction}

Keep every other question, numbering and answer key in sync. Output only the complete revised document.

<<<DOCUMENT
${content}
DOCUMENT>>>`;
}

export const MONEY_SYSTEM = `You are a practical, friendly personal-finance coach for a self-employed private tutor whose income is tuition fees, which vary month to month.
Use only the figures provided and never invent numbers. Give concrete amounts and timelines in the user's currency.
Reply in clean Markdown with short headings and bullet points, under about 300 words unless asked for more. Reply in the language of the question (Bangla or English).`;

export function moneyPromptData(snap: MoneySnapshotResult, state: AppState): string {
  const L: string[] = [];
  L.push(`Currency: ${state.settings.currency || ''}`, `Today: ${snap.today}`, '', 'Money received from tuition and money spent, by month:');
  for (const x of snap.history) L.push(`- ${x.k}: income ${state.settings.currency}${x.inc}, expenses ${state.settings.currency}${x.exp}`);
  L.push(`- ${snap.current.k} (this month so far): income ${state.settings.currency}${snap.current.inc}, expenses ${state.settings.currency}${snap.current.exp}`);
  L.push(
    '',
    `Typical month: income ${state.settings.currency}${Math.round(snap.avgIncome)}, expenses ${state.settings.currency}${Math.round(snap.avgExpense)}, left over ${state.settings.currency}${Math.round(snap.avgNet)}`
  );
  const cats = Object.entries(snap.expenseByCategory).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    L.push('Typical monthly expenses by category:');
    for (const [k, v] of cats) L.push(`- ${k}: ${state.settings.currency}${Math.round(v)}`);
  }
  L.push('', `Unpaid fees students currently owe me: ${state.settings.currency}${snap.outstanding}`);
  L.push(`Expected tuition fees per month from running contracts: ${state.settings.currency}${Math.round(snap.expected.total)}`);
  L.push(`Active students: ${snap.activeStudents}`);
  if (state.goals.length) {
    L.push('', 'Savings goals:');
    for (const [i, g] of state.goals.entries()) {
      const p = goalPlan(g, snap.avgNet, snap.today);
      L.push(`- Goal ${i + 1} (${g.name}): costs ${state.settings.currency}${g.target}, saved ${state.settings.currency}${g.saved}${g.targetDate ? `, target date ${g.targetDate}` : ''}${p.perMonth ? `, needs ${state.settings.currency}${Math.ceil(p.perMonth)}/month` : ''}`);
    }
  }
  return L.join('\n');
}

export function moneyPrompt(question: string, snap: MoneySnapshotResult, state?: AppState): string {
  return `My tuition money so far:\n\n${state ? moneyPromptData(snap, state) : ''}\n\nMy question: ${question}`;
}

export function normalizeExam(raw: any): Exam {
  const x = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const questions: Question[] = (Array.isArray(x.questions) ? x.questions : [])
    .filter((q: any) => q && typeof q === 'object')
    .map((q: any, i: number) => {
      let id = String(q.id || `q${i + 1}`);
      if (seen.has(id)) id = `${id}_${i}`;
      seen.add(id);
      const n = String(q.n || i + 1);
      if (q.type === 'mcq') {
        const opts = (Array.isArray(q.options) ? q.options : []).map((o: any) => String(o || '').trim()).filter(Boolean);
        return {
          id,
          n,
          type: 'mcq' as const,
          stimulus: q.stimulus ? String(q.stimulus) : '',
          text: String(q.text || ''),
          figure: q.figure ? String(q.figure) : undefined,
          options: opts.length ? opts : ['Option 1', 'Option 2'],
          optionFigures: Array.isArray(q.optionFigures) ? q.optionFigures : undefined,
          answer: typeof q.answer === 'number' ? q.answer : 0,
          guessed: !!q.guessed,
          marks: Number(q.marks) || 1,
        };
      }
      if (q.type === 'cq') {
        const parts = (Array.isArray(q.parts) ? q.parts : [])
          .map((p: any) => ({
            label: String(p.label || ''),
            text: String(p.text || ''),
            marks: Number(p.marks) || 1,
            answer: p.answer ? String(p.answer) : undefined,
          }))
          .filter((p: any) => p.text);
        return {
          id,
          n,
          type: 'cq' as const,
          stimulus: q.stimulus ? String(q.stimulus) : '',
          figure: q.figure ? String(q.figure) : undefined,
          parts: parts.length ? parts : [{ label: 'a', text: 'Answer the question', marks: 5 }],
        };
      }
      return {
        id,
        n,
        type: 'written' as const,
        text: String(q.text || ''),
        figure: q.figure ? String(q.figure) : undefined,
        marks: Number(q.marks) || 1,
        answer: q.answer ? String(q.answer) : undefined,
      };
    });

  return {
    id: x.id || '',
    title: String(x.title || 'Exam'),
    duration: Math.max(1, Number(x.duration) || 60),
    instructions: x.instructions ? String(x.instructions) : '',
    cqChoose: Math.max(0, Number(x.cqChoose) || 0),
    questions,
  };
}

export const EXAM_JSON_SYSTEM = `You convert exam papers into JSON for an on-screen exam app. Output only valid JSON with fields "title", "duration", "instructions", "cqChoose", and "questions".`;

export function examJsonPrompt(content: string): string {
  return `Convert this exam paper into JSON format with this exact structure:
{
  "title": "Exam Title",
  "duration": 60,
  "instructions": "General instructions",
  "cqChoose": 0,
  "questions": [
    { "type": "mcq", "n": "1", "stimulus": "", "text": "Question text", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 0, "marks": 1 },
    { "type": "cq", "n": "2", "stimulus": "Stimulus text", "parts": [ { "label": "a", "text": "Part text", "marks": 2, "answer": "Model answer" } ] },
    { "type": "written", "n": "3", "text": "Short answer question", "marks": 3, "answer": "Model answer" }
  ]
}

<<<PAPER
${content}
PAPER>>>`;
}

export const MARK_SYSTEM = `You are a fair, experienced board examiner marking student written and creative question answers. Output valid JSON with an array "marks" containing { "id": question_id, "part": part_index, "marks": number, "reason": "brief reason" }.`;

export function markPrompt(items: any[]): string {
  return `Mark each student answer below out of its "max" marks. Half-marks (e.g. 1.5, 2.5) are permitted.
${JSON.stringify(items, null, 2)}`;
}
