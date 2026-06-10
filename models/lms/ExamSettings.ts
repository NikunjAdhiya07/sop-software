import mongoose, { Schema, Document } from 'mongoose';

export interface IPassingScoreRule {
  employeeId?: string;   // if set, matches this specific employee (highest priority)
  employeeName?: string; // display label only
  department: string;    // empty = match any department
  designation: string;   // empty = match any designation
  passingScore: number;
}

export interface IExamSettings extends Document {
  settingsKey: string;
  examQuestionCount: number;
  trialQuestionCount: number;
  /** Global default passing score (used when no rule matches). */
  passingScore: number;
  /** Per-department/designation overrides. Most specific match wins. */
  passingScoreRules: IPassingScoreRule[];
  timeLimitMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswersAfterTrial: boolean;
  allowRetakeAfterPass: boolean;
  maxAttempts: number;
  updatedAt: Date;
  createdAt: Date;
}

const PassingScoreRuleSchema = new Schema<IPassingScoreRule>(
  {
    employeeId:   { type: String, default: '' },
    employeeName: { type: String, default: '' },
    department:   { type: String, default: '' },
    designation:  { type: String, default: '' },
    passingScore: { type: Number, required: true, min: 1, max: 100 },
  },
  { _id: false },
);

const ExamSettingsSchema = new Schema<IExamSettings>(
  {
    settingsKey:          { type: String, default: 'global', unique: true },
    examQuestionCount:    { type: Number, default: 20,  min: 1, max: 200 },
    trialQuestionCount:   { type: Number, default: 5,   min: 1, max: 50  },
    passingScore:         { type: Number, default: 70,  min: 1, max: 100 },
    passingScoreRules:    { type: [PassingScoreRuleSchema], default: [] },
    timeLimitMinutes:     { type: Number, default: 0,   min: 0           },
    shuffleQuestions:     { type: Boolean, default: true  },
    shuffleOptions:       { type: Boolean, default: false },
    showAnswersAfterTrial:{ type: Boolean, default: true  },
    allowRetakeAfterPass: { type: Boolean, default: true  },
    maxAttempts:          { type: Number, default: 0,   min: 0           },
  },
  { timestamps: true },
);

export function resolvePassingScore(
  rules: IPassingScoreRule[],
  department: string,
  designation: string,
  globalDefault: number,
  employeeId?: string,
): number {
  const dept = (department || '').toLowerCase();
  const desig = (designation || '').toLowerCase();

  // 0. Employee-specific rule (highest priority)
  if (employeeId) {
    const byEmployee = rules.find((r) => r.employeeId && r.employeeId === employeeId);
    if (byEmployee) return byEmployee.passingScore;
  }

  // 1. Both dept + designation set and match
  const exact = rules.find(
    (r) => !r.employeeId && r.department && r.designation &&
      r.department.toLowerCase() === dept &&
      r.designation.toLowerCase() === desig,
  );
  if (exact) return exact.passingScore;

  // 2. Dept only (no designation filter on the rule)
  const byDept = rules.find(
    (r) => !r.employeeId && r.department && !r.designation &&
      r.department.toLowerCase() === dept,
  );
  if (byDept) return byDept.passingScore;

  // 3. Designation only (no dept filter on the rule)
  const byDesig = rules.find(
    (r) => !r.employeeId && !r.department && r.designation &&
      r.designation.toLowerCase() === desig,
  );
  if (byDesig) return byDesig.passingScore;

  return globalDefault;
}

export default mongoose.models.ExamSettings ||
  mongoose.model<IExamSettings>('ExamSettings', ExamSettingsSchema);
