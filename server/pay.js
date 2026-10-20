// Payment gateways. "test" is a built-in fake checkout for trying the flow without money.
// "sslcommerz" covers bKash, Nagad, Rocket and cards in Bangladesh; every payment is confirmed
// with SSLCommerz's validation API before Pro is given, never from the browser redirect alone.
const { db, newId } = require('./db');

const SSL_HOST = sandbox => (sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com');

function createPayment(user, planId, settings) {
  const p = settings.prices[planId];
  if (!p || !(p.amount > 0) || !(p.days > 0)) { const e = new Error('Unknown plan.'); e.status = 400; throw e; }
  const id = 'MN' + newId(12).replace(/[-_]/g, 'x');
  db.prepare('INSERT INTO payments (id, user_id, plan, amount, days, gateway, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, user.id, planId, Math.round(p.amount), Math.round(p.days), settings.gateway, 'pending', Date.now());
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

// Marks a pending payment paid and extends Pro. Safe to call twice (redirect + IPN).
function markPaid(id, ref, method) {
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  if (!pay) return false;
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = db.prepare("UPDATE payments SET status = 'paid', paid_at = ?, gateway_ref = ?, method = ? WHERE id = ? AND status = 'pending'").run(now, ref || '', method || '', id);
    if (r.changes) db.prepare('UPDATE users SET pro_until = MAX(pro_until, ?) + ? WHERE id = ?').run(now, pay.days * 86400e3, pay.user_id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return true;
}
function markFailed(id, status) {
  db.prepare("UPDATE payments SET status = ? WHERE id = ? AND status = 'pending'").run(status, id);
}

async function startCheckout(pay, user, settings, publicUrl) {
  if (pay.gateway === 'test') return `/pay/test?id=${encodeURIComponent(pay.id)}`;
  if (pay.gateway !== 'sslcommerz') { const e = new Error('Pro payments are not open yet.'); e.status = 503; throw e; }
  const c = settings.sslcommerz;
  if (!c.storeId || !c.storePass) { const e = new Error('The payment gateway is not set up yet. Ask the admin.'); e.status = 503; throw e; }
  const body = new URLSearchParams({
    store_id: c.storeId, store_passwd: c.storePass,
    total_amount: String(pay.amount), currency: 'BDT', tran_id: pay.id,
    success_url: `${publicUrl}/pay/sslcommerz/return`, fail_url: `${publicUrl}/pay/sslcommerz/return`,
    cancel_url: `${publicUrl}/pay/sslcommerz/return`, ipn_url: `${publicUrl}/pay/sslcommerz/ipn`,
    cus_name: user.name || user.email, cus_email: user.email, cus_add1: 'N/A', cus_city: 'Dhaka', cus_country: 'Bangladesh', cus_phone: 'N/A',
    shipping_method: 'NO', product_name: `Manator Pro (${pay.plan})`, product_category: 'Software', product_profile: 'non-physical-goods',
  });
  const res = await fetch(`${SSL_HOST(c.sandbox)}/gwprocess/v4/api.php`, { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) throw new Error(`The payment gateway refused the request${data.failedreason ? `: ${data.failedreason}` : '.'}`);
  db.prepare('UPDATE payments SET gateway_ref = ? WHERE id = ?').run(String(data.sessionkey || ''), pay.id);
  return data.GatewayPageURL;
}

// Asks SSLCommerz whether val_id is a real, completed payment for this transaction and amount.
async function verifySSLCommerz(form, settings) {
  const tranId = String(form.get('tran_id') || '');
  const pay = tranId && db.prepare('SELECT * FROM payments WHERE id = ?').get(tranId);
  if (!pay) return { ok: false, pay: null };
  const status = String(form.get('status') || '');
  const valId = String(form.get('val_id') || '');
  // Unverified callbacks never change the payment: it stays pending until a validated one arrives.
  if (!valId || !/^VALID/.test(status)) return { ok: false, pay };
  const c = settings.sslcommerz;
  const q = new URLSearchParams({ val_id: valId, store_id: c.storeId, store_passwd: c.storePass, v: '1', format: 'json' });
  const res = await fetch(`${SSL_HOST(c.sandbox)}/validator/api/validationserverAPI.php?${q}`);
  const v = await res.json().catch(() => ({}));
  const good = /^(VALID|VALIDATED)$/.test(v.status) && v.tran_id === pay.id && Math.abs(Number(v.amount) - pay.amount) < 0.01 && (v.currency_type || v.currency || 'BDT') === 'BDT';
  if (good) markPaid(pay.id, valId, String(v.card_type || ''));
  return { ok: good, pay };
}

function testGatewayPage(pay, esc) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test payment · Manator</title><style>
body{font:15px/1.5 system-ui,sans-serif;background:#eef1f6;color:#1b1f2a;margin:0;padding:24px;display:grid;place-items:center;min-height:100vh;box-sizing:border-box}
.box{background:#fff;border-radius:14px;padding:24px;max-width:420px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.08)}
.tag{display:inline-block;background:#f5c451;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700}
h1{font-size:20px;margin:12px 0 4px}.amt{font-size:28px;font-weight:800;margin:8px 0 16px}
label{display:flex;gap:10px;align-items:center;border:1px solid #d6dbe6;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer}
.row{display:flex;gap:8px;margin-top:16px}button{flex:1;padding:12px;border-radius:10px;border:0;font-weight:700;font-size:15px;cursor:pointer}
.pay{background:#e2136e;color:#fff}.cancel{background:#e9ecf3}</style></head><body><form class="box" method="post" action="/pay/test/finish">
<span class="tag">TEST GATEWAY · no real money</span><h1>Manator Pro · ${esc(pay.plan)}</h1><div class="amt">৳${esc(pay.amount.toLocaleString('en-US'))}</div>
<input type="hidden" name="id" value="${esc(pay.id)}">
<label><input type="radio" name="method" value="bKash" checked> bKash</label>
<label><input type="radio" name="method" value="Nagad"> Nagad</label>
<label><input type="radio" name="method" value="Card"> Visa / Mastercard</label>
<div class="row"><button class="cancel" name="action" value="cancel">Cancel</button><button class="pay" name="action" value="pay">Pay ৳${esc(pay.amount.toLocaleString('en-US'))}</button></div>
</form></body></html>`;
}

module.exports = { createPayment, startCheckout, verifySSLCommerz, markPaid, markFailed, testGatewayPage };
