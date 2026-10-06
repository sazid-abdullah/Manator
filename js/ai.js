// AI helpers: free-tier providers called directly from the browser with the user's own key.
const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier with a Google account. Best all-round choice, handles Bangla well.',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
  },
  groq: {
    name: 'Groq',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier, very fast open models.',
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'],
  },
  openrouter: {
    name: 'OpenRouter',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Many free models (names ending in ":free"). Free model list changes often.',
    models: ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free'],
  },
  ollama: {
    name: 'Ollama (local, offline)',
    needsKey: false,
    keyUrl: 'https://ollama.com/download',
    note: 'Runs on your own computer, no key or internet needed. Start Ollama with OLLAMA_ORIGINS=* so the browser can reach it.',
    models: ['llama3.2', 'qwen2.5', 'gemma3'],
  },
};

function aiModel(provider) {
  provider = provider || db.ai.provider;
  return (db.ai.models && db.ai.models[provider]) || AI_PROVIDERS[provider].models[0];
}

function aiReady() {
  const p = AI_PROVIDERS[db.ai.provider];
  return !!p && (!p.needsKey || !!(db.ai.keys[db.ai.provider] || '').trim());
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  let msg = text;
  try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || text; } catch (e) { /* plain text */ }
  if (res.status === 401 || res.status === 403) msg = 'The API key was rejected. Check it in Settings. ' + msg;
  if (res.status === 429) msg = 'Free-tier limit reached. Wait a minute or switch model/provider in Settings. ' + msg;
  return new Error(`${res.status}: ${String(msg).slice(0, 300)}`);
}

async function callAI(system, user, opts) {
  opts = opts || {};
  const provider = db.ai.provider;
  const model = aiModel(provider);
  const key = (db.ai.keys[provider] || '').trim();
  const temperature = opts.temperature == null ? 0.6 : opts.temperature;
  const maxTokens = opts.maxTokens || 8192;
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw await readError(res);
    const data = await res.json();
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
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
  const res = await fetch(urls[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('The AI returned an empty answer.');
  return text;
}

const AI_SYSTEM = `You are an experienced private tutor and teacher-trainer. You write practical, classroom-ready material for one-to-one or small-group home tuition.
Write in clean Markdown (headings, numbered lists, bold, and pipe tables where useful). No preamble or closing chit-chat: output only the document.
Match the student's grade level and the named curriculum/board. Be accurate; never invent facts. When writing in Bangla, use correct Bangla script throughout.`;

function lessonPlanPrompt(f) {
  return `Create a lesson plan for one tuition session.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Session length: ${f.duration || 60} minutes
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Student level: ${f.level || 'average'}
- Language: ${f.language || 'English'}
${f.recent ? `- Recently covered with this student: ${f.recent}\n` : ''}${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}
Include these sections:
1. **Learning objectives** (3–5, measurable)
2. **Prior knowledge check** (2–3 quick questions)
3. **Timeline** – a table with columns: Time (min) | Activity | What the tutor does | What the student does. Times must add up to ${f.duration || 60} minutes.
4. **Key explanations & worked examples** (with full solutions)
5. **Practice questions** (5–8, increasing difficulty, answers at the end of this section)
6. **Common mistakes to watch for**
7. **Homework** (short and specific)
8. **Quick check for next session** (3 recap questions)`;
}

function examPrompt(f) {
  const types = (f.types && f.types.length ? f.types : ['Multiple choice', 'Short answer']).join(', ');
  return `Create an exam paper.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topics covered: ${f.topics}
- Curriculum/Board: ${f.curriculum || 'not specified'}
- Total marks: ${f.marks || 50}
- Time allowed: ${f.duration || 60} minutes
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Question types: ${types}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}
Rules:
- Start with a header: exam title, subject, class, time, total marks, and a line for student name and date.
- Group questions into sections by type, with clear instructions and marks per question shown like **[2]**.
- The marks of all questions MUST add up to exactly ${f.marks || 50}. Show a section-wise marks summary.
- Only test the listed topics, at the stated grade level.
${f.answerKey ? '- After the paper, add a line containing only "---" and then a section titled "## Answer Key" with correct answers, brief working, and a marking guide.' : '- Do not include answers.'}`;
}

function worksheetPrompt(f) {
  return `Create a practice worksheet.

- Grade/Class: ${f.grade || 'not specified'}
- Subject: ${f.subject}
- Topic: ${f.topic}
- Number of questions: ${f.count || 15}
- Difficulty: ${f.difficulty || 'mixed (easy → hard)'}
- Language: ${f.language || 'English'}
${f.notes ? `- Tutor's notes: ${f.notes}\n` : ''}
Start with a short "Remember" box of key formulas/rules, then numbered questions grouped from easy to hard. After a line containing only "---", add "## Answers" with brief solutions.`;
}

// Minimal Markdown → HTML. Input is escaped first, so AI output cannot inject markup.
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
  const m = String(md || '').match(/\n\s*-{3,}\s*\n(?=\s*#{1,4}\s*(answer|answers|উত্তর))/i);
  if (!m) return { paper: md, answers: '' };
  return { paper: md.slice(0, m.index), answers: md.slice(m.index + m[0].length) };
}
