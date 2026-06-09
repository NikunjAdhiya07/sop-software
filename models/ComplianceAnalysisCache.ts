import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComplianceAnalysisCache extends Document {
  cacheKey: string;
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  guidelineIds: string[];
  result: Record<string, unknown>;
  overallScore: number;
  complianceStatus: string;
  createdAt: Date;
  expiresAt: Date;
}

const ComplianceAnalysisCacheSchema = new Schema<IComplianceAnalysisCache>(
  {
    cacheKey: { type: String, required: true, unique: true, index: true },
    sopId: { type: Schema.Types.ObjectId, ref: "SOP", required: true, index: true },
    sopIdentifier: { type: String, required: true, index: true },
    guidelineIds: [{ type: String }],
    result: { type: Schema.Types.Mixed, required: true },
    overallScore: { type: Number, min: 0, max: 10, default: 0 },
    complianceStatus: { type: String, default: "Analysis Pending" },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

ComplianceAnalysisCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ComplianceAnalysisCache: Model<IComplianceAnalysisCache> =
  mongoose.models.ComplianceAnalysisCache ||
  mongoose.model<IComplianceAnalysisCache>("ComplianceAnalysisCache", ComplianceAnalysisCacheSchema);

export default ComplianceAnalysisCache;
