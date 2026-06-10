import mongoose, { Schema, Document } from 'mongoose';

export type PracticalStatus = 'pending' | 'approved' | 'rejected';

export interface IPracticalAssessment extends Document {
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  designation: string;
  department: string;
  sopCode: string;
  sopName: string;
  status: PracticalStatus;
  requestedAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  score?: number;        // 0-100
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PracticalAssessmentSchema = new Schema<IPracticalAssessment>(
  {
    employeeId:   { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeName: { type: String, required: true },
    designation:  { type: String, required: true },
    department:   { type: String, required: true },
    sopCode:      { type: String, required: true },
    sopName:      { type: String, default: '' },
    status:       { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt:  { type: Date, default: Date.now },
    reviewedBy:   { type: String },
    reviewedAt:   { type: Date },
    score:        { type: Number, min: 0, max: 100 },
    remarks:      { type: String },
  },
  { timestamps: true },
);

PracticalAssessmentSchema.index({ employeeId: 1, sopCode: 1 });
PracticalAssessmentSchema.index({ status: 1, requestedAt: -1 });
PracticalAssessmentSchema.index({ department: 1, status: 1 });

export default mongoose.models.PracticalAssessment ||
  mongoose.model<IPracticalAssessment>('PracticalAssessment', PracticalAssessmentSchema);
