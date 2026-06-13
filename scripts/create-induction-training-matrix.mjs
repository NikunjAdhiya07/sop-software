import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function transformContent(content) {
  const replacements = [
    ['/api/training-matrix', '/api/induction-training-matrix'],
    ['/training-matrix', '/induction-training-matrix'],
    ['@/lib/trainingMatrixCache', '@/lib/inductionTrainingMatrixCache'],
    ['@/lib/manageSopViewCache', '@/lib/inductionManageSopViewCache'],
    ['@/models/TrainingMatrixUpload', '@/models/InductionTrainingMatrixUpload'],
    ['@/models/TrainingMatrixRecord', '@/models/InductionTrainingMatrixRecord'],
    ['@/models/MatrixSOPAssignment', '@/models/InductionMatrixSOPAssignment'],
    ['@/models/MatrixEntryData', '@/models/InductionMatrixEntryData'],
    ['getTrainingMatrixCacheEntry', 'getInductionTrainingMatrixCacheEntry'],
    ['getTrainingMatrixCached', 'getInductionTrainingMatrixCached'],
    ['setTrainingMatrixCached', 'setInductionTrainingMatrixCached'],
    ['invalidateTrainingMatrixCache', 'invalidateInductionTrainingMatrixCache'],
    ['TrainingMatrixCacheEntry', 'InductionTrainingMatrixCacheEntry'],
    ['getManageSopViewMemoryEntry', 'getInductionManageSopViewMemoryEntry'],
    ['getManageSopViewCacheEntry', 'getInductionManageSopViewCacheEntry'],
    ['setManageSopViewCached', 'setInductionManageSopViewCached'],
    ['invalidateManageSopViewCache', 'invalidateInductionManageSopViewCache'],
    ['runManageSopViewRebuildSingleflight', 'runInductionManageSopViewRebuildSingleflight'],
    ['ManageSopViewCacheEntry', 'InductionManageSopViewCacheEntry'],
    ['training-matrix-falsy-ignored', 'induction-training-matrix-falsy-ignored'],
    ['training_matrix_overview_cache_v5', 'induction_training_matrix_overview_cache_v5'],
    ['manage_sop_view_cache_v5', 'induction_manage_sop_view_cache_v5'],
    ['training-matrix-overview:v51', 'induction-training-matrix-overview:v1'],
    ['manage-sop-view:v6', 'induction-manage-sop-view:v1'],
    ['__tm_overview_cache', '__itm_overview_cache'],
    ['__manageSopViewCacheVersion', '__inductionManageSopViewCacheVersion'],
    ['__manageSopViewCache', '__inductionManageSopViewCache'],
    ['__manageSopViewInflight', '__inductionManageSopViewInflight'],
    ["sourceFile='manage-sop-manual'", "sourceFile='induction-manage-sop-manual'"],
    ['sourceFile: "manage-sop-manual"', 'sourceFile: "induction-manage-sop-manual"'],
    ['fileName: "manage-sop-manual"', 'fileName: "induction-manage-sop-manual"'],
    ['getTrainingMatrixOverviewCached', 'getInductionTrainingMatrixOverviewCached'],
    ['TrainingMatrixRecord', 'InductionTrainingMatrixRecord'],
    ['TrainingMatrixUpload', 'InductionTrainingMatrixUpload'],
    ['TrainingMatricesUpload', 'InductionTrainingMatricesUpload'],
    ['TrainingMatricesRecord', 'InductionTrainingMatricesRecord'],
    ['trainingmatricesupload', 'inductiontrainingmatricesupload'],
    ['trainingmatricesrecord', 'inductiontrainingmatricesrecord'],
    ['MatrixSOPAssignment', 'InductionMatrixSOPAssignment'],
    ['MatricesSOPAssignment', 'InductionMatricesSOPAssignment'],
    ['matricessopassignment', 'inductionmatricessopassignment'],
    ['MatrixEntryData', 'InductionMatrixEntryData'],
    ["'matrixentries'", "'inductionmatrixentries'"],
    ['TrainingMatrixPage', 'InductionTrainingMatrixPage'],
    ['ManageSOPDashboard', 'InductionManageSOPDashboard'],
    ['Upload Training Matrix', 'Upload Induction Training Matrix'],
    ['Assign SOP to Training Matrix', 'Assign SOP to Induction Training Matrix'],
    ['from the Training Matrix and', 'from the Induction Training Matrix and'],
    ["book_append_sheet(wb, ws, 'Training Matrix')", "book_append_sheet(wb, ws, 'Induction Training Matrix')"],
    ['`training-matrix${', '`induction-training-matrix${'],
    ['>Training Matrix<', '>Induction Training Matrix<'],
    ['[manage-sop][api]', '[induction-manage-sop][api]'],
    ['[manage-sop]', '[induction-manage-sop]'],
  ];

  let result = content;
  for (const [from, to] of replacements) {
    result = result.split(from).join(to);
  }
  return result;
}

function transformTree(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) transformTree(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      fs.writeFileSync(full, transformContent(content));
    }
  }
}

function createModelFromTemplate(srcRel, destRel, extraReplacements = []) {
  let content = fs.readFileSync(path.join(root, srcRel), 'utf8');
  content = transformContent(content);
  for (const [from, to] of extraReplacements) {
    content = content.split(from).join(to);
  }
  const dest = path.join(root, destRel);
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, content);
}

// Models
createModelFromTemplate('models/TrainingMatrixUpload.ts', 'models/InductionTrainingMatrixUpload.ts');
createModelFromTemplate('models/TrainingMatrixRecord.ts', 'models/InductionTrainingMatrixRecord.ts', [
  ["ref: 'InductionTrainingMatrixUpload'", "ref: 'InductionTrainingMatricesUpload'"],
]);
createModelFromTemplate('models/MatrixSOPAssignment.ts', 'models/InductionMatrixSOPAssignment.ts');
createModelFromTemplate('models/MatrixEntryData.ts', 'models/InductionMatrixEntryData.ts', [
  ["ref: 'InductionMatrixSOPAssignment'", "ref: 'InductionMatricesSOPAssignment'"],
]);

// Cache libs
createModelFromTemplate('lib/trainingMatrixCache.ts', 'lib/inductionTrainingMatrixCache.ts');
createModelFromTemplate('lib/manageSopViewCache.ts', 'lib/inductionManageSopViewCache.ts');

// API routes
const apiSrc = path.join(root, 'app/api/training-matrix');
const apiDest = path.join(root, 'app/api/induction-training-matrix');
if (fs.existsSync(apiDest)) fs.rmSync(apiDest, { recursive: true, force: true });
copyDir(apiSrc, apiDest);
transformTree(apiDest);

// Pages
const pageSrc = path.join(root, 'app/training-matrix');
const pageDest = path.join(root, 'app/induction-training-matrix');
if (fs.existsSync(pageDest)) fs.rmSync(pageDest, { recursive: true, force: true });
copyDir(pageSrc, pageDest);
transformTree(pageDest);

console.log('Induction training matrix scaffold created successfully.');
