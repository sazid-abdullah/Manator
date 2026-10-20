// AI helpers: free-tier providers called directly from the browser with the user's own key.
const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier with a Google account. Best all-round choice, handles Bangla well.',
    fallback: 'gemini-flash-latest',
  },
  groq: {
    name: 'Groq',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier, very fast open models.',
    fallback: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    name: 'OpenRouter',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Many free models (names ending in ":free"). Free model list changes often.',
    fallback: 'openrouter/free',
  },
  ollama: {
    name: 'Ollama (local, offline)',
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    note: 'Runs on your own computer, no key or internet needed. Start Ollama with OLLAMA_ORIGINS={origin} so this app (and only this app) can reach it. Avoid OLLAMA_ORIGINS=*, which lets any website use it.',
    fallback: '',
  },
};
if (!(db.ai.provider in AI_PROVIDERS)) db.ai.provider = 'gemini';

// Old versions saved their built-in default model name even when the user never picked one.
// Those names get retired, so treat them as "Auto".
const OLD_DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'llama-3.3-70b-versatile', 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant', 'deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free', 'llama3.2', 'qwen2.5', 'gemma3'];
for (const [p, m] of Object.entries(db.ai.models)) if (OLD_DEFAULT_MODELS.includes(m)) db.ai.models[p] = '';

// ── Model discovery ──────────────────────────────────────────
// Free models are renamed and retired often, so the list comes from the provider (with the
// user's key) and is cached per browser. "Auto" (empty choice) uses the best-ranked model and
// moves to the next one when a model is retired (404) or out of free quota (429).
const MODEL_CACHE_KEY = 'manator_models';
const MODEL_CACHE_MS = 24 * 3600e3;
let aiLastModel = '';

function readModelCache() {
  try { const c = JSON.parse(localStorage.getItem(MODEL_CACHE_KEY)); return c && typeof c === 'object' ? c : {}; } catch (e) { return {}; }
}
function writeModelCache(c) { try { localStorage.setItem(MODEL_CACHE_KEY, JSON.stringify(c)); } catch (e) { /* cache only */ } }
function cachedModels(provider) {
  const c = readModelCache()[provider];
  return c && Array.isArray(c.list) ? c : null;
}

function modelScore(provider, id) {
  const s = id.toLowerCase();
  const unstable = /preview|exp|beta/.test(s) ? 0 : 1;
  const ver = Number((s.match(/(\d+(?:\.\d+)?)/) || [])[1]) || 0;
  const size = Math.max(0, ...[...s.matchAll(/(\d+(?:\.\d+)?)b\b/g)].map(m => Number(m[1])), /kimi-k2|deepseek/.test(s) ? 600 : 0);
  const small = /lite|nano|mini|small|tiny|lightning|-xs|instant|\bflash-8b/.test(s) ? 0 : 1;
  if (provider === 'gemini') {
    const tier = /lite|nano|8b/.test(s) ? 1 : /pro/.test(s) ? 3 : /flash/.test(s) ? 2 : 0;
    return [tier, unstable, ver];
  }
  return [s === 'openrouter/free' ? 0 : 1, small, unstable, size];
}
function rankModels(provider, ids) {
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]; return 0; };
  return [...new Set(ids)].sort((x, y) => cmp(modelScore(provider, x), modelScore(provider, y)) || x.localeCompare(y));
}

