import mongoose, { Document, Schema } from 'mongoose';

export type TrainingStatus = 'completed' | 'not_required' | 'na' | 'pending';

export interface IInductionTrainingMatrixRecord extends Document {
  uploadId: mongoose.Types.ObjectId;
  department: string;
  employeeName: string;
  designation: string;
  sopCode: string;
  sopName?: string;
  month: number;
  year: number;
  monthName: string;
  status: TrainingStatus;
  rawSymbol: string;
  version?: string;
  sourceFile: string;
  isAddendum: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const InductionTrainingMatrixRecordSchema = new Schema<IInductionTrainingMatrixRecord>({
  uploadId:     { type: Schema.Types.ObjectId, ref: 'InductionTrainingMatricesUpload', required: true, index: true },
  department:   { type: String, required: true, index: true },
  employeeName: { type: String, required: true, index: true },
  designation:  { type: String, default: '' },
  sopCode:      { type: String, required: true, index: true },
  sopName:      { type: String },
  month:        { type: Number, required: true },
  year:         { type: Number, required: true },
  monthName:    { type: String, required: true },
  status:       { type: String, enum: ['completed', 'not_required', 'na', 'pending'], required: true },
  rawSymbol:    { type: String, default: '' },
  version:      { type: String },
  sourceFile:   { type: String, default: '' },
  isAddendum:   { type: Boolean, default: false },
}, { timestamps: true });

InductionTrainingMatrixRecordSchema.index({ department: 1, year: 1, month: 1 });
InductionTrainingMatrixRecordSchema.index({ year: 1, status: 1 });
InductionTrainingMatrixRecordSchema.index({ employeeName: 1, department: 1 });
InductionTrainingMatrixRecordSchema.index({ status: 1, sopCode: 1, department: 1, designation: 1, month: 1 });
InductionTrainingMatrixRecordSchema.index({ sourceFile: 1, sopCode: 1, department: 1, month: 1 });

export default mongoose.models.InductionTrainingMatricesRecord ||
  mongoose.model<IInductionTrainingMatrixRecord>('InductionTrainingMatricesRecord', InductionTrainingMatrixRecordSchema, 'inductiontrainingmatricesrecord');
