import mongoose, { Document, Schema } from 'mongoose';

export type QualificationStatus = 'qualified' | 'not_qualified' | 'pending' | 'expired';
export type TrainingStatus = 'completed' | 'in_progress' | 'not_started' | 'retraining_required';

export interface IMatrixEntryData extends Document {
  department: string;
  employeeName: string;
  designation: string;
  sopCode: string;
  sopAssignmentId?: mongoose.Types.ObjectId;
  month: number;
  year: number;
  trainingStatus: TrainingStatus;
  qualificationStatus: QualificationStatus;
  trainingDate?: Date;
  retrainingDate?: Date;
  trainerName?: string;
  evaluationResult?: string;
  competencyStatus?: string;
  remarks?: string;
  deletedAt?: Date;
  deletedBy?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MatrixEntryDataSchema = new Schema<IMatrixEntryData>(
  {
    department:          { type: String, required: true, index: true },
    employeeName:        { type: String, required: true, index: true },
    designation:         { type: String, default: '' },
    sopCode:             { type: String, required: true, index: true },
    sopAssignmentId:     { type: Schema.Types.ObjectId, ref: 'MatrixSOPAssignment' },
    month:               { type: Number, required: true },
    year:                { type: Number, required: true },
    trainingStatus:      { type: String, enum: ['completed', 'in_progress', 'not_started', 'retraining_required'], default: 'not_started' },
    qualificationStatus: { type: String, enum: ['qualified', 'not_qualified', 'pending', 'expired'], default: 'pending' },
    trainingDate:        { type: Date },
    retrainingDate:      { type: Date },
    trainerName:         { type: String },
    evaluationResult:    { type: String },
    competencyStatus:    { type: String },
    remarks:             { type: String },
    deletedAt:           { type: Date },
    deletedBy:           { type: String },
    createdBy:           { type: String, default: 'migration' },
    updatedBy:           { type: String },
  },
  { timestamps: true },
);

MatrixEntryDataSchema.index({ department: 1, year: 1, month: 1 });
MatrixEntryDataSchema.index({ employeeName: 1, department: 1 });

// The migrated data lives in the `matrixentries` collection (not the mongoose default).
export default mongoose.models.MatrixEntryData ||
  mongoose.model<IMatrixEntryData>('MatrixEntryData', MatrixEntryDataSchema, 'matrixentries');
