const fs = require('fs');

let content = fs.readFileSync('src/views/SettingsView.tsx', 'utf8');

// 1. Imports
content = content.replace(
  `import { auth, submitTrxUpgradeRequest, fetchPendingUpgradeRequests, reviewUpgradeRequest } from '../services/firebase';`,
  `import { auth, submitTrxUpgradeRequest, fetchPendingUpgradeRequests, reviewUpgradeRequest, fetchPricingConfig, updatePricingConfig } from '../services/firebase';`
);
content = content.replace(
  `import { TrxUpgradeRequest } from '../types';`,
  `import { TrxUpgradeRequest, PricingConfig } from '../types';`
);

// 2. States
const statesHook = `
  const [adminRequests, setAdminRequests] = useState<TrxUpgradeRequest[]>([]);
  const isOwner = auth?.currentUser?.email ? isOwnerEmail(auth.currentUser.email) : false;

  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [pricingForm, setPricingForm] = useState<PricingConfig>({
    monthlyPrice: 99,
    yearlyPrice: 999,
    bkashNumber: '',
    nagadNumber: '',
    rocketNumber: '',
    promoText: '',
    updatedAt: 0,
  });
  const [planTerm, setPlanTerm] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    fetchPricingConfig().then(config => {
      setPricingConfig(config);
      setPricingForm(config);
    }).catch(console.error);
  }, []);
`;
content = content.replace(
  `  const [adminRequests, setAdminRequests] = useState<TrxUpgradeRequest[]>([]);
  const isOwner = auth?.currentUser?.email ? isOwnerEmail(auth.currentUser.email) : false;`,
  statesHook
);

// 3. handleSavePricing
const handlers = `
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePricingConfig(pricingForm);
      setPricingConfig(pricingForm);
      toast('Pricing configuration saved successfully', 'success');
    } catch (err) {
      toast('Failed to save pricing configuration', 'error');
    }
  };
`;
content = content.replace(
  `  const handleProviderChange = (newP: typeof provider) => {`,
  handlers + `\n  const handleProviderChange = (newP: typeof provider) => {`
);

// 4. Update handleReviewRequest usage
content = content.replace(
  `handleReviewRequest(req.id, req.uid, 'approved')`,
  `handleReviewRequest(req.id, req.uid, 'approved', req.planTerm, req.amount)`
);


// 5. Update handleUpgradeSubmit
content = content.replace(
  `{ method: upgradeMethod, senderPhone: phone, trxId: tid, amount: 99 }`,
  `{ method: upgradeMethod, senderPhone: phone, trxId: tid, amount: planTerm === 'monthly' ? (pricingConfig?.monthlyPrice || 99) : (pricingConfig?.yearlyPrice || 999), planTerm }`
);


// 6. UI Updates
// Owner Admin Pricing Form
const pricingFormUI = `
        {isOwner && (
          <div className="card" style={{ gridColumn: '1 / -1', border: '2px solid var(--accent)' }}>
            <h2 style={{ color: 'var(--accent)' }}>👑 Owner Admin — Pricing & Payment Numbers</h2>
            <form className="form" onSubmit={handleSavePricing} style={{ marginTop: '12px' }}>
              <div className="form-row">
                <label className="field">
                  Monthly Price (৳)
                  <input type="number" value={pricingForm.monthlyPrice} onChange={e => setPricingForm({ ...pricingForm, monthlyPrice: Number(e.target.value) })} required />
                </label>
                <label className="field">
                  Yearly Price (৳)
                  <input type="number" value={pricingForm.yearlyPrice} onChange={e => setPricingForm({ ...pricingForm, yearlyPrice: Number(e.target.value) })} required />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  bKash Number
                  <input value={pricingForm.bkashNumber} onChange={e => setPricingForm({ ...pricingForm, bkashNumber: e.target.value })} required />
                </label>
                <label className="field">
                  Nagad Number
                  <input value={pricingForm.nagadNumber} onChange={e => setPricingForm({ ...pricingForm, nagadNumber: e.target.value })} required />
                </label>
                <label className="field">
                  Rocket Number
                  <input value={pricingForm.rocketNumber} onChange={e => setPricingForm({ ...pricingForm, rocketNumber: e.target.value })} required />
                </label>
              </div>
              <label className="field" style={{ marginTop: '8px' }}>
                Promo Text (optional, displayed above payment)
                <input value={pricingForm.promoText} onChange={e => setPricingForm({ ...pricingForm, promoText: e.target.value })} placeholder="e.g. 50% OFF for the first 100 users!" />
              </label>
              <button type="submit" className="btn primary" style={{ marginTop: '12px' }}>Save Pricing Config</button>
            </form>
          </div>
        )}
`;

content = content.replace(
  `        {/* Billing Card */}`,
  pricingFormUI + `\n        {/* Billing Card */}`
);

// Billing UI updates
content = content.replace(
  `<h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Upgrade via bKash / Nagad (৳99/mo)</h3>`,
  `<h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Upgrade to Pro</h3>`
);

content = content.replace(
  `<p className="small muted" style={{ marginBottom: '12px' }}>
                    Send ৳99 via Send Money to <b>017XXXXXXX</b>, then enter your TrxID below to get Pro features.
                  </p>`,
  `{pricingConfig?.promoText && (
                    <div style={{ marginBottom: '12px', padding: '8px', background: 'var(--yellow)', color: '#000', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center' }}>
                      {pricingConfig.promoText}
                    </div>
                  )}
                  <p className="small muted" style={{ marginBottom: '12px' }}>
                    Select your plan, send the amount via Send Money to the number below, then enter your TrxID to get Pro features.
                  </p>`
);

content = content.replace(
  `<div className="form-row">
                      <label className="field">
                        Method`,
  `<div className="form-row">
                      <label className="field">
                        Plan Term
                        <select value={planTerm} onChange={e => setPlanTerm(e.target.value as 'monthly' | 'yearly')}>
                          <option value="monthly">Monthly (৳{pricingConfig?.monthlyPrice || 99})</option>
                          <option value="yearly">Yearly (৳{pricingConfig?.yearlyPrice || 999})</option>
                        </select>
                      </label>
                    </div>
                    <div className="form-row">
                      <label className="field">
                        Payment Method`
);

content = content.replace(
  `                        <select value={upgradeMethod} onChange={e => setUpgradeMethod(e.target.value as any)}>
                          <option value="bkash">bKash</option>
                          <option value="nagad">Nagad</option>
                          <option value="rocket">Rocket</option>
                        </select>
                      </label>
                      <label className="field">
                        Sender Phone`,
  `                        <select value={upgradeMethod} onChange={e => setUpgradeMethod(e.target.value as any)}>
                          <option value="bkash">bKash ({pricingConfig?.bkashNumber || '017XXXXXXX'})</option>
                          <option value="nagad">Nagad ({pricingConfig?.nagadNumber || '017XXXXXXX'})</option>
                          <option value="rocket">Rocket ({pricingConfig?.rocketNumber || '017XXXXXXX'})</option>
                        </select>
                      </label>
                      <label className="field">
                        Sender Phone`
);

fs.writeFileSync('src/views/SettingsView.tsx', content);
