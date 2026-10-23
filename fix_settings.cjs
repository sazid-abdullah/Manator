const fs = require('fs');
let content = fs.readFileSync('src/views/SettingsView.tsx', 'utf8');

content = content.replace(
  `  const handleReviewRequest = async (id: string, uid: string, action: 'approved' | 'rejected') => {`,
  `  const handleReviewRequest = async (id: string, uid: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount?: number) => {`
);

content = content.replace(
  `await reviewUpgradeRequest(id, uid, action);`,
  `await reviewUpgradeRequest(id, uid, action, planTerm, amount);`
);

fs.writeFileSync('src/views/SettingsView.tsx', content);
