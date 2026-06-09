import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComplianceAnalysisJob extends Document {
  jobId: string;
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  department: string;

  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;

  totalClauses: number;
  clausesAnalyzed: number;
  clausesFailed: number;
  currentSopName?: string;

  complianceReportId?: mongoose.Types.ObjectId;
  overallScore?: number;
  complianceStatus?: string;

  jobErrors: {
    errorMessage: string;
    affectedStep: string;
    timestamp: Date;
  }[];

  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  processingTimeMs: number;

  isActive: boolean;
  canRetry: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const ComplianceAnalysisJobSchema = new Schema<IComplianceAnalysisJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    sopId: { type: Schema.Types.ObjectId, ref: "SOP", required: true, index: true },
    sopIdentifier: { type: String, required: true },
    sopName: { type: String, required: true },
    department: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
      index: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    currentStep: { type: String, default: "initializing" },

    totalClauses: { type: Number, default: 0 },
    clausesAnalyzed: { type: Number, default: 0 },
    clausesFailed: { type: Number, default: 0 },
    currentSopName: { type: String },

    complianceReportId: { type: Schema.Types.ObjectId, ref: "ComplianceReport" },
    overallScore: { type: Number, min: 0, max: 10 },
    complianceStatus: { type: String },

    jobErrors: [
      {
        errorMessage: { type: String, required: true },
        affectedStep: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    queuedAt: { type: Date, default: Date.now, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    processingTimeMs: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true, index: true },
    canRetry: { type: Boolean, default: true },
  },
  { timestamps: true },
);

ComplianceAnalysisJobSchema.index({ status: 1, queuedAt: -1 });
ComplianceAnalysisJobSchema.index({ sopId: 1, createdAt: -1 });
ComplianceAnalysisJobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const ComplianceAnalysisJob: Model<IComplianceAnalysisJob> =
  mongoose.models.ComplianceAnalysisJob ||
  mongoose.model<IComplianceAnalysisJob>("ComplianceAnalysisJob", ComplianceAnalysisJobSchema);

export default ComplianceAnalysisJob;
