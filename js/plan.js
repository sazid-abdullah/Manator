// Plans: AI is locked on the free plan until a rewarded ad adds credits; Pro (paid) unlocks it fully.
// Prototype: the plan lives in this browser and checkout runs in test mode. A real launch needs a
// server that verifies gateway payments and ad rewards, since browser storage can be edited.
const PLAN_KEY = 'manator_plan';
const PLAN = {
  welcomeCredits: 3,
  adCredits: 3,
  adsPerDay: 5,
  adSeconds: 15,
  prices: {
    monthly: { label: 'Monthly', amount: 149, per: 'month', days: 30 },
    yearly: { label: 'Yearly', amount: 1199, per: 'year', days: 365 },
  },
  methods: { bkash: 'bKash', nagad: 'Nagad', card: 'Visa / Mastercard' },
};

function loadPlan() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PLAN_KEY)); } catch (e) { /* reset below */ }
  if (!p || typeof p !== 'object') p = { credits: PLAN.welcomeCredits };
  return {
    credits: Math.max(0, Math.floor(Number(p.credits) || 0)),
    proUntil: Number(p.proUntil) || 0,
    proPlan: p.proPlan || '',
    adsDay: p.adsDay || '',
    adsToday: Number(p.adsToday) || 0,
    payments: Array.isArray(p.payments) ? p.payments : [],
  };
}
let plan = loadPlan();
function savePlan() { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch (e) { /* private mode */ } }
window.addEventListener('storage', e => { if (e.key === PLAN_KEY) plan = loadPlan(); });

function isPro() { return plan.proUntil > Date.now(); }
function adsLeftToday() { return plan.adsDay === todayISO() ? Math.max(0, PLAN.adsPerDay - plan.adsToday) : PLAN.adsPerDay; }
function planAllowsAI() { return isPro() || plan.credits > 0; }
function spendAICredit() { if (!isPro() && plan.credits > 0) { plan.credits--; savePlan(); } }

function aiLockedError() {
  const err = new Error('You are out of AI credits. Watch a short ad for more, or go Pro for unlimited AI.');
  err.locked = true;
  return err;
}

// Call before starting any AI action; returns true (and explains why) when it can't run.
function needAI() {
  if (!aiReady()) {
    closeModal(); toast('Set up an AI provider in Settings first', 'error'); location.hash = '#/settings';
    return true;
  }
  if (!planAllowsAI()) { openPaywall(); return true; }
  return false;
}

function creditsText() { return `${plan.credits} AI credit${plan.credits === 1 ? '' : 's'} left`; }
function priceText(id) { const p = PLAN.prices[id]; return `৳${p.amount.toLocaleString('en-US')}/${p.per}`; }

function planBarHTML() {
  if (isPro()) return `<div class="plan-bar pro"><span class="badge green">Pro</span><span>Unlimited AI, no ads · until ${esc(fmtDate(toISO(new Date(plan.proUntil))))}</span></div>`;
  const ads = adsLeftToday();
  return `<div class="plan-bar${plan.credits ? '' : ' locked'}"><span class="badge ${plan.credits ? 'blue' : 'red'}">${plan.credits ? 'Free' : 'AI locked'}</span>
    <span class="plan-bar-text">${esc(creditsText())}. Each AI request uses 1.</span>
    <span class="actions">${ads ? `<button class="btn" data-action="watch-ad">Watch ad · +${PLAN.adCredits}</button>` : ''}<button class="btn primary" data-action="go-pro">Go Pro</button></span></div>`;
}

function adSlotHTML() {
  if (isPro()) return '';
  return `<div class="ad-slot" role="complementary" aria-label="Advertisement"><span class="ad-tag">Ad</span>
    <div><b>Your ad could be here</b><div class="muted small">Demo banner. Real ads come from an ad network (for example Google AdSense).</div></div>
    <button class="btn ghost" data-action="go-pro">Remove ads</button></div>`;
}

