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
  clauseText?: string;
  guidelineSourceLine?: string;
  guidelineLineNumber?: string;
  guidelineSearchPhrase?: string;
  suggestedAction: string;
  suggestedText: string;
  impactAnalysis?: string;
  estimatedEffort: "low" | "medium" | "high";
  reviewStatus?: "pending" | "accepted" | "disputed" | "implemented";

  // ── Structured regulatory audit fields (V5) ──
  findingCategory?: string;
  riskLevel?: string;
  guidelineReference?: string;
  evidenceFound?: string;
  evidenceMissing?: string;
  evidenceStrength?: string;
  pageNumber?: string;
  paragraphNumber?: string;
  requiresManualReview?: boolean;
  findingType?: string;
  rootCauseKey?: string;
  mergedClauseRefs?: string[];
  applicability?: string;
  requirementCriticality?: string;
  scopeOwner?: string;
  whyApplies?: string;
  whyEvidenceInsufficient?: string;
  whyScoreReduced?: string;

  /** Persisted gap tracking (compliance remediation system) */
  gapId?: string;
  resolved?: boolean;
  lastReviewedAt?: Date;
  sopTextHash?: string;
  requirementHash?: string;
}

export interface ITraceabilityMatrixEntry {
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  guidelineName: string;
  folderName: string;
  applicable: boolean;
  complianceStatus: string;
  supportingSopSection: string;
  confidenceScore: number;
}

export interface ICrossSopDependency {
  referencedType: string;
  referenceText: string;
  found: boolean;
  status: string;
  matchedSopIdentifier?: string;
  matchedSopName?: string;
  riskLevel: string;
  note: string;
}

export interface IAuditCompleteness {
  totalGuidelinesReviewed: number;
  totalChaptersReviewed: number;
  totalClausesReviewed: number;
  applicableClauses: number;
  notApplicableClauses: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  criticalFindings: number;
  majorFindings: number;
  minorFindings: number;
  improvementOpportunities: number;
  clauseCoveragePct: number;
  sopCoveragePct: number;
  overallScore: number;
}

export interface IComplianceScoreBreakdown {
  totalApplicableRequirements: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  improvementCount: number;
  notApplicableCount: number;
  formula: string;
  score: number;
  scoringMethod?: string;
  weightedAchieved?: number;
  weightedTotal?: number;
  criticalRequirementCount?: number;
  majorRequirementCount?: number;
  minorRequirementCount?: number;
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

  // ── Structured regulatory audit aggregates (V5) ──
  criticalCount?: number;
  majorCount?: number;
  minorCount?: number;
  improvementCount?: number;
  bestPracticeCount?: number;
  clauseCoveragePct?: number;
  scoreBreakdown?: IComplianceScoreBreakdown;
  auditCompleteness?: IAuditCompleteness;
  traceabilityMatrix?: ITraceabilityMatrixEntry[];
  crossSopDependencies?: ICrossSopDependency[];
  analysisEngineVersion?: string;

  /** Content hashes for incremental review cache invalidation */
  sopContentHash?: string;
  guidelineSetHash?: string;
  /** Per-guideline content hashes — enables skipping unchanged guidelines on re-runs */
  guidelineHashes?: Map<string, string>;

  /**
   * Whether linked annexure file text was included when this report was analyzed
   * against guidelines. `undefined` on legacy reports = unknown / not checked.
   * Prefer `annexureStatus` for display.
   */
  annexuresChecked?: boolean;
  /**
   * - none: no annexure connected to the SOP
   * - checked: connected annexures were included in the guideline audit (done)
   * - not-checked: annexures are connected but this run did not audit them
   * - linked-unread: annexures are connected but text could not be extracted
   */
  annexureStatus?: "none" | "checked" | "not-checked" | "linked-unread";
  linkedAnnexureCount?: number;
  annexureChars?: number;
  annexuresIncluded?: { label: string; fileName: string; chars: number }[];
  annexuresSkipped?: { label: string; fileName: string; reason: string }[];

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
        clauseText: { type: String },
        guidelineSourceLine: { type: String },
        guidelineLineNumber: { type: String },
        guidelineSearchPhrase: { type: String },
        suggestedAction: { type: String },
        suggestedText: { type: String },
        impactAnalysis: { type: String },
        estimatedEffort: { type: String, enum: ["low", "medium", "high"], default: "medium" },
        reviewStatus: {
          type: String,
          enum: ["pending", "accepted", "disputed", "implemented"],
          default: "pending",
        },

