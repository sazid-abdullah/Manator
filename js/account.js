// Accounts, credits and Pro. Active only when the app is served by the Tuitrix server
// (server/server.js); opened as plain static files it keeps the old "your own AI key" mode.
const account = { server: false, user: null, config: null };
const ACCOUNT_KEY = 'tuitrix_account';
let staticModeLogged = false;

function logStaticMode(reason) {
  if (staticModeLogged) return;
  staticModeLogged = true;
  console.info(`Tuitrix is running in static mode (${reason}). Login, AI credits and Pro checkout need the optional Node server.`);
}

async function initAccount() {
  try {
    const r = await fetch('api/me', { credentials: 'same-origin', signal: AbortSignal.timeout(5000) });
    if (r.ok && /json/.test(r.headers.get('content-type') || '')) {
      const d = await r.json();
      Object.assign(account, { server: true, user: d.user, config: d.config, skew: d.user && d.user.serverNow ? d.user.serverNow - Date.now() : 0 });
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ user: d.user, config: d.config }));
      return;
    }
    localStorage.removeItem(ACCOUNT_KEY);
    logStaticMode('no API server detected');
  } catch (e) {
    // Offline: remember that this copy talks to a server.
    try {
      const c = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
      if (c && c.config) Object.assign(account, { server: true, user: c.user, config: c.config });
      else logStaticMode('no cached server account');
    } catch (err) {
      logStaticMode('offline or API unreachable');
    }
  }
}

async function api(path, body, method) {
  let res;
  try {
    res = await fetch(path, {
      method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) { throw new Error('Can\'t reach the Tuitrix server. Check your internet connection.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && account.user && path !== 'api/login') { account.user = null; }
    const err = new Error(data.error || `Server error ${res.status}`);
    err.status = res.status;
    if (res.status === 402) err.locked = true;
    if (data.setupCode) err.setupCode = true;
    throw err;
  }
  if (data.user !== undefined) setAccountUser(data.user);
  return data;
}
function setAccountUser(u) {
  account.user = u;
  if (u && u.serverNow) account.skew = u.serverNow - Date.now();
  try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ user: u, config: account.config })); } catch (e) { /* cache only */ }
}
async function refreshAccount() {
  const d = await api('api/me');
  account.config = d.config;
  setAccountUser(d.user);
}

let aiLastRequest = '';
async function serverAI(system, user, opts) {
  opts = opts || {};
  const d = await api('api/ai', {
    system, user, retry: opts.retryOf || undefined,
    opts: { temperature: opts.temperature, maxTokens: opts.maxTokens, json: !!opts.json, files: opts.files || [] },
  });
  aiLastRequest = d.id;
  aiLastModel = d.model;
  return d.text;
}

const can = p => !!account.user && (account.user.perms || []).includes(p);
const isStaff = () => !!account.user && (account.user.role === 'owner' || account.user.role === 'admin');
const roleName = u => (u.role === 'owner' ? 'Owner' : 'Admin');
const isPro = () => !!account.user && Number(account.user.proUntil) > Date.now() + (account.skew || 0);
const unlimitedAI = () => !!account.user && (isPro() || can('unlimited'));
function aiCanReadFiles() { return account.server ? !!(account.config && account.config.ai.files) : db.ai.provider === 'gemini'; }

