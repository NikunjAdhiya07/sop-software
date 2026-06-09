import mongoose, { Schema, Document, Model } from "mongoose";

export interface IComplianceFindingDetail {
  guidelineId: mongoose.Types.ObjectId;
  guidelineName: string;
  folderName: string;
  pdfName: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  complianceLevel: "compliant" | "partial" | "non-compliant" | "not-applicable" | "analysis-failed";
  matchConfidence: number;
  issueType:
    | "missing-clause"
    | "partial-coverage"
    | "incorrect-implementation"
    | "outdated-practice"
    | "ambiguous-wording"
    | "no-issue"
    | "not-applicable";
  issueSeverity: "critical" | "major" | "minor" | "informational";
  sopSectionAffected: string;
  mismatchExplanation: string;
  highlightedIssue: string;
  sopTextSnippet: string;
  guidelineRequirement: string;
  suggestedAction: string;
  suggestedText: string;
  estimatedEffort: "low" | "medium" | "high";
  priority: number;
  analyzedAt: Date;
  aiModelUsed: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewStatus?: "pending" | "accepted" | "disputed" | "implemented";
  reviewNotes?: string;
}

export interface IComplianceReport extends Document {
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  sopVersion: string;
  department: string;
  sopContentLength: number;

  analysisStatus: "pending" | "in-progress" | "completed" | "failed" | "partial-failure";
  analysisStartedAt: Date;
  analysisCompletedAt?: Date;
  analysisEngine: string;
  processingTimeMs: number;

  guidelinesUsed: {
    guidelineId: mongoose.Types.ObjectId;
    guidelineName: string;
    folderName: string;
    totalClauses: number;
    clausesChecked: number;
  }[];

  overallScore: number;
  complianceStatus:
    | "Fully Compliant"
    | "Partially Compliant"
    | "Non-Compliant"
    | "Not Applicable"
    | "Analysis Pending"
    | "Analysis Failed";
  compliancePercentage: number;

  scoreBreakdown: {
    totalChecks: number;
    compliantCount: number;
    partialCount: number;
    nonCompliantCount: number;
    notApplicableCount: number;
    skippedCount: number;
  };

  findings: IComplianceFindingDetail[];

  totalGuidelinesChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
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
    sopContentLength: { type: Number, default: 0 },

    analysisStatus: {
      type: String,
      enum: ["pending", "in-progress", "completed", "failed", "partial-failure"],
      default: "pending",
      index: true,
    },
    analysisStartedAt: { type: Date, default: Date.now },
    analysisCompletedAt: { type: Date },
    analysisEngine: { type: String, default: "gemini-2.0-flash" },
    processingTimeMs: { type: Number, default: 0 },

    guidelinesUsed: [
      {
        guidelineId: { type: Schema.Types.ObjectId, ref: "Guideline" },
        guidelineName: { type: String },
        folderName: { type: String },
        totalClauses: { type: Number },
        clausesChecked: { type: Number },
      },
    ],

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
    compliancePercentage: { type: Number, min: 0, max: 100, default: 0 },

    scoreBreakdown: {
      totalChecks: { type: Number, default: 0 },
      compliantCount: { type: Number, default: 0 },
      partialCount: { type: Number, default: 0 },
      nonCompliantCount: { type: Number, default: 0 },
      notApplicableCount: { type: Number, default: 0 },
      skippedCount: { type: Number, default: 0 },
    },

    findings: [
      {
        guidelineId: { type: Schema.Types.ObjectId, ref: "Guideline" },
        guidelineName: { type: String },
        folderName: { type: String },
        pdfName: { type: String },
        clauseNumber: { type: String },
        clauseTitle: { type: String },
        clauseText: { type: String },
        complianceLevel: {
          type: String,
          enum: ["compliant", "partial", "non-compliant", "not-applicable", "analysis-failed"],
        },
        matchConfidence: { type: Number, min: 0, max: 100 },
        issueType: {
          type: String,
          enum: [
            "missing-clause",
            "partial-coverage",
            "incorrect-implementation",
            "outdated-practice",
            "ambiguous-wording",
            "no-issue",
            "not-applicable",
          ],
        },
        issueSeverity: {
          type: String,
          enum: ["critical", "major", "minor", "informational"],
          default: "minor",
        },
        sopSectionAffected: { type: String },
        mismatchExplanation: { type: String },
        highlightedIssue: { type: String },
        sopTextSnippet: { type: String },
        guidelineRequirement: { type: String },
        suggestedAction: { type: String },
        suggestedText: { type: String },
        estimatedEffort: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        priority: { type: Number, min: 1, max: 5, default: 3 },
        analyzedAt: { type: Date, default: Date.now },
        aiModelUsed: { type: String, default: "gemini-2.0-flash" },
        reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
        reviewStatus: {
          type: String,
          enum: ["pending", "accepted", "disputed", "implemented"],
          default: "pending",
        },
        reviewNotes: { type: String },
      },
    ],

    totalGuidelinesChecked: { type: Number, default: 0 },
    compliantCount: { type: Number, default: 0 },
    partialCount: { type: Number, default: 0 },
    nonCompliantCount: { type: Number, default: 0 },
    analyzedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ComplianceReportSchema.index({ analyzedAt: -1 });
ComplianceReportSchema.index({ department: 1, complianceStatus: 1 });
ComplianceReportSchema.index({ analysisStatus: 1, analysisCompletedAt: -1 });
ComplianceReportSchema.index({ sopIdentifier: 1, analysisStatus: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.ComplianceReport) {
  delete mongoose.models.ComplianceReport;
}

const ComplianceReport: Model<IComplianceReport> =
  mongoose.models.ComplianceReport ||
  mongoose.model<IComplianceReport>("ComplianceReport", ComplianceReportSchema);

export default ComplianceReport;
