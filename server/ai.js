// Calls the AI providers with the server's own keys. Free models are renamed and retired often,
// so models come from each provider's list endpoint, ranked, and skipped when they fail.
const BASE = {
  gemini: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  groq: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai',
  openrouter: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api',
};
const NAMES = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter' };
const FALLBACK = { gemini: 'gemini-flash-latest', groq: 'llama-3.3-70b-versatile', openrouter: 'openrouter/free' };
const LIST_MS = 24 * 3600e3;
const cache = {}; // provider -> { key, list, at, blocked: { model: until } }, reset when the key changes

function modelScore(provider, id) {
  const s = id.toLowerCase();
  const unstable = /preview|exp|beta/.test(s) ? 0 : 1;
  const ver = Number((s.match(/(\d+(?:\.\d+)?)/) || [])[1]) || 0;
  const size = Math.max(0, ...[...s.matchAll(/(\d+(?:\.\d+)?)b\b/g)].map(m => Number(m[1])), /kimi-k2|deepseek/.test(s) ? 600 : 0);
  const small = /lite|nano|mini|small|tiny|lightning|-xs|instant|\bflash-8b/.test(s) ? 0 : 1;
  if (provider === 'gemini') {
    // Flash first: pro models are usually not in the free tier and are slower.
    const tier = /lite|nano|8b/.test(s) ? 1 : /pro/.test(s) ? 2 : /flash/.test(s) ? 3 : 0;
    return [tier, unstable, ver];
  }
  return [s === 'openrouter/free' ? 0 : 1, small, unstable, size];
}
function rankModels(provider, ids) {
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]; return 0; };
  return [...new Set(ids)].sort((x, y) => cmp(modelScore(provider, x), modelScore(provider, y)) || x.localeCompare(y));
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  let msg = text;
  try { const j = JSON.parse(text); msg = (j.error && (j.error.message || j.error)) || text; } catch (e) { /* plain text */ }
  const err = new Error(`${res.status}: ${String(msg).slice(0, 300)}`);
  err.status = res.status;
  err.detail = String(text);
  return err;
}

async function fetchModelList(provider, key) {
  let ids;
  if (provider === 'gemini') {
    const res = await fetch(`${BASE.gemini}/v1beta/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw await readError(res);
    const d = await res.json();
    ids = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(id => /^gemini-/.test(id) && !/embed|tts|image|live|audio|native|vision|computer-use|robotics|learnlm/.test(id));
  } else {
    const res = await fetch(`${BASE[provider]}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
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
  const now = Date.now();
  const old = cache[provider] && cache[provider].key === key ? cache[provider] : {};
  const blocked = Object.fromEntries(Object.entries(old.blocked || {}).filter(([, until]) => until > now));
  cache[provider] = { key, list: rankModels(provider, ids), at: now, blocked };
  return cache[provider].list;
}

function models(provider) {
  const c = cache[provider] || { list: [], blocked: {} };
  const now = Date.now();
  const ok = c.list.filter(id => !(c.blocked[id] > now));
  const fb = FALLBACK[provider];
  return ok.length ? ok : !(c.blocked[fb] > now) ? [fb] : [];
}
function block(provider, model, ms) {
  if (!cache[provider]) cache[provider] = { list: [], at: 0, blocked: {} };
  cache[provider].blocked[model] = Date.now() + ms;
}

function tooLong() {
  const e = new Error('The AI ran out of room before finishing its answer. For a long paper, upload it in parts (for example MCQ and CQ separately).');
  e.final = true;
  return e;
}

async function callModel(provider, key, model, system, user, opts) {
  const temperature = opts.temperature == null ? 0.6 : Number(opts.temperature);
  const geminiMax = /gemini-(1\.|2\.0)/.test(model) ? 8192 : 32768;
  const maxTokens = provider === 'gemini' ? Math.max(Number(opts.maxTokens) || 0, geminiMax) : Number(opts.maxTokens) || 8192;
  const files = opts.files || [];
  if (provider === 'gemini') {
    const res = await fetch(`${BASE.gemini}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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
    if (cand && cand.finishReason === 'MAX_TOKENS') throw tooLong();
    const text = (cand && cand.content && cand.content.parts || []).map(p => p.text || '').join('');
    if (!text) throw new Error('The AI returned an empty answer.');
    return text;
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (provider === 'openrouter') headers['X-Title'] = 'Manator';
  const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, max_tokens: maxTokens, stream: false };
  if (opts.json) body.response_format = { type: 'json_object' };
  const res = await fetch(`${BASE[provider]}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  if (choice && choice.finish_reason === 'length') throw tooLong();
  const text = choice && choice.message && choice.message.content;
  if (!text) throw new Error('The AI returned an empty answer.');
  return text;
}

function providers(settings, needFiles) {
  const keys = settings.ai.keys || {};
  return (settings.ai.order || []).filter(p => BASE[p] && keys[p] && (!needFiles || p === 'gemini'));
}

// Tries each configured provider in order, and each provider's models best-first.
async function generate(settings, system, user, opts) {
  const files = opts.files || [];
  const list = providers(settings, files.length > 0);
  if (!list.length) {
    const e = new Error(files.length ? 'Reading PDFs and photos needs a Google Gemini key on the server. Ask the admin to add one.' : 'The AI is not set up on the server yet. Ask the admin to add an AI key.');
    e.status = 503;
    throw e;
  }
  let lastErr = null, tries = 0;
  for (const provider of list) {
    const key = settings.ai.keys[provider];
    if (cache[provider] && cache[provider].key !== key) delete cache[provider];
    const c = cache[provider];
    if (!c || Date.now() - c.at > LIST_MS) await fetchModelList(provider, key).catch(() => {});
    const tried = new Set();
    for (;;) {
      const model = models(provider).find(m => !tried.has(m));
      if (!model || tries >= 25) break;
      tried.add(model);
      tries++;
      try {
        return { text: await callModel(provider, key, model, system, user, opts), provider, model };
      } catch (err) {
        lastErr = err;
        if (err.final) throw err;
        const gone = err.status === 404 || (err.status === 400 && /model/i.test(err.message) && /not found|decommission|no longer|deprecat|not supported|does not exist|invalid model/i.test(err.message));
        const noFree = err.status === 429 && /limit:\s*0\b|"quotaValue":\s*"0"/.test(err.detail || err.message);
        if (gone) { block(provider, model, 30 * 86400e3); continue; }
        if (err.status === 429) { block(provider, model, noFree ? 7 * 86400e3 : 3600e3); continue; }
        if (err.status === 413 || /request too large|context length|maximum context/i.test(err.message)) { const e = new Error('This is too long for the AI. Send a shorter paper, or upload it in parts.'); e.status = 413; throw e; }
        break; // Key rejected, server error or network problem: try the next provider.
      }
    }
  }
  const e = new Error(`The AI is busy right now. Please try again in a minute.${lastErr ? ` (${lastErr.message.slice(0, 160)})` : ''}`);
  e.status = 503;
  throw e;
}

module.exports = { generate, providers, fetchModelList, NAMES };
