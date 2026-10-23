const fs = require('fs');
let typesContent = fs.readFileSync('src/types.ts', 'utf8');

typesContent = typesContent.replace(
  '  amount: number;\n  status: \'pending\' | \'approved\' | \'rejected\';',
  `  amount: number;\n  planTerm?: 'monthly' | 'yearly';\n  status: 'pending' | 'approved' | 'rejected';`
);

fs.writeFileSync('src/types.ts', typesContent);
