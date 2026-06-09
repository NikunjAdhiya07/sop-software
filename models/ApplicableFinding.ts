import mongoose, { Schema, Document, Model } from "mongoose";

export interface IApplicableFinding extends Document {
  reportId: mongoose.Types.ObjectId;
  sopId: mongoose.Types.ObjectId;
  sopIdentifier: string;
  sopName: string;
  department: string;

  sopSection: string;
  sopSectionTitle: string;
  sopSectionNumber: string;

  findings: {
    findingId: string;
    guidelineName: string;
    clauseNumber: string;
    clauseTitle: string;
    issueSeverity: "critical" | "major" | "minor" | "informational";
    specificGap: string;
    suggestedAction: string;
    proposedVerbiage: string;
    markedAt: Date;
  }[];

  compiledVerbiage: string;
  compilationMethod: "auto" | "manual" | "hybrid";
  compiledAt?: Date;

  implementationStatus: "pending" | "in-progress" | "completed" | "rejected";
  implementedAt?: Date;
  implementationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicableFindingSchema = new Schema<IApplicableFinding>(
  {
    reportId: { type: Schema.Types.ObjectId, ref: "ComplianceReport", required: true, index: true },
    sopId: { type: Schema.Types.ObjectId, ref: "SOP", required: true, index: true },
    sopIdentifier: { type: String, required: true, trim: true },
    sopName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true, index: true },

    sopSection: { type: String, required: true, trim: true, index: true },
    sopSectionTitle: { type: String, required: true, trim: true },
    sopSectionNumber: { type: String, required: true, trim: true },

    findings: [
      {
        findingId: { type: String, required: true },
        guidelineName: { type: String, required: true },
        clauseNumber: { type: String, required: true },
        clauseTitle: { type: String, required: true },
        issueSeverity: {
          type: String,
          enum: ["critical", "major", "minor", "informational"],
          required: true,
        },
        specificGap: { type: String, required: true },
        suggestedAction: { type: String, required: true },
        proposedVerbiage: { type: String, required: true },
        markedAt: { type: Date, default: Date.now },
      },
    ],

    compiledVerbiage: { type: String, default: "" },
    compilationMethod: {
      type: String,
      enum: ["auto", "manual", "hybrid"],
      default: "auto",
    },
    compiledAt: { type: Date },

    implementationStatus: {
      type: String,
      enum: ["pending", "in-progress", "completed", "rejected"],
      default: "pending",
      index: true,
    },
    implementedAt: { type: Date },
    implementationNotes: { type: String },
  },
  { timestamps: true },
);

ApplicableFindingSchema.index({ sopId: 1, sopSection: 1 });
ApplicableFindingSchema.index({ reportId: 1 });
ApplicableFindingSchema.index({ department: 1, implementationStatus: 1 });

const ApplicableFinding: Model<IApplicableFinding> =
  mongoose.models.ApplicableFinding ||
  mongoose.model<IApplicableFinding>("ApplicableFinding", ApplicableFindingSchema);

export default ApplicableFinding;
