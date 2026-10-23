const fs = require('fs');

let content = fs.readFileSync('src/services/firebase.ts', 'utf8');

// 1. Import PricingConfig
content = content.replace(
  `import { TrxUpgradeRequest } from '../types';`,
  `import { TrxUpgradeRequest, PricingConfig } from '../types';`
);

// 2. Add fetchPricingConfig and updatePricingConfig functions before export
const pricingFunctions = `
const DEFAULT_PRICING: PricingConfig = {
  monthlyPrice: 99,
  yearlyPrice: 999,
  bkashNumber: '017XXXXXXX',
  nagadNumber: '017XXXXXXX',
  rocketNumber: '017XXXXXXX',
  promoText: '',
  updatedAt: Date.now()
};

export const fetchPricingConfig = async (): Promise<PricingConfig> => {
  if (!db) {
    const local = localStorage.getItem('tuitrix_pricing');
    return local ? JSON.parse(local) : DEFAULT_PRICING;
  }
  try {
    const docRef = doc(db, 'app_config', 'pricing');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as PricingConfig;
    }
  } catch (e) {
    console.error("Failed to fetch pricing config", e);
  }
  return DEFAULT_PRICING;
};

export const updatePricingConfig = async (config: PricingConfig): Promise<void> => {
  const data = { ...config, updatedAt: Date.now() };
  if (!db) {
    localStorage.setItem('tuitrix_pricing', JSON.stringify(data));
    return;
  }
  await setDoc(doc(db, 'app_config', 'pricing'), data);
};
`;

content = content.replace(
  'export { auth, db, analytics, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };',
  pricingFunctions + '\nexport { auth, db, analytics, googleProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };'
);


// 3. Update submitTrxUpgradeRequest
content = content.replace(
  `export const submitTrxUpgradeRequest = async (uid: string, email: string, name: string | undefined, payload: { method: 'bkash' | 'nagad' | 'rocket'; senderPhone: string; trxId: string; amount: number }) => {`,
  `export const submitTrxUpgradeRequest = async (uid: string, email: string, name: string | undefined, payload: { method: 'bkash' | 'nagad' | 'rocket'; senderPhone: string; trxId: string; amount: number; planTerm?: 'monthly' | 'yearly' }) => {`
);

content = content.replace(
  `    amount: payload.amount,`,
  `    amount: payload.amount,\n    planTerm: payload.planTerm,`
);

content = content.replace(
  `    senderPhone: payload.senderPhone,`,
  `    senderPhone: payload.senderPhone,\n    planTerm: payload.planTerm,`
);

// 4. Update reviewUpgradeRequest
content = content.replace(
  `export const reviewUpgradeRequest = async (requestId: string, targetUid: string, action: 'approved' | 'rejected') => {`,
  `export const reviewUpgradeRequest = async (requestId: string, targetUid: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount: number = 99) => {`
);

content = content.replace(
  `    updateData.proUntil = Date.now() + 30 * 86400e3; // 30 days`,
  `    const currentProUntil = currentData.proUntil && currentData.proUntil > Date.now() ? currentData.proUntil : Date.now();
    updateData.proUntil = currentProUntil + (planTerm === 'yearly' ? 365 : 30) * 86400e3;`
);

content = content.replace(
  `{ id: requestId, amount: 99, date: now, type: 'subscription' }`,
  `{ id: requestId, amount, date: now, type: 'subscription', planTerm }`
);

fs.writeFileSync('src/services/firebase.ts', content);