function planCardHTML() {
  const pro = isPro();
  const last = plan.payments[plan.payments.length - 1];
  return `<div class="card"><h2>Plan</h2>
    ${pro ? `<p style="margin-bottom:12px"><span class="badge green">Pro</span> Unlimited AI and no ads until <b>${esc(fmtDate(toISO(new Date(plan.proUntil))))}</b>.</p>`
      : `<p style="margin-bottom:12px"><span class="badge ${plan.credits ? 'blue' : 'red'}">Free</span> ${esc(creditsText())}. Watch a short ad for +${PLAN.adCredits} credits (${adsLeftToday()} of ${PLAN.adsPerDay} ads left today), or go Pro for unlimited AI.</p>`}
    ${last ? `<p class="muted small" style="margin-bottom:12px">Last payment: ৳${esc(last.amount)} via ${esc(PLAN.methods[last.method] || last.method)} · ${esc(last.id)}${last.test ? ' (test)' : ''}</p>` : ''}
    <div class="actions">${pro ? '' : `<button class="btn" data-action="watch-ad"${adsLeftToday() ? '' : ' disabled'}>Watch ad · +${PLAN.adCredits}</button>`}
      <button class="btn primary" data-action="go-pro">${pro ? 'Extend Pro' : `Go Pro · ${priceText('monthly')}`}</button>
      <button class="btn ghost" data-action="plan-reset">Reset plan (demo)</button></div>
    <p class="help" style="margin-top:10px">Students, classes, money and offline exams are always free. Only the AI tools use credits.</p></div>`;
}

function openPaywall() {
  const ads = adsLeftToday();
  openModal('Unlock AI', `<p style="margin-bottom:14px">You've used your free AI credits. Students, classes, money and offline exams keep working; the AI tools need credits or Pro.</p>
    <div class="plan-opts">
      <div class="plan-opt"><h3>Free</h3><div class="plan-price">Watch an ad</div>
        <p class="muted small">A ${PLAN.adSeconds}-second ad adds ${PLAN.adCredits} AI credits. ${ads} of ${PLAN.adsPerDay} left today.</p>
        <button class="btn" id="pw-ad"${ads ? '' : ' disabled'}>${ads ? `Watch ad · +${PLAN.adCredits}` : 'Come back tomorrow'}</button></div>
      <div class="plan-opt best"><h3>Pro</h3><div class="plan-price">${priceText('monthly')}</div>
        <p class="muted small">Unlimited AI, no ads. Or ${priceText('yearly')} (save 33%).</p>
        <button class="btn primary" id="pw-pro">Go Pro</button></div>
    </div>`, body => {
    body.querySelector('#pw-ad').onclick = () => openRewardedAd();
    body.querySelector('#pw-pro').onclick = () => openCheckout();
  });
}

function openRewardedAd() {
  if (isPro()) return toast('Pro has no ads and unlimited AI');
  if (!adsLeftToday()) return toast(`That's all ${PLAN.adsPerDay} ads for today. Come back tomorrow, or go Pro.`, 'error');
  let left = PLAN.adSeconds;
  openModal('Sponsored', `<div class="ad-player">
      <div class="ad-creative"><span class="ad-tag">Ad</span><div class="ad-big">Demo ad</div><div class="muted small">A real ad from an ad network plays here.</div></div>
      <div class="progress"><span id="ad-bar" style="width:0%"></span></div>
      <p class="muted small" id="ad-left">Reward in ${left}s. Keep this tab open.</p></div>
    <div class="form-actions"><button class="btn ghost" data-close>Close (no reward)</button><button class="btn primary" id="ad-claim" disabled>Claim +${PLAN.adCredits} credits</button></div>`, body => {
    const bar = body.querySelector('#ad-bar'), txt = body.querySelector('#ad-left'), claim = body.querySelector('#ad-claim');
    const timer = setInterval(() => {
      if (!document.body.contains(claim)) return clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      left--;
      bar.style.width = `${Math.round((PLAN.adSeconds - left) / PLAN.adSeconds * 100)}%`;
      if (left > 0) { txt.textContent = `Reward in ${left}s. Keep this tab open.`; return; }
      clearInterval(timer);
      txt.textContent = 'Thanks for watching!';
      claim.disabled = false;
    }, 1000);
    claim.onclick = () => {
      const day = todayISO();
      if (plan.adsDay !== day) { plan.adsDay = day; plan.adsToday = 0; }
      plan.adsToday++;
      plan.credits += PLAN.adCredits;
      savePlan();
      closeModal();
      render();
      toast(`+${PLAN.adCredits} AI credits. ${creditsText()}.`);
    };
  });
}

