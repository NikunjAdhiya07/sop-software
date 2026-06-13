import mongoose, { Document, Schema } from 'mongoose';

export interface IInductionTrainingMatrixEmployeeSnapshot {
  name: string;
  designation: string;
  training: Record<string, boolean>;
}

export interface IInductionTrainingMatrixSnapshot {
  sopCodes: string[];
  sopMonthMap: Record<string, string>;
  monthCounts: Record<string, number>;
  employees: IInductionTrainingMatrixEmployeeSnapshot[];
}

export interface IInductionTrainingMatrixUpload extends Document {
  department: string;
  fileName: string;
  fileType: 'main' | 'addendum';
  month: number;
  year: number;
  monthName: string;
  employeeCount: number;
  sopCount: number;
  recordsImported: number;
  uploadedAt: Date;
  uploadedBy?: string;
  fileUrl?: string;
  bunnyPath?: string;
  snapshot?: IInductionTrainingMatrixSnapshot;
}

const InductionTrainingMatrixUploadSchema = new Schema<IInductionTrainingMatrixUpload>({
  department:      { type: String, required: true },
  fileName:        { type: String, required: true },
  fileType:        { type: String, enum: ['main', 'addendum'], default: 'main' },
  month:           { type: Number, required: true, min: 1, max: 12 },
  year:            { type: Number, required: true },
  monthName:       { type: String, required: true },
  employeeCount:   { type: Number, default: 0 },
  sopCount:        { type: Number, default: 0 },
  recordsImported: { type: Number, default: 0 },
  uploadedAt:      { type: Date, default: Date.now },
  uploadedBy:      { type: String },
  fileUrl:         { type: String },
  bunnyPath:       { type: String },
  snapshot:        { type: Schema.Types.Mixed },
});

InductionTrainingMatrixUploadSchema.index({ department: 1, year: 1, month: 1 });

export default mongoose.models.InductionTrainingMatricesUpload ||
  mongoose.model<IInductionTrainingMatrixUpload>('InductionTrainingMatricesUpload', InductionTrainingMatrixUploadSchema, 'inductiontrainingmatricesupload');
