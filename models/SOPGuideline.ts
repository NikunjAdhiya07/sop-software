import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISOPGuidelineClause {
  clauseNumber: string;
  clauseTitle: string;
  clauseText: string;
  keywords: string[];
  embedding?: number[];
}

export interface ISOPGuideline extends Document {
  name: string;
  folderName: string;
  filePath: string;
  pdfName: string;
  isScanned: boolean;
  ocrStatus: "pending" | "processing" | "completed" | "failed";
  rawText: string;
  clauses: ISOPGuidelineClause[];
  guidelineType?: string;
  category?: string;
  version?: string;
  effectiveDate?: Date;
  checklistItems: string[];
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SOPGuidelineSchema = new Schema<ISOPGuideline>(
  {
    name: { type: String, required: true, trim: true },
    folderName: { type: String, required: true, trim: true },
    filePath: { type: String, required: true },
    pdfName: { type: String, required: true, trim: true },
    isScanned: { type: Boolean, default: false },
    ocrStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    rawText: { type: String, default: "" },
    clauses: [
      {
        clauseNumber: { type: String, required: true },
        clauseTitle: { type: String, required: true },
        clauseText: { type: String, required: true },
        keywords: [{ type: String }],
        embedding: [{ type: Number }],
      },
    ],
    guidelineType: { type: String, trim: true },
    category: { type: String, trim: true },
    version: { type: String, trim: true },
    effectiveDate: { type: Date },
    checklistItems: [{ type: String }],
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

SOPGuidelineSchema.index({ folderName: 1, guidelineType: 1 });
SOPGuidelineSchema.index({ category: 1 });
SOPGuidelineSchema.index({ ocrStatus: 1 });
SOPGuidelineSchema.index({ createdAt: -1 });

const SOPGuideline: Model<ISOPGuideline> =
  mongoose.models.SOPGuideline ||
  mongoose.model<ISOPGuideline>("SOPGuideline", SOPGuidelineSchema);

export default SOPGuideline;
