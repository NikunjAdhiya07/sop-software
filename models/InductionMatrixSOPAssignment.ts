import mongoose, { Document, Schema } from 'mongoose';

export interface IInductionMatrixSOPAssignment extends Document {
  department: string;
  sopId: mongoose.Types.ObjectId;
  sopCode: string;
  sopName: string;
  effectiveMonth: number;
  effectiveYear: number;
  designationApplicability: string[];
  isActive: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InductionMatrixSOPAssignmentSchema = new Schema<IInductionMatrixSOPAssignment>(
  {
    department:               { type: String, required: true, index: true },
    sopId:                    { type: Schema.Types.ObjectId, ref: 'SOP', required: true },
    sopCode:                  { type: String, required: true, index: true },
    sopName:                  { type: String, required: true },
    effectiveMonth:           { type: Number, required: true, min: 1, max: 12 },
    effectiveYear:            { type: Number, required: true },
    designationApplicability: { type: [String], default: [] },
    isActive:                 { type: Boolean, default: true, index: true },
    deletedAt:                { type: Date },
    deletedBy:                { type: String },
    createdBy:                { type: String, required: true },
    updatedBy:                { type: String },
  },
  { timestamps: true },
);

export default mongoose.models.InductionMatricesSOPAssignment ||
  mongoose.model<IInductionMatrixSOPAssignment>('InductionMatricesSOPAssignment', InductionMatrixSOPAssignmentSchema, 'inductionmatricessopassignment');