function openCheckout(planId) {
  planId = PLAN.prices[planId] ? planId : 'monthly';
  openModal('Go Pro', `<form class="form" id="f-pay">
      <div class="notice warn">Test mode: no real money is charged. A live gateway (bKash, Nagad, SSLCommerz or Stripe) needs a small server to verify payments.</div>
      <div class="field">Plan<div class="seg" id="pay-plan">${Object.entries(PLAN.prices).map(([k, p]) => `<button type="button" data-plan="${k}" class="${k === planId ? 'active' : ''}">${esc(p.label)} · ${priceText(k)}</button>`).join('')}</div></div>
      <div class="field">Pay with<div class="pay-methods">${Object.entries(PLAN.methods).map(([k, v], i) => `<label class="check pay-method"><input type="radio" name="method" value="${k}"${i ? '' : ' checked'}> ${esc(v)}</label>`).join('')}</div></div>
      <label class="field" id="pay-wallet">Wallet number<input name="phone" inputmode="numeric" placeholder="01XXXXXXXXX" autocomplete="tel"></label>
      <div class="form-row" id="pay-card" hidden><label class="field">Card number<input name="card" inputmode="numeric" placeholder="4242 4242 4242 4242" autocomplete="cc-number"></label>
        <label class="field">Expiry<input name="exp" placeholder="MM/YY" autocomplete="cc-exp"></label></div>
      <div class="notice err" id="pay-err" hidden></div>
      <div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" id="pay-go">Pay ৳${PLAN.prices[planId].amount.toLocaleString('en-US')}</button></div>
    </form>`, body => {
    const form = body.querySelector('#f-pay'), go = body.querySelector('#pay-go'), errBox = body.querySelector('#pay-err');
    const sync = () => {
      const card = form.method.value === 'card';
      body.querySelector('#pay-card').hidden = !card;
      body.querySelector('#pay-wallet').hidden = card;
      go.textContent = `Pay ৳${PLAN.prices[planId].amount.toLocaleString('en-US')}`;
    };
    body.querySelector('#pay-plan').onclick = e => {
      const b = e.target.closest('[data-plan]');
      if (!b) return;
      planId = b.dataset.plan;
      body.querySelectorAll('#pay-plan button').forEach(x => x.classList.toggle('active', x === b));
      sync();
    };
    form.addEventListener('change', sync);
    form.addEventListener('input', () => { errBox.hidden = true; });
    form.onsubmit = e => {
      e.preventDefault();
      const method = form.method.value;
      const bad = method === 'card' ? (form.card.value.replace(/\D/g, '').length < 12 ? 'Enter a card number.' : !/^\d{2}\/\d{2}$/.test(form.exp.value.trim()) ? 'Enter the expiry as MM/YY.' : '')
        : !/^01\d{9}$/.test(form.phone.value.replace(/\D/g, '')) ? 'Enter an 11-digit mobile number starting with 01.' : '';
      errBox.hidden = !bad; errBox.textContent = bad;
      if (bad) return;
      go.disabled = true;
      go.innerHTML = `<span class="spinner"></span> Contacting ${esc(PLAN.methods[method])}…`;
      setTimeout(() => {
        if (!document.body.contains(go)) return;
        const p = PLAN.prices[planId];
        plan.proUntil = Math.max(Date.now(), plan.proUntil) + p.days * 86400e3;
        plan.proPlan = planId;
        plan.payments.push({ id: 'TEST-' + Date.now().toString(36).toUpperCase(), plan: planId, amount: p.amount, method, at: new Date().toISOString(), test: true });
        savePlan();
        closeModal();
        render();
        toast(`Welcome to Pro! Unlimited AI until ${fmtDate(toISO(new Date(plan.proUntil)))}.`);
      }, 1500);
    };
  });
}

const PLAN_ACTIONS = {
  'watch-ad': () => openRewardedAd(),
  'go-pro': d => openCheckout(d.plan),
  'plan-reset': () => confirmDialog('Reset plan?', `Demo only: removes Pro and sets AI credits back to ${PLAN.welcomeCredits}, so you can try the free flow again.`, 'Reset', () => {
    plan = { credits: PLAN.welcomeCredits, proUntil: 0, proPlan: '', adsDay: '', adsToday: 0, payments: [] };
    savePlan(); closeModal(); render(); toast('Plan reset');
  }),
};
