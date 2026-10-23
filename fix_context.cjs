const fs = require('fs');

let content = fs.readFileSync('src/store/context.tsx', 'utf8');
content = content.replace(
  `    attendance: Record<string, Lesson['status']>; // studentId -> status`,
  `    attendance: Record<string, Lesson['status']>; // studentId -> status\n    batchSessionId?: string;`
);
fs.writeFileSync('src/store/context.tsx', content);