// Call before starting any AI action; returns true (and explains why) when it can't run.
function needAI() {
  if (!account.server) {
    if (aiReady()) return false;
    closeModal(); toast('Set up an AI provider in Settings first', 'error'); location.hash = '#/settings';
    return true;
  }
  if (!account.user) { openAuth('signup'); return true; }
  if (!account.config.ai.ready) { closeModal(); toast('The AI is not set up on the server yet. The admin needs to add an AI key.', 'error'); return true; }
  if (!unlimitedAI() && account.user.credits <= 0) { openPaywall(); return true; }
  return false;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function creditsText() { return `${plural(account.user.credits, 'AI credit')} left`; }
function priceText(id) { const p = account.config.prices[id]; return `৳${Number(p.amount).toLocaleString('en-US')}/${id === 'yearly' ? 'year' : 'month'}`; }
const proDate = () => fmtDate(toISO(new Date(account.user.proUntil)));

function planBarHTML() {
  if (!account.server) return '';
  const u = account.user, c = account.config;
  if (!u) return `<div class="plan-bar"><span class="badge blue">Free</span><span class="plan-bar-text">Create a free account to use the AI. You get ${plural(c.welcomeCredits, 'free AI credit')}.</span>
    <span class="actions"><button class="btn" data-action="sign-in">Sign in</button><button class="btn primary" data-action="sign-up">Create account</button></span></div>`;
  if (isStaff() && can('unlimited')) return `<div class="plan-bar pro"><span class="badge green">${roleName(u)}</span><span class="plan-bar-text">Unlimited AI. <a href="#/admin">Admin page</a></span></div>`;
  if (isPro()) return `<div class="plan-bar pro"><span class="badge green">Pro</span><span class="plan-bar-text">Unlimited AI, no ads · until ${esc(proDate())}</span></div>`;
  return `<div class="plan-bar${u.credits ? '' : ' locked'}"><span class="badge ${u.credits ? 'blue' : 'red'}">${u.credits ? 'Free' : 'AI locked'}</span>
    <span class="plan-bar-text">${esc(creditsText())}. Each AI request uses 1.</span>
    <span class="actions">${u.adsLeft ? `<button class="btn" data-action="watch-ad">Watch ad · +${c.adCredits}</button>` : ''}<button class="btn primary" data-action="go-pro">Go Pro</button></span></div>`;
}

function adSlotHTML() {
  if (!account.server || unlimitedAI()) return '';
  return `<div class="ad-slot" role="complementary" aria-label="Advertisement"><span class="ad-tag">Ad</span>
    <div><b>Your ad could be here</b><div class="muted small">Demo banner. Real ads come from an ad network (for example Google AdSense).</div></div>
    <button class="btn ghost" data-action="go-pro">Remove ads</button></div>`;
}

function planCardHTML() {
  return account.server
    ? `<div id="plan-card">${planCardInner()}</div>`
    : `<div class="card"><h2>Account & Pro payments</h2>
      <p class="muted small">This copy is loaded as a static site (for example GitHub Pages), so the optional <code>/api</code> server is not available.</p>
      <p class="muted small">Because of that, login/signup, AI credits and Pro checkout are hidden here. To use them, run <code>npm start</code> on the Node server and open that server URL.</p>
      <p class="help">Payment integration on the server: <b>test</b> mode (fake local checkout) or <b>SSLCommerz</b> (bKash, Nagad, Rocket, cards) with callback + validation before Pro is granted.</p>
    </div>`;
}
function planCardInner() {
  const u = account.user, c = account.config;
  if (!u) return `<div class="card"><h2>Account</h2><p style="margin-bottom:12px">Sign in to use the AI tools. A free account comes with ${plural(c.welcomeCredits, 'AI credit')}; watch a short ad for more, or go Pro for unlimited AI.</p>
    <div class="actions"><button class="btn" data-action="sign-in">Sign in</button><button class="btn primary" data-action="sign-up">Create account</button></div>
    <p class="help" style="margin-top:10px">Students, classes, money and exams stay in this browser and work without an account.</p></div>`;
  const badge = isStaff() && can('unlimited') ? `<span class="badge green">${roleName(u)}</span> Unlimited AI.` : isPro() ? `<span class="badge green">Pro</span> Unlimited AI and no ads until <b>${esc(proDate())}</b>.`
    : `<span class="badge ${u.credits ? 'blue' : 'red'}">Free</span> ${esc(creditsText())}. Watch a short ad for +${plural(c.adCredits, 'credit')} (${u.adsLeft} of ${c.adsPerDay} left today), or go Pro for unlimited AI.`;
  return `<div class="card"><h2>Account</h2>
    <p class="muted small" style="margin-bottom:8px">Signed in as <b>${esc(u.email)}</b></p>
    <p style="margin-bottom:12px">${badge}</p>
    <div class="actions">${unlimitedAI() ? '' : `<button class="btn" data-action="watch-ad"${u.adsLeft ? '' : ' disabled'}>Watch ad · +${c.adCredits}</button>`}
      ${isStaff() && can('unlimited') ? '' : `<button class="btn primary" data-action="go-pro">${isPro() ? 'Extend Pro' : `Go Pro · ${priceText('monthly')}`}</button>`}
      ${isStaff() ? '<a class="btn" href="#/admin">Admin page</a>' : ''}
      <button class="btn ghost" data-action="sign-out">Sign out</button></div>
    <p class="help" style="margin-top:10px">The AI runs on Tuitrix's server. Only the class, subject, topics and any file or text you attach are sent; student names, phone numbers and money never leave this browser.</p></div>`;
}

function openAuth(mode) {
  const up = mode === 'signup';
  openModal(up ? 'Create your account' : 'Sign in', `<form class="form" id="f-auth">
      ${up ? `<p class="muted small">Free accounts get ${plural(account.config.welcomeCredits, 'AI credit')}. Your students and classes stay in this browser.</p><label class="field">Name<input name="name" autocomplete="name"></label>` : ''}
      <label class="field">Email<input name="email" type="email" required autocomplete="email"></label>
      <label class="field">Password<input name="password" type="password" required minlength="8" autocomplete="${up ? 'new-password' : 'current-password'}"${up ? ' placeholder="At least 8 characters"' : ''}></label>
      ${'<label class="field" id="auth-code" hidden>Owner setup code<input name="setupCode" autocomplete="off" placeholder="Shown in the server log"></label>'}
      <div class="notice err" id="auth-err" hidden></div>
      <div class="form-actions"><button type="button" class="btn ghost" id="auth-switch">${up ? 'I have an account' : 'Create an account'}</button><button class="btn primary" id="auth-go">${up ? 'Create account' : 'Sign in'}</button></div>
    </form>`, body => {
    body.querySelector('#auth-switch').onclick = () => openAuth(up ? 'signin' : 'signup');
    const form = body.querySelector('#f-auth'), box = body.querySelector('#auth-err'), go = body.querySelector('#auth-go');
    form.onsubmit = async e => {
      e.preventDefault();
      go.disabled = true; box.hidden = true;
      try {
        await api(up ? 'api/signup' : 'api/login', formData(form));
        closeModal(); render();
        toast(up ? `Welcome! You have ${creditsText()}.` : 'Signed in');
      } catch (err) {
        box.textContent = err.message; box.hidden = false; go.disabled = false;
        if (err.setupCode) body.querySelector('#auth-code').hidden = false;
      }
    };
  });
}

function openPaywall() {
  const u = account.user, c = account.config;
  openModal('Unlock AI', `<p style="margin-bottom:14px">You've used your free AI credits. Students, classes, money and offline exams keep working; the AI tools need credits or Pro.</p>
    <div class="plan-opts">
      <div class="plan-opt"><h3>Free</h3><div class="plan-price">Watch an ad</div>
        <p class="muted small">A ${c.adSeconds}-second ad adds ${plural(c.adCredits, 'AI credit')}. ${u.adsLeft} of ${c.adsPerDay} left today.</p>
        <button class="btn" id="pw-ad"${u.adsLeft ? '' : ' disabled'}>${u.adsLeft ? `Watch ad · +${c.adCredits}` : 'Come back tomorrow'}</button></div>
      <div class="plan-opt best"><h3>Pro</h3><div class="plan-price">${priceText('monthly')}</div>
        <p class="muted small">Unlimited AI, no ads. Or ${priceText('yearly')}.</p>
        <button class="btn primary" id="pw-pro">Go Pro</button></div>
    </div>`, body => {
    body.querySelector('#pw-ad').onclick = () => openRewardedAd();
    body.querySelector('#pw-pro').onclick = () => openCheckout();
  });
}

async function openRewardedAd() {
  if (!account.user) return openAuth('signin');
  let ad;
  try { ad = await api('api/ads/start', {}); } catch (err) { return toast(err.message, 'error'); }
  const c = account.config;
  let left = ad.seconds;
  openModal('Sponsored', `<div class="ad-player">
      <div class="ad-creative"><span class="ad-tag">Ad</span><div class="ad-big">Demo ad</div><div class="muted small">A real ad from an ad network plays here.</div></div>
      <div class="progress"><span id="ad-bar" style="width:0%"></span></div>
      <p class="muted small" id="ad-left">Reward in ${left}s. Keep this tab open.</p></div>
    <div class="form-actions"><button class="btn ghost" data-close>Close (no reward)</button><button class="btn primary" id="ad-claim" disabled>Claim +${plural(c.adCredits, 'credit')}</button></div>`, body => {
    const bar = body.querySelector('#ad-bar'), txt = body.querySelector('#ad-left'), claim = body.querySelector('#ad-claim');
    const timer = setInterval(() => {
      if (!document.body.contains(claim)) return clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      left--;
      bar.style.width = `${Math.round((ad.seconds - left) / ad.seconds * 100)}%`;
      if (left > 0) { txt.textContent = `Reward in ${left}s. Keep this tab open.`; return; }
      clearInterval(timer);
      txt.textContent = 'Thanks for watching!';
      claim.disabled = false;
    }, 1000);
    claim.onclick = async () => {
      claim.disabled = true;
      try {
        await api('api/ads/claim', { id: ad.id });
        closeModal(); render();
        toast(`+${plural(c.adCredits, 'AI credit')}. ${creditsText()}.`);
      } catch (err) { txt.textContent = err.message; claim.disabled = false; }
    };
  });
}

function openCheckout(planId) {
  if (!account.user) return openAuth('signin');
  if (account.config.gateway === 'off') { closeModal(); toast('Pro payments are not open yet. Watch an ad for a free credit.', 'error'); return; }
  const c = account.config;
  planId = c.prices[planId] ? planId : 'monthly';
  const amount = () => `৳${Number(c.prices[planId].amount).toLocaleString('en-US')}`;
  openModal('Go Pro', `<div class="form">
      ${c.gateway === 'test' ? '<div class="notice warn">Test mode: no real money is charged.</div>' : ''}
      <p>Unlimited AI and no ads. You pay on the secure payment page with bKash, Nagad, Rocket or a card.</p>
      <div class="plan-opts" id="pay-plan">${Object.entries(c.prices).map(([k, p]) => `<button type="button" class="plan-opt${k === planId ? ' best' : ''}" data-plan="${k}"><h3>${esc(p.label)}</h3><div class="plan-price">${priceText(k)}</div><span class="muted small">${p.days} days of Pro</span></button>`).join('')}</div>
      <div class="notice err" id="pay-err" hidden></div>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="pay-go">Pay ${amount()}</button></div>
    </div>`, body => {
    const go = body.querySelector('#pay-go'), box = body.querySelector('#pay-err');
    body.querySelector('#pay-plan').onclick = e => {
      const b = e.target.closest('[data-plan]');
      if (!b) return;
      planId = b.dataset.plan;
      body.querySelectorAll('#pay-plan [data-plan]').forEach(x => x.classList.toggle('best', x === b));
      go.textContent = `Pay ${amount()}`;
    };
    go.onclick = async () => {
      go.disabled = true; box.hidden = true;
      go.innerHTML = '<span class="spinner"></span> Opening the payment page…';
      try { location.href = (await api('api/pay/start', { plan: planId })).url; } catch (err) {
        box.textContent = err.message; box.hidden = false; go.disabled = false; go.textContent = `Pay ${amount()}`;
      }
    };
  });
}

async function paymentReturned(ok) {
  await refreshAccount().catch(() => {});
  render();
  if (ok === '1' && account.user && account.user.pro) toast(`Welcome to Pro! Unlimited AI until ${proDate()}.`);
  else toast('The payment was not completed. You have not been charged for Pro.', 'error');
}

// ── Admin page: settings, users, payments, and (owner only) admins ──
const PERM_LABELS = { users: 'See users', credits: 'Give credits or Pro', payments: 'See payments', plans: 'Edit prices and free credits', gateway: 'Edit payment gateway', ai: 'Edit AI keys', unlimited: 'Unlimited AI for themselves' };
const admin = { data: null, error: '' };
const permBoxes = perms => `<div class="perm-grid">${Object.entries(PERM_LABELS).map(([k, l]) => `<label class="check"><input type="checkbox" name="perm" value="${k}"${perms.includes(k) ? ' checked' : ''}> ${l}</label>`).join('')}</div>`;
const checkedPerms = form => [...form.querySelectorAll('input[name="perm"]:checked')].map(i => i.value);

function viewAdmin() {
  if (!account.server || !isStaff()) return '<div class="empty">Only admins can open this page. <a href="#/settings">Back to settings</a></div>';
  const owner = account.user.role === 'owner';
  const head = `<div class="page-head"><div><h1>Admin</h1><div class="sub">${owner ? 'You are the owner: you have every right and choose what each admin can do.'
    : `Your rights: ${esc(account.user.perms.map(p => PERM_LABELS[p]).join(', ') || 'none')}. The owner can change them.`}</div></div></div>`;
  if (admin.error) return head + `<div class="notice err">${esc(admin.error)}</div>`;
  const d = admin.data;
  if (!d) return head + '<div class="empty"><span class="spinner"></span></div>';
  const s = d.settings || {};
  const secret = (name, v, label) => `<label class="field">${label}<input name="${name}" type="password" autocomplete="off" placeholder="${v.set ? `Saved (ends in ${esc(v.hint)}). Type to replace.` : 'Not set'}"></label>`;
  const day = t => t ? esc(fmtDate(toISO(new Date(t)))) : '';
  const cards = [];
  if (can('plans')) cards.push(`<div class="card"><h2>Plans & free credits</h2><div class="form">
      <div class="form-row"><label class="field">Pro monthly price (৳)<input name="monthly" type="number" min="1" value="${s.prices.monthly.amount}"></label>
        <label class="field">Pro yearly price (৳)<input name="yearly" type="number" min="1" value="${s.prices.yearly.amount}"></label></div>
      <div class="form-row"><label class="field">Credits for new accounts<input name="welcomeCredits" type="number" min="0" value="${s.welcomeCredits}"></label>
        <label class="field">Credits per ad<input name="adCredits" type="number" min="0" value="${s.adCredits}"></label>
        <label class="field">Ads per day<input name="adsPerDay" type="number" min="0" value="${s.adsPerDay}"></label>
        <label class="field">Ad length (seconds)<input name="adSeconds" type="number" min="5" max="120" value="${s.adSeconds}"></label></div></div></div>`);
  if (can('gateway')) cards.push(`<div class="card"><h2>Payment gateway</h2><div class="form">
      <label class="field">Gateway<select name="gateway"><option value="off"${s.gateway === 'off' ? ' selected' : ''}>Off (Pro not on sale)</option><option value="test"${s.gateway === 'test' ? ' selected' : ''}>Test mode (anyone gets Pro free; only for trying it out)</option><option value="sslcommerz"${s.gateway === 'sslcommerz' ? ' selected' : ''}>SSLCommerz (bKash, Nagad, Rocket, cards)</option></select></label>
      <div class="form-row"><label class="field">SSLCommerz store ID<input name="storeId" value="${esc(s.sslcommerz.storeId)}" autocomplete="off"></label>
        ${secret('storePass', s.sslcommerz.storePass, 'SSLCommerz store password')}</div>
      <label class="check"><input type="checkbox" name="sandbox"${s.sslcommerz.sandbox ? ' checked' : ''}> Sandbox (SSLCommerz test account)</label>
      <p class="help">Get a free sandbox store at developer.sslcommerz.com. For real payments, untick Sandbox and use your live store ID after SSLCommerz approves your business.</p></div></div>`);
  if (can('ai')) cards.push(`<div class="card"><h2>AI keys</h2><div class="form">
      <p class="help">Every user's AI requests run on these keys. The server tries the providers in this order and moves on when one is busy or out of quota. Only Gemini reads PDFs and photos.</p>
      <label class="field">Order<input name="order" value="${esc(s.ai.order.join(', '))}"></label>
      ${['gemini', 'groq', 'openrouter'].map(p => `<div class="form-row" style="align-items:end">${secret(`key_${p}`, s.ai.keys[p], `${{ gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter' }[p]} key${d.env.aiKeys.includes(p) ? ' (set on the server)' : ''}`)}
        <div class="actions"><button type="button" class="btn" data-action="admin-ai-test" data-provider="${p}">Test</button></div></div>`).join('')}</div></div>`);
  const planOf = u => u.role === 'owner' ? 'Owner' : [u.role === 'admin' ? 'Admin' : '', u.pro ? `Pro until ${day(u.proUntil)}` : u.role === 'admin' ? '' : 'Free'].filter(Boolean).join(' · ');
  return head + (cards.length ? `<form class="grid" id="f-admin">${cards.join('')}<div class="form-actions"><button class="btn primary">Save settings</button></div></form>` : '')
    + (d.users ? `<div class="section"><h2>Users (${d.users.length})</h2><div class="card table-wrap"><table class="table"><thead><tr><th>Email</th><th>Plan</th><th>Credits</th><th>AI requests</th><th>Joined</th>${can('credits') ? '<th></th>' : ''}</tr></thead><tbody>
      ${d.users.map(u => `<tr><td>${esc(u.email)}</td><td>${planOf(u)}</td><td>${u.credits}</td><td>${u.aiRequests}</td><td>${day(u.createdAt)}</td>
        ${can('credits') ? `<td class="nowrap"><button class="btn ghost" data-action="admin-user" data-id="${u.id}" data-add-credits="5">+5 credits</button><button class="btn ghost" data-action="admin-user" data-id="${u.id}" data-add-pro-days="30">+30 days Pro</button>${u.pro ? `<button class="btn ghost" data-action="admin-user" data-id="${u.id}" data-end-pro="1">End Pro</button>` : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table></div></div>` : '')
    + (d.payments ? `<div class="section"><h2>Payments</h2><div class="card table-wrap">${d.payments.length ? `<table class="table"><thead><tr><th>Date</th><th>Email</th><th>Plan</th><th>Amount</th><th>Gateway</th><th>Status</th></tr></thead><tbody>
      ${d.payments.map(p => `<tr><td>${day(p.created_at)}</td><td>${esc(p.email)}</td><td>${esc(p.plan)}</td><td>৳${esc(p.amount)}</td><td>${esc(p.gateway)}${p.method ? ` · ${esc(p.method)}` : ''}</td><td><span class="badge ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'yellow' : 'red'}">${esc(p.status)}</span></td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No payments yet.</div>'}</div></div>` : '')
    + (d.admins ? `<div class="section"><h2>Admins (${d.admins.length})</h2><div class="grid">
      <div class="card"><h3>Add an admin</h3><form class="form" id="f-admin-add">
        <p class="help">They need a Tuitrix account first. Admins only get the rights you tick, and only you can add or remove admins.</p>
        <label class="field">Their account email<input name="email" type="email" required autocomplete="off"></label>
        ${permBoxes([])}
        <div class="form-actions"><button class="btn primary">Add admin</button></div></form></div>
      ${d.admins.map(a => `<div class="card"><form class="form f-admin-perms" data-email="${esc(a.email)}"><h3>${esc(a.email)}</h3>${permBoxes(a.perms)}
        <div class="form-actions"><button type="button" class="btn ghost" data-action="admin-remove" data-email="${esc(a.email)}">Remove admin</button><button class="btn primary">Save rights</button></div></form></div>`).join('')}
    </div></div>` : '');
}

async function loadAdmin() {
  try {
    await refreshAccount().catch(() => {});
    if (!isStaff()) { admin.data = null; admin.error = ''; render(); return; }
    const get = (ok, path) => (ok ? api(path) : Promise.resolve(null));
    const [st, us, pa, ad] = await Promise.all([
      get(can('plans') || can('gateway') || can('ai'), 'api/admin/settings'), get(can('users') || can('credits'), 'api/admin/users'),
      get(can('payments'), 'api/admin/payments'), get(account.user.role === 'owner', 'api/admin/admins'),
    ]);
    admin.data = { settings: st && st.settings, env: st ? st.env : { aiKeys: [] }, users: us && us.users, payments: pa && pa.payments, admins: ad && ad.admins };
    admin.error = '';
  } catch (err) { admin.error = err.message; }
  if (parseHash().parts[0] === 'admin') render();
}

async function setAdmin(email, perms, done) {
  try {
    await api('api/admin/admins', { email, perms });
    toast(done);
    admin.data = null; loadAdmin();
  } catch (err) { toast(err.message, 'error'); }
}

function bindAdmin() {
  if (!account.server || !isStaff()) return;
  if (!admin.data && !admin.error) { loadAdmin(); return; }
  const form = document.getElementById('f-admin');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const f = formData(form);
    const key = n => (f[n] ? f[n] : '');
    const body = {};
    if (can('plans')) Object.assign(body, { welcomeCredits: f.welcomeCredits, adCredits: f.adCredits, adsPerDay: f.adsPerDay, adSeconds: f.adSeconds, prices: { monthly: { amount: f.monthly }, yearly: { amount: f.yearly } } });
    if (can('gateway')) Object.assign(body, { gateway: f.gateway, sslcommerz: { storeId: f.storeId, storePass: key('storePass'), sandbox: form.sandbox.checked } });
    if (can('ai')) body.ai = { order: f.order.split(/[\s,]+/).filter(Boolean), keys: { gemini: key('key_gemini'), groq: key('key_groq'), openrouter: key('key_openrouter') } };
    try {
      const r = await api('api/admin/settings', body, 'PUT');
      admin.data.settings = r.settings;
      await refreshAccount().catch(() => {});
      render();
      toast('Settings saved');
    } catch (err) { toast(err.message, 'error'); }
  };
  const add = document.getElementById('f-admin-add');
  if (add) add.onsubmit = e => {
    e.preventDefault();
    const perms = checkedPerms(add);
    if (!perms.length) { toast('Tick at least one right for the new admin.', 'error'); return; }
    setAdmin(add.email.value, perms, 'Admin added');
  };
  document.querySelectorAll('.f-admin-perms').forEach(f => {
    f.onsubmit = e => {
      e.preventDefault();
      const perms = checkedPerms(f);
      if (!perms.length) { toast('Tick at least one right, or use Remove admin.', 'error'); return; }
      setAdmin(f.dataset.email, perms, 'Rights saved');
    };
  });
}

const ACCOUNT_ACTIONS = {
  'sign-in': () => openAuth('signin'),
  'sign-up': () => openAuth('signup'),
  'sign-out': async () => { try { await api('api/logout', {}); } catch (e) { /* signed out locally anyway */ } setAccountUser(null); admin.data = null; render(); toast('Signed out'); },
  'watch-ad': () => openRewardedAd(),
  'go-pro': d => openCheckout(d.plan),
  'admin-ai-test': async (d, el) => {
    el.disabled = true; el.textContent = 'Testing…';
    try { const r = await api('api/admin/ai-test', { provider: d.provider }); toast(`Connected: ${r.models} models, ${r.model} replied "${r.reply}"`); } catch (err) { toast(err.message, 'error'); }
    el.disabled = false; el.textContent = 'Test';
  },
  'admin-remove': d => { if (confirm(`Remove ${d.email} as admin? Their account stays.`)) setAdmin(d.email, [], 'Admin removed'); },
  'admin-user': async d => {
    try {
      await api('api/admin/user', { id: Number(d.id), addCredits: Number(d.addCredits) || 0, addProDays: Number(d.addProDays) || 0, endPro: !!d.endPro });
      if (account.user && Number(d.id) === account.user.id) await refreshAccount().catch(() => {});
      admin.data = null; loadAdmin();
    } catch (err) { toast(err.message, 'error'); }
  },
};

// The server's ad allowance resets at UTC midnight; refresh when the tab comes back or the day changes.
let accountCheckedAt = Date.now();
function refreshAccountSoon() {
  if (!account.server || !account.user || Date.now() - accountCheckedAt < 60e3) return;
  accountCheckedAt = Date.now();
  // Only redraw the plan bar and account card, so half-filled forms on the page are kept.
  refreshAccount().then(() => {
    for (const bar of document.querySelectorAll('.plan-bar')) bar.outerHTML = planBarHTML();
    const card = document.getElementById('plan-card');
    if (card) card.outerHTML = planCardHTML();
  }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAccountSoon(); });
(function atUtcMidnight() {
  const d = new Date(); const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) + 5e3;
  setTimeout(() => { accountCheckedAt = 0; refreshAccountSoon(); atUtcMidnight(); }, next - Date.now());
})();