async function fetchModelList(provider) {
  provider = provider || db.ai.provider;
  const key = (db.ai.keys[provider] || '').trim();
  let ids;
  if (provider === 'gemini') {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw await readError(res);
    const d = await res.json();
    ids = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(id => /^gemini-/.test(id) && !/embed|tts|image|live|audio|native|vision|computer-use|robotics|learnlm/.test(id));
  } else {
    const urls = { groq: 'https://api.groq.com/openai/v1/models', openrouter: 'https://openrouter.ai/api/v1/models', ollama: 'http://localhost:11434/v1/models' };
    const res = await fetch(urls[provider], { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    if (!res.ok) throw await readError(res);
    let data = (await res.json()).data || [];
    if (provider === 'openrouter') {
      data = data.filter(m => {
        const pr = m.pricing || {};
        const out = (m.architecture && m.architecture.output_modalities) || ['text'];
        return (String(m.id).endsWith(':free') || (Number(pr.prompt) === 0 && Number(pr.completion) === 0)) && out.length === 1 && out[0] === 'text';
      });
    }
    if (provider === 'groq') data = data.filter(m => m.active !== false);
    ids = data.map(m => String(m.id)).filter(id => !/whisper|tts|guard|safety|embed|playai|orpheus|distil|coder|-code\b|code:/.test(id));
  }
  const list = rankModels(provider, ids);
  if (!list.length) throw new Error('No usable text models were found for this provider. Press \"Refresh list\" again later, or choose another provider.');
  const cache = readModelCache();
  const now = Date.now();
  const blocked = Object.fromEntries(Object.entries((cache[provider] && cache[provider].blocked) || {}).filter(([, until]) => until > now));
  cache[provider] = { list, at: now, blocked };
  writeModelCache(cache);
  return list;
}

function blockModel(provider, model, ms) {
  const cache = readModelCache();
  if (!cache[provider]) cache[provider] = { list: [], at: 0, blocked: {} };
  cache[provider].blocked = { ...(cache[provider].blocked || {}), [model]: Date.now() + ms };
  writeModelCache(cache);
}

function chosenModel(provider) { return String((db.ai.models && db.ai.models[provider]) || '').trim(); }

function autoModels(provider) {
  const c = cachedModels(provider);
  const list = c ? c.list : [];
  const blocked = (c && c.blocked) || {};
  const now = Date.now();
  const ok = list.filter(id => !(blocked[id] > now));
  const fb = AI_PROVIDERS[provider].fallback;
  return ok.length ? ok : fb && !(blocked[fb] > now) ? [fb] : [];
}

function aiModel(provider) {
  provider = provider || db.ai.provider;
  return chosenModel(provider) || autoModels(provider)[0] || '';
}

function isModelGone(err) {
  return err.status === 404 || (err.status === 400 && /model/i.test(err.message) && /not found|decommission|no longer|deprecat|not supported|does not exist|invalid model/i.test(err.message));
}

function aiReady() {
  if (account.server) return !!account.user && !!account.config.ai.ready;
  const p = AI_PROVIDERS[db.ai.provider];
  return !!p && (!p.needsKey || !!(db.ai.keys[db.ai.provider] || '').trim());
}

function tooLongError() {
  return new Error('The AI ran out of room before finishing its answer. For a long paper, use Google Gemini, or upload it in parts (for example MCQ and CQ separately).');
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  let msg = text;
  try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || text; } catch (e) { /* plain text */ }
  if (res.status === 401 || res.status === 403) msg = 'The API key was rejected. Check it in Settings. ' + msg;
  if (res.status === 413 || /request too large|tokens per minute|context length|maximum context/i.test(msg)) msg = 'This is too long for this model\'s free limit. Use Google Gemini, or send a shorter paper. ' + msg;
  else if (res.status === 429) msg = 'Free-tier limit reached. Wait a minute or switch model/provider in Settings. ' + msg;
  const err = new Error(`${res.status}: ${String(msg).slice(0, 300)}`);
  err.status = res.status;
  err.detail = String(text);
  return err;
}

async function callAI(system, user, opts) {
  if (account.server) return serverAI(system, user, opts);
  const provider = db.ai.provider;
  const c = cachedModels(provider);
  if (!c || Date.now() - c.at > MODEL_CACHE_MS) await fetchModelList(provider).catch(() => {});
  let refreshed = false, fails = 0;
  const tried = [];
  for (;;) {
    const model = aiModel(provider);
    if (!model) throw new Error('No AI model is available. Open Settings → AI and press "Refresh list".');
    try {
      const text = await callModel(provider, model, system, user, opts);
      aiLastModel = model;
      return text;
    } catch (err) {
      const gone = isModelGone(err);
      const explicit = chosenModel(provider) === model;
      // A 429 with "limit: 0" means the model isn't in this key's free tier at all.
      const noFreeTier = err.status === 429 && /limit:\s*0\b|"quotaValue":\s*"0"/.test(err.detail || err.message);
      if (!(gone || err.status === 429) || (explicit && !gone) || fails >= 4 || tried.length >= 25) {
        if (explicit && noFreeTier) err.message = `${model} isn't free on your key. Choose "Auto" in Settings → AI. ` + err.message;
        throw err;
      }
      tried.push(model);
      if (!noFreeTier) fails++;
      blockModel(provider, model, gone ? 30 * 86400e3 : noFreeTier ? 7 * 86400e3 : 3600e3);
      if (gone && !refreshed) { refreshed = true; await fetchModelList(provider).catch(() => {}); blockModel(provider, model, 30 * 86400e3); }
      if (explicit) { db.ai.models[provider] = ''; save(); }
      const next = aiModel(provider);
      if (!next || tried.includes(next)) throw err;
      if (typeof toast === 'function') toast(`${model} ${gone ? 'is no longer available' : noFreeTier ? 'is not free on your key' : 'hit its free limit'}, using ${next} instead.`);
    }
  }
}

async function callModel(provider, model, system, user, opts) {
  opts = opts || {};
  const key = (db.ai.keys[provider] || '').trim();
  const temperature = opts.temperature == null ? 0.6 : opts.temperature;
  // Newer Gemini models "think" before answering and that counts against the output limit.
  const geminiMax = /gemini-(1\.|2\.0)/.test(model) ? 8192 : 32768;
  const maxTokens = provider === 'gemini' ? Math.max(opts.maxTokens || 0, geminiMax) : opts.maxTokens || 8192;
  const files = opts.files || [];
  if (files.length && provider !== 'gemini') throw new Error('Only Google Gemini can read attached PDFs and photos.');
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [...files.map(x => ({ inlineData: { mimeType: x.mimeType, data: x.data } })), { text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens, ...(opts.json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    const cand = data.candidates && data.candidates[0];
    if (cand && cand.finishReason === 'MAX_TOKENS') throw tooLongError();
    const text = (cand && cand.content && cand.content.parts || [])
      .map(p => p.text || '').join('');
    if (!text) throw new Error('The AI returned an empty answer' + (data.promptFeedback ? ` (${JSON.stringify(data.promptFeedback)})` : '.'));
    return text;
  }

  const urls = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    ollama: 'http://localhost:11434/v1/chat/completions',
  };
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider === 'openrouter') headers['X-Title'] = 'Manator';
  const body = { model, messages, temperature, max_tokens: maxTokens, stream: false };
  if (opts.json) {
    if (provider === 'ollama') body.format = 'json';
    else body.response_format = { type: 'json_object' };
  }
  const res = await fetch(urls[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (choice && choice.finish_reason === 'length') throw tooLongError();
  const text = choice && choice.message && choice.message.content;
  if (!text) throw new Error('The AI returned an empty answer.');
  return text;
}

const AI_SYSTEM = `You are an experienced private tutor, teacher-trainer and board-exam paper setter. You write practical, classroom-ready material for one-to-one or small-group home tuition, mostly for students in Bangladesh (NCTB curriculum, SSC/HSC boards, English version and English medium).
Write in clean Markdown (headings, numbered lists, bold, and pipe tables where useful). No preamble or closing chit-chat: output only the document.
Match the student's class level and the named curriculum/board. Accuracy matters more than length: solve every question yourself before writing its answer, and if you are not sure an answer is correct, replace the question with one you are sure about. Never invent textbook-specific details (page numbers, exercise numbers, named examples from a book) unless source material is provided.
When writing in Bangla, use correct, natural standard Bangla (প্রমিত বাংলা) in Bangla script throughout, with the subject's usual Bangla textbook terms; keep formulas, units and symbols in standard notation.`;

function cqStyle(f) {
  if (f.cqStyle === '3part' || f.cqStyle === '4part') return f.cqStyle;
  return /math|গণিত/i.test(f.subject || '') ? '3part' : '4part';
}

function examMarks(f) {
  const fmt = f.format || 'custom';
  if (fmt === 'custom') return Number(f.marks) || 50;
  return (fmt !== 'mcq' ? (Number(f.cqAnswer) || 0) * 10 : 0) + (fmt !== 'cq' ? (Number(f.mcqCount) || 0) : 0);
}

function boardRules(f) {
  const fmt = f.format || 'custom';
  if (fmt === 'custom') return '';
  const bn = /bangla/i.test(f.language || '');
  const opt = bn ? '(ক) (খ) (গ) (ঘ)' : '(a) (b) (c) (d)';
  const part = bn ? ['ক', 'খ', 'গ', 'ঘ'] : ['a', 'b', 'c', 'd'];
  const out = [];
  if (fmt !== 'mcq') {
    const n = Number(f.cqCount) || 8, a = Math.min(Number(f.cqAnswer) || n, n);
    out.push(`**Creative questions (সৃজনশীল প্রশ্ন), Bangladesh SSC/HSC board pattern:**
- Write exactly ${n} creative questions; the instruction says the student answers any ${a}. Each is worth 10 marks.
- Each starts with an original stimulus (উদ্দীপক): a new, short (3–6 sentence) situation, passage, experiment, data table or diagram description linked to the topic. Do not copy it from the textbook and do not give away the answers in it.
${cqStyle(f) === '3part'
    ? `- Then three parts, increasing in difficulty, all based on the stimulus: ${part[0]}. [2], ${part[1]}. [4], ${part[2]}. [4] (mathematics pattern).`
    : `- Then four parts: ${part[0]}. knowledge (জ্ঞানমূলক) [1] – recall a definition, fact or term; ${part[1]}. comprehension (অনুধাবনমূলক) [2] – explain why/how; ${part[2]}. application (প্রয়োগমূলক) [3] – apply the concept to the stimulus; ${part[3]}. higher ability (উচ্চতর দক্ষতা) [4] – analyse, compare or evaluate using the stimulus.
- ${part[2]} and ${part[3]} must not be answerable without the stimulus; ${part[0]} and ${part[1]} test core concepts of the same topic.`}
- Every creative question covers a different concept or sub-topic; no two stimuli are alike.`);
  }
  if (fmt !== 'cq') {
    const m = Number(f.mcqCount) || 25;
    out.push(`**Multiple choice (বহুনির্বাচনি), board pattern:** exactly ${m} questions, 1 mark each.
- Four options ${opt}, exactly one correct. Wrong options must be plausible (typical student mistakes) and similar in length. No "all of the above" / "none of the above".
- Mix the board types: about 60% simple (সাধারণ বহুনির্বাচনি); about 25% multiple-completion (বহুপদী সমাপ্তিসূচক): three statements i, ii, iii followed by options "i ও ii", "i ও iii", "ii ও iii", "i, ii ও iii" (in English: "i and ii", …); about 15% situation-based sets (অভিন্ন তথ্যভিত্তিক): a short shared passage or figure followed by 2–3 questions.
- Spread the correct option letters roughly evenly.
- Format each MCQ as a numbered line with the question, then each option on its own line starting with its label, e.g.
  1. Question text
     ${opt.split(' ')[0]} first option`);
  }
  out.push(`**Answer key layout:** ${fmt !== 'cq' ? 'MCQ answers as a table: No. | Answer | One-line reason. ' : ''}${fmt !== 'mcq' ? 'For each creative question give a model answer for every part, with the marking points that earn each mark.' : ''}`);
  return out.join('\n\n');
}

// src = { fileNames: [...], texts: [{ name, text }], mode: 'style' | 'only' }
function sourcePrompt(src) {
  if (!src || (!src.fileNames.length && !src.texts.length)) return '';
  const what = src.mode === 'only'
    ? `It is the textbook chapter / notes to teach from. Use only the facts, definitions, examples, terms and methods in it. If something you need is not in it, leave it out instead of guessing.`
    : `It is a past paper or sample paper. First study its format, question types, mark split, topic coverage, difficulty and wording. Then write NEW questions in the same style and at the same level. Do not copy its questions; changing only names or numbers is not enough – change the situation or the angle.`;
  const files = src.fileNames.length ? `\nAttached file(s): ${src.fileNames.join(', ')}.` : '';
  const texts = src.texts.map(t => `\n<<<SOURCE: ${t.name}\n${t.text}\nSOURCE>>>`).join('\n');
  return `\n## Source material from the tutor\n${what}${files}${texts}\n`;
}

function lessonPlanPrompt(f, src) {
  return `Create a lesson plan for one tuition session.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Session length: ${f.duration || 60} minutes
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Student level: ${f.level || 'average'}
- Language: ${f.language || 'English'}
${f.recent ? `- Recently covered with this student: ${f.recent}\n` : ''}${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}${sourcePrompt(src)}
Teach it the way a strong home tutor does: start from what the student already knows, explain with simple everyday examples (from life in Bangladesh where they help), then build up to exam level. Pitch everything at the stated class and student level.

Include these sections:
1. **Learning objectives** (3–5, measurable)
2. **Prior knowledge check** (2–3 quick questions, with expected answers)
3. **Timeline** – a table with columns: Time (min) | Activity | What the tutor does | What the student does. Times must add up to ${f.duration || 60} minutes.
4. **Key explanations & worked examples** – the actual explanation the tutor will give (not just headings), key definitions/formulas, and 2–4 fully worked examples from easy to exam level.
5. **Practice questions** (5–8, increasing difficulty, answers at the end of this section)
6. **Common mistakes and misconceptions** – and how to correct each one
7. **If the student struggles / finishes early** – one easier step and one challenge
8. **How this topic comes in exams** – for SSC/HSC/NCTB-type curricula: one creative question (stimulus with parts) and three board-style MCQs with answers; for other curricula, typical exam questions with answers
9. **Homework** (short and specific)
10. **Quick check for next session** (3 recap questions)`;
}

function examPrompt(f, src) {
  const fmt = f.format || 'custom';
  const marks = examMarks(f);
  const types = fmt === 'custom' ? (f.types && f.types.length ? f.types : ['Multiple choice', 'Short answer']).join(', ')
    : { cq: 'Creative questions (CQ)', mcq: 'Multiple choice (MCQ)', board: 'MCQ section and creative question (CQ) section' }[fmt];
  return `Create an exam paper.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topics covered: ${f.topics || (src && (src.fileNames.length || src.texts.length) ? 'the same topics as the source material' : 'not specified')}
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Total marks: ${marks}
- Time allowed: ${f.duration || 60} minutes
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Question types: ${types}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}${sourcePrompt(src)}
${boardRules(f)}

Rules:
- Start with a header: exam title, subject, class, time, total marks, and a line for student name and date.
- Group questions into sections by type, with clear instructions and marks per question shown like **[2]**.
- The marks of all questions the student must answer MUST add up to exactly ${marks}. Show a section-wise marks summary.
- Only test the listed topics, at the stated class level. No two questions test the same thing.
${f.answerKey ? '- After the paper, add a line containing only "---" and then a section titled "## Answer Key" with correct answers, brief working, and a marking guide. Check every answer before writing it.' : '- Do not include answers.'}`;
}

function worksheetPrompt(f, src) {
  return `Create a practice worksheet.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Number of questions: ${f.count || 15}
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}${sourcePrompt(src)}
Start with a short "Remember" box of key formulas/rules, then numbered questions grouped from easy to hard, covering different sub-skills of the topic (no near-duplicates). After a line containing only "---", add "## Answers" with brief solutions. Check every answer before writing it.`;
}

const CHECK_SYSTEM = `You are a strict, experienced exam moderator and board examiner. You check papers that someone else wrote. You are careful and honest: you report only real problems, and you never rewrite the paper.`;

function checkPrompt(tool, f, content, src) {
  const req = tool === 'exam'
    ? `Requirements it must meet: class ${f.grade || 'not specified'}, subject ${f.subject}, total marks ${examMarks(f)}, language ${f.language || 'English'}.\n${boardRules(f)}`
    : `Requirements: class ${f.grade || 'not specified'}, subject ${f.subject}, ${f.count || 15} questions, language ${f.language || 'English'}.`;
  return `Check this ${tool === 'exam' ? 'exam paper' : 'worksheet'} before it is given to a student.

${req}
${sourcePrompt(src)}
Do this:
1. Solve every question yourself, independently, then compare with the answer key.
2. Look for: wrong answers in the key; questions that are wrong, ambiguous or unanswerable; MCQs with no correct option or more than one; creative-question parts that don't match their level or marks or don't use the stimulus; marks that don't add up to the total; the wrong number of questions; duplicate questions; content off the topic or wrong for the class level; factual errors${src && (src.fileNames.length || src.texts.length) ? ' or facts not supported by the source material' : ''}; poor language, spelling or Bangla grammar.

Reply in English. The first line must be exactly "VERDICT: OK" or "VERDICT: PROBLEMS".
If there are problems, then give a numbered list. Each item: **Q<number>** – what is wrong – how to fix it (including the correct answer). Nothing else.

<<<PAPER
${content}
PAPER>>>`;
}

function parseCheck(text) {
  const m = String(text || '').match(/VERDICT:\s*(OK|PROBLEMS)/i);
  const report = String(text || '').replace(/^[\s\S]*?VERDICT:\s*(OK|PROBLEMS)\s*/i, '').trim();
  return { ok: !!m && m[1].toUpperCase() === 'OK' && !/\*\*Q\d/.test(report), report: m ? report : String(text || '').trim() };
}

function revisePrompt(tool, f, content, instruction, src) {
  return `Below is a ${tool === 'plan' ? 'lesson plan' : tool === 'exam' ? 'exam paper' : 'worksheet'} you wrote. Revise it.

Instruction from the tutor:
${instruction}

Rules:
- Change only what the instruction needs. Keep every other question, its numbering and its wording exactly the same.
- Keep the answer key in step with any question you change.${tool === 'exam' ? ` Keep the total marks at ${examMarks(f)}.` : ''}
${tool === 'exam' ? boardRules(f) : ''}
${sourcePrompt(src)}
Output the complete revised document (including any answer key) and nothing else.

<<<DOCUMENT
${content}
DOCUMENT>>>`;
}

// Strips a ```markdown fence some models wrap the whole document in.
function cleanDoc(text) {
  const t = String(text || '').trim();
  const m = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1].trim() : t;
}

// Minimal Markdown → HTML. Input is escaped first, so AI output cannot inject markup.
// ── Exam mode: paper → structured exam, and written-answer marking ──
const EXAM_JSON_SYSTEM = `You convert exam papers into JSON for an on-screen exam app. Output only valid JSON: no Markdown fences, no comments, no text before or after.`;

function examJsonPrompt(content) {
  return `Convert ${content == null ? 'the attached exam paper (PDF or photo)' : 'this exam paper'} into JSON with exactly this shape:
{"title": "short title", "duration": minutes printed on the paper (0 if none), "instructions": "general instructions printed on the paper, or empty", "cqChoose": how many creative questions the student must answer (0 if all),
 "questions": [
  {"type": "mcq", "n": "1", "stimulus": "", "text": "the question", "options": ["…", "…", "…", "…"], "answer": 0, "marks": 1},
  {"type": "cq", "n": "1", "stimulus": "the stimulus / passage / data (উদ্দীপক)", "parts": [{"label": "ক", "text": "the part", "marks": 1, "answer": "model answer"}]},
  {"type": "written", "n": "1", "text": "the question", "marks": 2, "answer": "model answer"}
 ]}
Rules:
- Keep every question in the paper, in the same order and language, with its wording, numbers and symbols unchanged. Do not add, drop or merge questions.
- "answer" for an MCQ is the 0-based index of the correct option (0 = first option).
- MCQ options: the option text only, without labels like (ক), (a) or A. For multiple-completion MCQs, put the i/ii/iii statements in "text" (with line breaks) and the combinations as the options.
- MCQs that share a stimulus or passage: copy it into "stimulus" of each of those questions.
- Short-answer, broad, fill-in-the-blank, true/false, matching and numerical questions are "written".
- Take answers and model answers from the paper's answer key. If there is no key, or it misses a question, work out the correct answer yourself and add "guessed": true to that question.
- Marks as printed. If not printed: MCQ 1, others your best estimate.
- Keep model answers short: the key points or final result only, at most 2–3 sentences, so the whole paper fits in one reply.
- Keep Markdown (tables, bold, line breaks as \\n) inside strings.${content != null && /\*\[(Picture|চিত্র)/.test(content) ? `
- Keep picture markers like *[Picture 2]* exactly as written, where they appear: in the question text, the stimulus, a part, or as an option's text.` : ''}${content == null ? `
- Pictures: if a question or its stimulus has a picture (diagram, graph, circuit, logic gate, map, geometry figure, chart, apparatus, photo), add "figure": {"page": page number starting at 1 (1 for a photo), "box": [ymin, xmin, ymax, xmax]} to that question. "box" is the picture's bounding box on that page, each value from 0 to 1000 relative to the page height and width. Box the whole picture with its labels, but not the question text or options. Questions that share one picture all get the same figure. Don't describe the picture in the text.
- If an MCQ's options are pictures, add "optionFigures": one figure object per option, in option order (null for an option without a picture), and give such options the text "".` : `

<<<PAPER
${content}
PAPER>>>`}`;
}

const MARK_SYSTEM = `You are a fair, experienced board examiner marking a student's written answers. Mark the way a board examiner would: give credit for correct ideas even when the wording is different from the model answer, give partial marks for partly correct work, and follow level-wise marking for creative questions. Output only valid JSON.`;

function markPrompt(items) {
  return `Mark each student answer below out of its "max" marks. Marks can be in steps of 0.5.
Reply with JSON: {"marks": [{"id": "question id", "part": part number, "marks": number, "reason": "one short sentence in English"}]}

${JSON.stringify(items, null, 1)}`;
}

// Models often leave LaTeX backslashes (\frac), raw line breaks or trailing commas in JSON strings.
function repairJSON(t) {
  let out = '', inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (!inStr) { out += c; if (c === '"') inStr = true; continue; }
    if (c === '\\') {
      const n = t[i + 1];
      const cmd = (t.slice(i + 1).match(/^[a-z]+/i) || [''])[0];
      const latex = 'bfr'.includes(n) ? cmd.length > 1 : 'nt'.includes(n) && /^(neq|nabla|nu|ne|not|ni|times|theta|tan|tanh|tau|text|textbf|to|tfrac|top|triangle|therefore)$/.test(cmd);
      if (n && '"\\/bfnrt'.includes(n) && !latex) { out += c + n; i++; }
      else if (n === 'u' && /^[0-9a-f]{4}$/i.test(t.slice(i + 2, i + 6))) { out += t.slice(i, i + 6); i += 5; }
      else out += '\\\\';
      continue;
    }
    if (c === '"') inStr = false;
    out += c === '\n' ? '\\n' : c === '\r' ? '' : c === '\t' ? '\\t' : c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// One automatic retry, since a malformed JSON reply is usually a one-off.
async function callAIJSON(system, user, opts) {
  for (let i = 0; ; i++) {
    const reply = await callAI(system, user, i ? { ...opts, temperature: 0, retryOf: aiLastRequest } : opts);
    try { return parseJSONReply(reply); } catch (err) {
      console.warn('Unreadable AI reply from', aiLastModel, String(reply).slice(0, 2000));
      if (i) { err.message = `The AI's reply (${aiLastModel}) wasn't in the expected format, even on a second try. Press Try again, or choose another model in Settings → AI.`; throw err; }
    }
  }
}

function parseJSONReply(text) {
  const t = String(text || '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  try {
    if (a < 0 || b < a) throw new Error();
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return JSON.parse(repairJSON(t.slice(a, b + 1))); }
  } catch (e) {
    const bad = new Error("The AI's reply wasn't in the expected format. Please try again.");
    bad.badFormat = true;
    throw bad;
  }
}

function renderMarkdown(md) {
  const lines = esc(md || '').replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const inline = s => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flushPara(); closeList(); continue; }
    if (/^```/.test(t)) {
      flushPara(); closeList();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      out.push(`<pre>${code.join('\n')}</pre>`);
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushPara(); closeList(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); out.push('<hr>'); continue; }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flushPara(); closeList();
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(t);
      i++;
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) rows.push(cells(lines[++i]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const ul = t.match(/^[-*+]\s+(.*)$/);
    const ol = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const type = ul ? 'ul' : 'ol';
      if (list !== type) { closeList(); out.push(type === 'ol' ? `<ol start="${ol[1]}">` : '<ul>'); list = type; }
      out.push(`<li>${inline(ul ? ul[1] : ol[2])}</li>`);
      continue;
    }
    if (/^&gt;\s?/.test(t)) { flushPara(); closeList(); out.push(`<blockquote>${inline(t.replace(/^&gt;\s?/, ''))}</blockquote>`); continue; }
    closeList();
    para.push(t);
  }
  flushPara(); closeList();
  return out.join('\n');
}

// Splits "paper --- ## Answer Key" so the paper can be printed without answers.
function splitAnswerKey(md) {
  md = String(md || '');
  const m = md.match(/\n\s*-{3,}\s*\n(?=\s*#{1,4}\s*(answer|answers|উত্তর))/i)
    || md.match(/\n(?=[ \t]*(?:#{1,4}[ \t]*)?(?:\*\*)?[ \t]*(?:answer[ \t]*key|answers|answer[ \t]*sheet|solutions|উত্তরমালা|উত্তর)[ \t]*:?[ \t]*(?:\*\*)?[ \t]*:?[ \t]*(?:\n|$))/i);
  if (!m) return { paper: md, answers: '' };
  return { paper: md.slice(0, m.index), answers: md.slice(m.index + m[0].length) };
}

// ── Money advisor ────────────────────────────────────────────
const MONEY_SYSTEM = `You are a practical, friendly personal-finance coach for a self-employed private tutor whose income is tuition fees, which vary month to month.
Use only the figures provided and never invent numbers. If the data is thin (few months recorded), say so. Give concrete amounts and timelines in the user's currency.
Prefer realistic advice: an emergency fund first, putting a fixed amount aside on fee days, cutting the biggest expense categories, collecting overdue fees, adding a student or batch.
Don't recommend specific investment products, loans or crypto; for big decisions suggest talking it over with someone they trust.
Reply in clean Markdown with short headings and bullet points, under about 300 words unless asked for more. Reply in the language of the question (Bangla or English). No preamble.`;

function moneyPromptData(snap) {
  const L = [];
  L.push(`Currency: ${db.settings.currency || ''}`, `Today: ${snap.today}`, '', 'Money received from tuition and money spent, by month:');
  for (const x of snap.history) L.push(`- ${x.k}: income ${money(x.inc)}, expenses ${money(x.exp)}`);
  L.push(`- ${snap.current.k} (this month so far): income ${money(snap.current.inc)}, expenses ${money(snap.current.exp)}`);
  L.push('', `Typical month (${snap.basisPartial ? 'only this month so far' : 'average of ' + snap.basisMonths.join(', ')}): income ${money(Math.round(snap.avgIncome))}, expenses ${money(Math.round(snap.avgExpense))}, left over ${money(Math.round(snap.avgNet))}`);
  const cats = Object.entries(snap.expenseByCategory).sort((a, b) => b[1] - a[1]);
  if (cats.length) {
    L.push('Typical monthly expenses by category:');
    for (const [k, v] of cats) L.push(`- ${k}: ${money(Math.round(v))}`);
  }
  L.push('', `Unpaid fees students currently owe me: ${money(snap.outstanding)}`);
  L.push(`Expected tuition fees per month from ${snap.expected.count} running contract(s), estimated: ${money(Math.round(snap.expected.total))}`);
  L.push(`Active students: ${snap.activeStudents}`);
  if (db.goals.length) {
    // Goal names are free text (could mention a person), so they're replaced by numbers.
    L.push('', 'Savings goals:');
    for (const [i, g] of db.goals.entries()) {
      const p = goalPlan(g, snap.avgNet, snap.today);
      L.push(`- Goal ${i + 1}: costs ${money(g.target)}, saved ${money(g.saved)}${g.targetDate ? `, want it by ${g.targetDate}` : ', no deadline'}${p.perMonth ? `, needs ${money(Math.ceil(p.perMonth))}/month` : ''}`);
    }
  }
  return L.join('\n');
}

function moneyPrompt(question, snap) {
  return `My tuition money so far:\n\n${moneyPromptData(snap)}\n\nMy question: ${question}`;
}
