const fs = require('fs');

let content = fs.readFileSync('src/tests/SettingsView.test.tsx', 'utf8');
content = content.replace(
  `vi.mock('../services/firebase', () => ({\n  auth: {},\n  db: {},\n  onAuthStateChanged: vi.fn(),\n}));`,
  `vi.mock('../services/firebase', () => ({\n  auth: {},\n  db: {},\n  onAuthStateChanged: vi.fn(),\n  fetchPricingConfig: vi.fn(() => Promise.resolve({ monthlyPrice: 99, yearlyPrice: 999, bkashNumber: '', nagadNumber: '', rocketNumber: '', promoText: '', updatedAt: 0 })),\n  updatePricingConfig: vi.fn(),\n  fetchPendingUpgradeRequests: vi.fn(() => Promise.resolve([])),\n}));`
);
fs.writeFileSync('src/tests/SettingsView.test.tsx', content);
