import mongoose, { Schema, Document } from 'mongoose';

export interface ICertificate extends Document {
  certificateNumber: string;
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  designation: string;
  department: string;
  sopCode: string;
  sopName: string;
  sopVersion?: string;
  completedAt: Date;
  quizScore: number;       // 0 if no quiz
  hasPractical: boolean;   // true if practical assessment was approved
  practicalScore?: number;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CertificateSchema = new Schema<ICertificate>(
  {
    certificateNumber: { type: String, required: true, unique: true },
    employeeId:   { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    employeeName: { type: String, required: true },
    designation:  { type: String, required: true },
    department:   { type: String, required: true },
    sopCode:      { type: String, required: true },
    sopName:      { type: String, required: true },
    sopVersion:   { type: String },
    completedAt:  { type: Date, required: true },
    quizScore:    { type: Number, default: 0 },
    hasPractical: { type: Boolean, default: false },
    practicalScore: { type: Number },
    issuedAt:     { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CertificateSchema.index({ employeeId: 1, sopCode: 1 });

export default mongoose.models.Certificate ||
  mongoose.model<ICertificate>('Certificate', CertificateSchema);
