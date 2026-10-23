const fs = require('fs');

let content = fs.readFileSync('src/services/firebase.ts', 'utf8');
content = content.replace(
  `    senderPhone: payload.senderPhone,\n    planTerm: payload.planTerm,`,
  `    senderPhone: payload.senderPhone,`
);
fs.writeFileSync('src/services/firebase.ts', content);
