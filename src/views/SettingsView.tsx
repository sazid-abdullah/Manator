import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/context';
import { AI_PROVIDERS, fetchModelList, callAI, autoModel, readModelCache } from '../services/ai';
import { todayISO, fmtDate } from '../utils/date';
import { ConfirmModal } from '../components/ConfirmModal';
import { auth, submitTrxUpgradeRequest, fetchPendingUpgradeRequests, reviewUpgradeRequest, fetchPricingConfig, updatePricingConfig } from '../services/firebase';
import { isOwnerEmail } from '../utils/auth';
import { TrxUpgradeRequest, PricingConfig } from '../types';

const CURRENCIES = ['৳', '₹', 'Rs ', '$', '£', '€', 'RM ', 'SAR '];

export const SettingsView: React.FC = () => {
  const {
    state,
    billingState,
    updateSettings,
    updateAI,
    loadDemoData,
    eraseAllData,
    exportBackup,
    updateProfile,
    importBackup,
    downloadFile,
    toast,
  } = useStore();

  const [tutorName, setTutorName] = useState(state.settings.tutorName || '');
  const [credentials, setCredentials] = useState(state.profile?.credentials || '');
  const [brandTitle, setBrandTitle] = useState(state.profile?.brandTitle || '');
  const [showPrintHeader, setShowPrintHeader] = useState(state.profile?.showPrintHeader ?? true);
  const [showPrintWatermark, setShowPrintWatermark] = useState(state.profile?.showPrintWatermark ?? true);
  const [currency, setCurrency] = useState(state.settings.currency || '৳');
  const [provider, setProvider] = useState(state.ai.provider);
  const [apiKey, setApiKey] = useState(state.ai.keys[provider] || '');
  const [selectedModel, setSelectedModel] = useState(state.ai.models[provider] || '');
  const [includeKeysInBackup, setIncludeKeysInBackup] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [eraseConfirmOpen, setEraseConfirmOpen] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string}[]>([]);
  const [modelsLoadedMsg, setModelsLoadedMsg] = useState('');
  const apiKeyTimeout = useRef<number | null>(null);

  const [upgradeMethod, setUpgradeMethod] = useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const [senderPhone, setSenderPhone] = useState('');
  const [trxId, setTrxId] = useState('');
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);


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


  const pConfig = AI_PROVIDERS[provider];

  useEffect(() => {
    const cache = readModelCache()[provider];
    if (cache && Array.isArray(cache.list)) {
      setAvailableModels(cache.list.map((m: any) => typeof m === 'object' && m !== null ? m : { id: String(m), name: String(m) }));
    } else {
      setAvailableModels([{ id: AI_PROVIDERS[provider].fallback, name: AI_PROVIDERS[provider].fallback }]);
    }
    setModelsLoadedMsg('');
  }, [provider]);

  useEffect(() => {
    if (apiKeyTimeout.current) window.clearTimeout(apiKeyTimeout.current);
    if (!apiKey.trim()) return;
    apiKeyTimeout.current = window.setTimeout(() => {
      handleRefreshModels(false);
    }, 1000);
    return () => { if (apiKeyTimeout.current) window.clearTimeout(apiKeyTimeout.current); };
  }, [apiKey]);

  useEffect(() => {
    if (isOwner) {
      fetchPendingUpgradeRequests().then(reqs => setAdminRequests(reqs)).catch(err => {
        console.error("Failed to load admin requests:", err);
      });
    }
  }, [isOwner]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      tutorName: tutorName.trim(),
      currency,
    });
    updateProfile({
      credentials: credentials.trim(),
      brandTitle: brandTitle.trim(),
      showPrintHeader,
      showPrintWatermark,
    });
    toast('Profile saved', 'success');
  };


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

  const handleProviderChange = (newP: typeof provider) => {
    setProvider(newP);
    setApiKey(state.ai.keys[newP] || '');
    setSelectedModel(state.ai.models[newP] || '');
    updateAI({ provider: newP });
  };

  const handleSaveAI = (e: React.FormEvent) => {
    e.preventDefault();
    updateAI({
      provider,
      keys: { ...state.ai.keys, [provider]: apiKey.trim() },
      models: { ...state.ai.models, [provider]: selectedModel.trim() },
    });
    toast('AI configuration saved', 'success');
  };

  const handleTestAI = async () => {
    const updatedAI = {
      provider,
      keys: { ...state.ai.keys, [provider]: apiKey.trim() },
      models: { ...state.ai.models, [provider]: selectedModel.trim() },
    };
    updateAI(updatedAI);

    if (provider !== 'ollama' && !apiKey.trim()) {
      toast('Enter an API key first', 'error');
      return;
    }

    setTestingAI(true);
    try {
      const res = await callAI('You are a connection test.', 'Reply with exactly: OK', {
        ...state,
        ai: updatedAI,
      }, { maxTokens: 10, temperature: 0, onFallback: (msg) => toast(msg, 'info') });
      toast(`Connected to ${pConfig.name}: "${res.trim()}"`, 'success');
    } catch (err: any) {
      toast(`Connection test failed: ${err.message}`, 'error');
    } finally {
      setTestingAI(false);
    }
  };

  const handleRefreshModels = async (showToast: boolean = true) => {
    setRefreshingModels(true);
    setModelsLoadedMsg('Loading models...');
    try {
      const { list, tier } = await fetchModelList(provider, {
        ...state,
        ai: {
          ...state.ai,
          provider,
          keys: { ...state.ai.keys, [provider]: apiKey.trim() },
        },
      });
      setAvailableModels(list);

      if (provider === 'gemini') {
        const tierMsg = tier === 'free' ? 'Free Tier API key detected' : 'Paid Tier API key detected';
        const displayMsg = tier === 'free' ? 'free-tier compatible models' : 'models';
        setModelsLoadedMsg(`${tierMsg} — showing ${list.length} ${displayMsg}`);
      } else {
        setModelsLoadedMsg(`Loaded ${list.length} available models for your API key`);
      }

      if (showToast) toast(`Found ${list.length} models for ${pConfig.name}`, 'success');
    } catch (err: any) {
      setAvailableModels([{ id: AI_PROVIDERS[provider].fallback, name: AI_PROVIDERS[provider].fallback }]);
      setModelsLoadedMsg('Using default fallback models');
      if (showToast) toast(`Could not load models: ${err.message}`, 'error');
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleBackupDownload = () => {
    const content = exportBackup(includeKeysInBackup);
    downloadFile(`tuitrix-backup-${todayISO()}.json`, content, 'application/json');
    updateSettings({ lastBackup: new Date().toISOString() });
    toast('Backup file downloaded', 'success');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackup(reader.result as string);
        toast('Backup restored successfully!', 'success');
      } catch (err: any) {
        toast(err.message || 'Failed to restore backup', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth?.currentUser) {
      toast('Please log in first to upgrade', 'error');
      return;
    }

    const phone = senderPhone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      toast('Please enter a valid 11-digit BD phone number', 'error');
      return;
    }

    const tid = trxId.trim().toUpperCase();
    if (tid.length < 6) {
      toast('Please enter a valid Transaction ID', 'error');
      return;
    }

    setIsSubmittingUpgrade(true);
    try {
      await submitTrxUpgradeRequest(auth.currentUser.uid, auth.currentUser.email!, auth.currentUser.displayName || undefined, { method: upgradeMethod, senderPhone: phone, trxId: tid, amount: planTerm === 'monthly' ? (pricingConfig?.monthlyPrice || 99) : (pricingConfig?.yearlyPrice || 999), planTerm });
      toast('Upgrade request submitted successfully! Waiting for verification.', 'success');
    } catch (err) {
      toast('Failed to submit request', 'error');
    }
    setIsSubmittingUpgrade(false);
  };

  const handleReviewRequest = async (id: string, uid: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount?: number) => {
    try {
      await reviewUpgradeRequest(id, uid, action, planTerm, amount);
      setAdminRequests(prev => prev.filter(r => r.id !== id));
      toast(`Request ${action}`, 'success');
    } catch (err) {
      toast('Failed to update request', 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Tutor profile, AI engines, data backup & publishing setup</div>
        </div>
      </div>

      <div className="grid">
        {/* Admin Dashboard */}
        {isOwner && (
          <div className="card" style={{ gridColumn: '1 / -1', border: '2px solid var(--accent)' }}>
            <h2 style={{ color: 'var(--accent)' }}>👑 Owner Admin — TrxID Approvals</h2>
            {adminRequests.length === 0 ? (
              <p className="muted small">No pending upgrade requests.</p>
            ) : (
              <table className="table" style={{ marginTop: '8px' }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Method</th>
                    <th>Phone</th>
                    <th>TrxID</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {adminRequests.map(req => (
                    <tr key={req.id}>
                      <td>{req.userEmail}</td>
                      <td>{req.method}</td>
                      <td>{req.senderPhone}</td>
                      <td>{req.trxId}</td>
                      <td>{fmtDate(req.createdAt.split('T')[0])}</td>
                      <td>
                        <button className="btn primary small" onClick={() => handleReviewRequest(req.id, req.uid, 'approved', req.planTerm, req.amount)} style={{ marginRight: '4px' }}>Approve</button>
                        <button className="btn danger small" onClick={() => handleReviewRequest(req.id, req.uid, 'rejected')}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}


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

        {/* Billing Card */}
        <div className="card">
          <h2>Account & Billing</h2>
          {billingState ? (
            <div>
              <p>Current Plan: <strong>{billingState.plan === 'pro' ? 'Pro' : 'Free'}</strong></p>
              {billingState.plan === 'pro' && (
                <p>Pro Until: {fmtDate(new Date(billingState.proUntil).toISOString())}</p>
              )}
              {billingState.plan === 'free' && (
                <p>AI Credits: <strong>{billingState.credits}</strong></p>
              )}

              {billingState.pendingRequest && billingState.pendingRequest.status === 'pending' && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--card2)', borderRadius: '8px', borderLeft: '4px solid var(--accent)' }}>
                  <strong>⏳ Verification Pending</strong>
                  <p className="small muted" style={{ marginTop: '4px' }}>We are verifying your TrxID ({billingState.pendingRequest.trxId}). Pro access will be granted shortly.</p>
                </div>
              )}

              {billingState.plan === 'free' && (!billingState.pendingRequest || billingState.pendingRequest.status !== 'pending') && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Upgrade to Pro</h3>
                  {pricingConfig?.promoText && (
                    <div style={{ marginBottom: '12px', padding: '8px', background: 'var(--yellow)', color: '#000', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center' }}>
                      {pricingConfig.promoText}
                    </div>
                  )}
                  <p className="small muted" style={{ marginBottom: '12px' }}>
                    Select your plan, send the amount via Send Money to the number below, then enter your TrxID to get Pro features.
                  </p>
                  <form className="form" onSubmit={handleUpgradeSubmit}>
                    <div className="form-row">
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
                        Payment Method
                        <select value={upgradeMethod} onChange={e => setUpgradeMethod(e.target.value as any)}>
                          <option value="bkash">bKash ({pricingConfig?.bkashNumber || '017XXXXXXX'})</option>
                          <option value="nagad">Nagad ({pricingConfig?.nagadNumber || '017XXXXXXX'})</option>
                          <option value="rocket">Rocket ({pricingConfig?.rocketNumber || '017XXXXXXX'})</option>
                        </select>
                      </label>
                      <label className="field">
                        Sender Phone
                        <input placeholder="017..." value={senderPhone} onChange={e => setSenderPhone(e.target.value)} required />
                      </label>
                    </div>
                    <label className="field" style={{ marginTop: '8px' }}>
                      Transaction ID (TrxID)
                      <input placeholder="e.g. BJM82K9L0P" value={trxId} onChange={e => setTrxId(e.target.value.toUpperCase())} required />
                    </label>
                    <button type="submit" className="btn primary" disabled={isSubmittingUpgrade} style={{ marginTop: '12px', width: '100%' }}>
                      {isSubmittingUpgrade ? 'Submitting...' : 'Submit TrxID'}
                    </button>
                  </form>
                </div>
              )}

              {billingState.transactions && billingState.transactions.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3>Transaction History</h3>
                  <table className="table" style={{ marginTop: '8px' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Plan</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingState.transactions.map((t: any) => (
                        <tr key={t.id}>
                          <td>{fmtDate(new Date(t.created_at).toISOString())}</td>
                          <td>{t.plan}</td>
                          <td>{state.settings.currency}{t.amount}</td>
                          <td>
                            <span className={`badge ${t.status === 'paid' ? 'green' : t.status === 'pending' ? 'yellow' : 'red'}`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p>Current Plan: <strong>Free (BYOK)</strong></p>
              <p className="muted small">Login or create an account to use the built-in AI credits, or use your own API keys below.</p>
            </div>
          )}
        </div>

        {/* Profile Card */}
        <div className="card">
          <h2>Tutor Profile</h2>
          <form className="form" onSubmit={handleSaveProfile}>
            <div className="form-row">
              <label className="field">
                Your name
                <input
                  value={tutorName}
                  onChange={e => setTutorName(e.target.value)}
                  placeholder="Shown in parent payment reminders"
                />
              </label>
              <label className="field">
                Currency symbol
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>
                      {c.trim()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label className="field">
                Academic Credentials / Subtitle (Optional)
                <input
                  value={credentials}
                  onChange={e => setCredentials(e.target.value)}
                  placeholder="e.g. B.Sc. in CSE, North South University"
                />
              </label>
              <label className="field">
                Custom Coaching / Header Title (Optional)
                <input
                  value={brandTitle}
                  onChange={e => setBrandTitle(e.target.value)}
                  placeholder="e.g. Sazid's Physics & Math Care"
                />
              </label>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={showPrintHeader}
                onChange={e => setShowPrintHeader(e.target.checked)}
              />{' '}
              Show Branded Header on Printed Sheets
            </label>

            <label className="check" style={{ marginTop: '8px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={showPrintWatermark}
                onChange={e => setShowPrintWatermark(e.target.checked)}
              />{' '}
              Show Diagonal Watermark on Printed Sheets
            </label>

            <div className="form-actions">
              <button type="submit" className="btn primary">
                Save profile
              </button>
            </div>
          </form>
        </div>

        {/* AI Provider configuration */}
        <div className="card">
          <h2>AI Configuration</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Lesson plans and exams are generated using free-tier AI keys. Your students' names, phone numbers, and financial details are never transmitted.
          </p>

          <form className="form" onSubmit={handleSaveAI}>
            <label className="field">
              AI Provider
              <select
                value={provider}
                onChange={e => handleProviderChange(e.target.value as any)}
              >
                {Object.entries(AI_PROVIDERS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="notice">
              {pConfig.note}{' '}
              {pConfig.needsKey ? (
                <a href={pConfig.keyUrl} target="_blank" rel="noopener noreferrer">
                  Get your free API key
                </a>
              ) : (
                <a href={pConfig.keyUrl} target="_blank" rel="noopener noreferrer">
                  Download Ollama
                </a>
              )}
            </div>

            {pConfig.needsKey && (
              <label className="field">
                API Key
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={`Paste your ${pConfig.name} API key`}
                  autoComplete="off"
                />
              </label>
            )}

            <label className="field">
              Model
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
              >
                <option value="">Auto default ({autoModel(provider, state)})</option>
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </label>

            {modelsLoadedMsg && (
              <p className="muted small" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                {modelsLoadedMsg}
              </p>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => handleRefreshModels(true)}
                disabled={refreshingModels}
              >
                {refreshingModels ? 'Loading models...' : 'Refresh model list'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleTestAI}
                disabled={testingAI}
              >
                {testingAI ? 'Testing…' : 'Test connection'}
              </button>
              <button type="submit" className="btn primary">
                Save AI settings
              </button>
            </div>
          </form>
        </div>

        {/* Backup and Data */}
        <div className="card">
          <h2>Backup & Storage</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            {state.settings.lastBackup
              ? `Last backup saved: ${fmtDate(state.settings.lastBackup.slice(0, 10))}.`
              : 'No backup downloaded yet.'}{' '}
            Download a backup file to keep in Google Drive or restore on any phone, laptop, or new browser.
          </p>

          <div className="actions">
            <button className="btn primary" onClick={handleBackupDownload}>
              Download backup JSON
            </button>
            <label className="btn">
              Restore from backup
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleRestoreFile}
              />
            </label>
            <button className="btn ghost" onClick={() => setDemoConfirmOpen(true)}>
              Load demo sample data
            </button>
            <button className="btn danger" onClick={() => setEraseConfirmOpen(true)}>
              Erase all data
            </button>
          </div>

          <label className="check" style={{ marginTop: '12px' }}>
            <input
              type="checkbox"
              checked={includeKeysInBackup}
              onChange={e => setIncludeKeysInBackup(e.target.checked)}
            />{' '}
            Include AI keys in backup file
          </label>
        </div>

        {/* Publishing & Monetization Guide */}
        <div className="card">
          <h2>Publishing & Monetization Architecture</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Everything you need to launch Tuitrix as both an installable app and public web application:
          </p>

          <div style={{ display: 'grid', gap: '14px', fontSize: '0.9rem' }}>
            <div style={{ padding: '12px', background: 'var(--card2)', borderRadius: '10px' }}>
              <b style={{ color: 'var(--accent)' }}>1. Web & Mobile App Deployment (PWA)</b>
              <p className="muted small" style={{ marginTop: '4px' }}>
                Tuitrix is built as a Progressive Web App (PWA). When hosted on Vercel, Firebase Hosting, Netlify, or Cloud Run, visitors on <b>Android, iPhone, iPad, Windows, or Mac</b> will see an "Install app" prompt or can tap "Add to Home Screen". It installs directly as a standalone native-feeling app without needing app store approval!
              </p>
            </div>

            <div style={{ padding: '12px', background: 'var(--card2)', borderRadius: '10px' }}>
              <b style={{ color: 'var(--green)' }}>2. Android Google Play Store APK</b>
              <p className="muted small" style={{ marginTop: '4px' }}>
                You can wrap this Vite PWA using <b>Bubblewrap (TWA - Trusted Web Activity)</b> or <b>Capacitor</b> to produce a signed <code>.aab</code> (Android App Bundle) or <code>.apk</code> in minutes and publish directly to Google Play.
              </p>
            </div>

            <div style={{ padding: '12px', background: 'var(--card2)', borderRadius: '10px' }}>
              <b style={{ color: 'var(--yellow)' }}>3. Monetization & Earning Options</b>
              <p className="muted small" style={{ marginTop: '4px' }}>
                • <b>Tuition Management Pro Subscriptions</b>: Charge tutors monthly (e.g. ৳299/mo or $5/mo) for cloud backup and AI lesson generator usage via <b>SSLCommerz, bKash, Nagad</b> or <b>Stripe</b>.
                <br />• <b>Ad-Rewarded Credits</b>: Integrate Google AdSense / AdMob banners to earn ad revenue while tutors generate exam papers.
                <br />• <b>Affiliate or School Batch Licensing</b>: Offer multi-tutor or coaching center accounts.
              </p>
            </div>
          </div>
        </div>

        <p className="muted small" style={{ textAlign: 'center', marginTop: '12px' }}>
          {state.students.length} students · {state.lessons.length} logged classes ·{' '}
          {state.payments.length} payments · {state.docs.length} saved AI documents
        </p>
      </div>

      <ConfirmModal
        isOpen={eraseConfirmOpen}
        title="Erase all data?"
        message="This will delete all students, classes, fee contracts, and payments saved in this browser. Ensure you have downloaded a backup first."
        confirmLabel="Erase everything"
        isDanger
        onConfirm={() => {
          eraseAllData();
          toast('All data erased', 'info');
        }}
        onClose={() => setEraseConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={demoConfirmOpen}
        title="Load demo data?"
        message="This adds 3 sample students with realistic schedules, contracts, and attendance history alongside your existing data."
        confirmLabel="Load demo"
        onConfirm={() => {
          loadDemoData();
          toast('Demo data loaded', 'success');
        }}
        onClose={() => setDemoConfirmOpen(false)}
      />
    </div>
  );
};