        // ── Structured regulatory audit fields (V5) ──
        findingCategory: { type: String },
        riskLevel: { type: String },
        guidelineReference: { type: String },
        evidenceFound: { type: String },
        evidenceMissing: { type: String },
        evidenceStrength: { type: String },
        pageNumber: { type: String },
        paragraphNumber: { type: String },
        requiresManualReview: { type: Boolean, default: false },
        findingType: { type: String },
        rootCauseKey: { type: String },
        mergedClauseRefs: { type: [String], default: undefined },
        applicability: { type: String },
        requirementCriticality: { type: String },
        scopeOwner: { type: String },
        whyApplies: { type: String },
        whyEvidenceInsufficient: { type: String },
        whyScoreReduced: { type: String },

        gapId: { type: String, trim: true, index: true },
        resolved: { type: Boolean, default: false },
        lastReviewedAt: { type: Date },
        sopTextHash: { type: String, trim: true },
        requirementHash: { type: String, trim: true },
      },
    ],

    sopContentHash: { type: String, trim: true },
    guidelineSetHash: { type: String, trim: true },
    guidelineHashes: { type: Map, of: String },

    annexuresChecked: { type: Boolean, index: true },
    annexureStatus: {
      type: String,
      enum: ["none", "checked", "not-checked", "linked-unread"],
      index: true,
    },
    linkedAnnexureCount: { type: Number, default: 0 },
    annexureChars: { type: Number, default: 0 },
    annexuresIncluded: {
      type: [
        {
          label: { type: String, default: "" },
          fileName: { type: String, default: "" },
          chars: { type: Number, default: 0 },
        },
      ],
      default: undefined,
    },
    annexuresSkipped: {
      type: [
        {
          label: { type: String, default: "" },
          fileName: { type: String, default: "" },
          reason: { type: String, default: "" },
        },
      ],
      default: undefined,
    },

    criticalCount: { type: Number, default: 0 },
    majorCount: { type: Number, default: 0 },
    minorCount: { type: Number, default: 0 },
    improvementCount: { type: Number, default: 0 },
    bestPracticeCount: { type: Number, default: 0 },
    clauseCoveragePct: { type: Number, default: 0 },
    analysisEngineVersion: { type: String },

    auditCompleteness: {
      totalGuidelinesReviewed: { type: Number },
      totalChaptersReviewed: { type: Number },
      totalClausesReviewed: { type: Number },
      applicableClauses: { type: Number },
      notApplicableClauses: { type: Number },
      compliantCount: { type: Number },
      partialCount: { type: Number },
      nonCompliantCount: { type: Number },
      criticalFindings: { type: Number },
      majorFindings: { type: Number },
      minorFindings: { type: Number },
      improvementOpportunities: { type: Number },
      clauseCoveragePct: { type: Number },
      sopCoveragePct: { type: Number },
      overallScore: { type: Number },
    },

    scoreBreakdown: {
      totalApplicableRequirements: { type: Number },
      compliantCount: { type: Number },
      partialCount: { type: Number },
      nonCompliantCount: { type: Number },
      improvementCount: { type: Number },
      notApplicableCount: { type: Number },
      formula: { type: String },
      score: { type: Number },
      scoringMethod: { type: String },
      weightedAchieved: { type: Number },
      weightedTotal: { type: Number },
      criticalRequirementCount: { type: Number },
      majorRequirementCount: { type: Number },
      minorRequirementCount: { type: Number },
    },

    traceabilityMatrix: [
      {
        clauseNumber: { type: String },
        clauseTitle: { type: String },
        clauseText: { type: String },
        guidelineName: { type: String },
        folderName: { type: String },
        applicable: { type: Boolean },
        complianceStatus: { type: String },
        supportingSopSection: { type: String },
        confidenceScore: { type: Number },
      },
    ],

    crossSopDependencies: [
      {
        referencedType: { type: String },
        referenceText: { type: String },
        found: { type: Boolean },
        status: { type: String },
        matchedSopIdentifier: { type: String },
        matchedSopName: { type: String },
        riskLevel: { type: String },
        note: { type: String },
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
