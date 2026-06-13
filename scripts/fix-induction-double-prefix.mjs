import fs from 'fs';
import path from 'path';

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

function fixFile(file) {
  if (!/\.(ts|tsx)$/.test(file)) return false;
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  while (content.includes('InductionInduction')) {
    content = content.split('InductionInduction').join('Induction');
  }
  if (file.endsWith(`${path.sep}InductionMatrixEntryData.ts`)) {
    content = content.replace("'matrixentries'", "'inductionmatrixentries'");
    content = content.replace("ref: 'InductionMatrixSOPAssignment'", "ref: 'InductionMatricesSOPAssignment'");
  }
  if (content !== original) {
    fs.writeFileSync(file, content);
    return true;
  }
  return false;
}

const roots = [
  'models',
  'lib',
  path.join('app', 'api', 'induction-training-matrix'),
  path.join('app', 'induction-training-matrix'),
];

let fixed = 0;
for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const stat = fs.statSync(root);
  if (stat.isDirectory()) {
    walk(root, (file) => {
      if (fixFile(file)) fixed += 1;
    });
  } else if (fixFile(root)) {
    fixed += 1;
  }
}

console.log(`Fixed ${fixed} file(s)`);
