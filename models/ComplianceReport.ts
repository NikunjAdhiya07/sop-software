import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComplianceFindingDetail {
  guidelineId: mongoose.Types.ObjectId;
  guidelineName: string;
  folderName: string;
  clauseNumber: string;
  clauseTitle: string;
  complianceLevel: "compliant" | "partial" | "non-compliant" | "not-applicable" | "analysis-failed";
  matchConfidence: number;
  issueSeverity: "critical" | "major" | "minor" | "informational";
  sopSectionAffected: string;
  mismatchExplanation: string;
  sopTextSnippet: string;
  guidelineRequirement: string;
  suggestedAction: string;
  suggestedText: string;
  estimatedEffort: "low" | "medium" | "high";
  reviewStatus?: "pending" | "accepted" | "disputed" | "implemented";
}

export interface IComplianceReport extends Document {
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  sopVersion: string;
  department: string;

  analysisStatus: "pending" | "in-progress" | "completed" | "failed" | "partial-failure";
  analysisCompletedAt?: Date;

  overallScore: number;
  complianceStatus:
    | "Fully Compliant"
    | "Partially Compliant"
    | "Non-Compliant"
    | "Not Applicable"
    | "Analysis Pending"
    | "Analysis Failed";

  totalGuidelinesChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  notApplicableCount: number;

  findings: IComplianceFindingDetail[];

  analyzedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ComplianceReportSchema = new Schema<IComplianceReport>(
  {
    sopId: { type: Schema.Types.ObjectId, ref: "SOP", required: true, index: true },
    sopIdentifier: { type: String, required: true, trim: true, index: true },
    sopName: { type: String, required: true, trim: true },
    sopVersion: { type: String, default: "1.0", trim: true },
    department: { type: String, required: true, trim: true, index: true },

    analysisStatus: {
      type: String,
      enum: ["pending", "in-progress", "completed", "failed", "partial-failure"],
      default: "pending",
      index: true,
    },
    analysisCompletedAt: { type: Date },

    overallScore: { type: Number, min: 0, max: 10, default: 0 },
    complianceStatus: {
      type: String,
      enum: [
        "Fully Compliant",
        "Partially Compliant",
        "Non-Compliant",
        "Not Applicable",
        "Analysis Pending",
        "Analysis Failed",
      ],
      default: "Analysis Pending",
      index: true,
    },

    totalGuidelinesChecked: { type: Number, default: 0 },
    compliantCount: { type: Number, default: 0 },
    partialCount: { type: Number, default: 0 },
    nonCompliantCount: { type: Number, default: 0 },
    notApplicableCount: { type: Number, default: 0 },

    findings: [
      {
        guidelineId: { type: Schema.Types.ObjectId, ref: "Guideline" },
        guidelineName: { type: String },
        folderName: { type: String },
        clauseNumber: { type: String },
        clauseTitle: { type: String },
        complianceLevel: {
          type: String,
          enum: ["compliant", "partial", "non-compliant", "not-applicable", "analysis-failed"],
        },
        matchConfidence: { type: Number, min: 0, max: 100 },
        issueSeverity: {
          type: String,
          enum: ["critical", "major", "minor", "informational"],
          default: "minor",
        },
        sopSectionAffected: { type: String },
        mismatchExplanation: { type: String },
        sopTextSnippet: { type: String },
        guidelineRequirement: { type: String },
        suggestedAction: { type: String },
        suggestedText: { type: String },
        estimatedEffort: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        reviewStatus: {
          type: String,
          enum: ["pending", "accepted", "disputed", "implemented"],
          default: "pending",
        },
      },
    ],

    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ComplianceReportSchema.index({ analyzedAt: -1 });
ComplianceReportSchema.index({ department: 1, complianceStatus: 1 });
ComplianceReportSchema.index({ sopIdentifier: 1, analysisStatus: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.ComplianceReport) {
  delete mongoose.models.ComplianceReport;
}

const ComplianceReport: Model<IComplianceReport> =
  mongoose.models.ComplianceReport ||
  mongoose.model<IComplianceReport>("ComplianceReport", ComplianceReportSchema);

export default ComplianceReport;
