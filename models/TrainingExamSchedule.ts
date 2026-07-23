import mongoose, { Document, Schema } from 'mongoose';

export type ExamScheduleScope = 'department' | 'employee';
export type ExamScheduleStatus = 'scheduled' | 'completed' | 'cancelled';

export interface ITrainingExamSchedule extends Document {
  sopCode: string;
  sopName?: string;
  department: string;
  year: number;
  plannedMonth: number;
  examDate: Date;
  scope: ExamScheduleScope;
  employeeName?: string;
  employeeId?: string;
  status: ExamScheduleStatus;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingExamScheduleSchema = new Schema<ITrainingExamSchedule>(
  {
    sopCode: { type: String, required: true, index: true, uppercase: true, trim: true },
    sopName: { type: String, trim: true },
    department: { type: String, required: true, index: true, trim: true },
    year: { type: Number, required: true, index: true },
    plannedMonth: { type: Number, required: true, min: 1, max: 12 },
    examDate: { type: Date, required: true, index: true },
    scope: {
      type: String,
      enum: ['department', 'employee'],
      required: true,
      default: 'department',
      index: true,
    },
    employeeName: { type: String, trim: true },
    employeeId: { type: String, trim: true },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  { timestamps: true },
);

TrainingExamScheduleSchema.index({ year: 1, examDate: 1 });
TrainingExamScheduleSchema.index({ sopCode: 1, department: 1, year: 1, plannedMonth: 1 });
TrainingExamScheduleSchema.index({ employeeName: 1, year: 1 }, { sparse: true });
// One active department schedule per SOP × dept × planned month × year
TrainingExamScheduleSchema.index(
  { sopCode: 1, department: 1, year: 1, plannedMonth: 1, scope: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: 'department', status: { $ne: 'cancelled' } },
  },
);
// One active employee override per SOP × dept × planned month × year × employee
TrainingExamScheduleSchema.index(
  { sopCode: 1, department: 1, year: 1, plannedMonth: 1, employeeName: 1, scope: 1 },
  {
    unique: true,
    partialFilterExpression: { scope: 'employee', status: { $ne: 'cancelled' } },
  },
);

export default mongoose.models.TrainingExamSchedule ||
  mongoose.model<ITrainingExamSchedule>(
    'TrainingExamSchedule',
    TrainingExamScheduleSchema,
    'trainingexamschedules',
  );
