import mongoose, { Schema, Document, Model } from "mongoose";

export type SopFilesImportStatus = "queued" | "running" | "completed" | "failed";
export type SopFilesImportScope = "main" | "annexure" | "prior";
export type SopFilesImportFileStatus =
  | "imported"
  | "duplicate"
  | "obsolete_routed"
  | "failed"
  | "prior_relocated";

export interface ISopFilesImportFileResult {
  relativePath: string;
  fileName: string;
  status: SopFilesImportFileStatus;
  identifier?: string;
  checksum?: string;
  message?: string;
}

export interface ISopFilesImportJob extends Document {
  status: SopFilesImportStatus;
  phase: string;
  percent: number;
  totals: {
    scanned: number;
    imported: number;
    skipped: number;
    failed: number;
    annexures: number;
    obsoleteRouted: number;
    priorRelocated: number;
  };
  files: ISopFilesImportFileResult[];
  scopes?: SopFilesImportScope[];
  parentIdentifier?: string;
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FileResultSchema = new Schema<ISopFilesImportFileResult>(
  {
    relativePath: { type: String, required: true },
    fileName: { type: String, required: true },
    status: {
      type: String,
      enum: ["imported", "duplicate", "obsolete_routed", "failed", "prior_relocated"],
      required: true,
    },
    identifier: String,
    checksum: String,
    message: String,
  },
  { _id: false },
);

const SopFilesImportJobSchema = new Schema<ISopFilesImportJob>(
  {
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    phase: { type: String, default: "Queued" },
    percent: { type: Number, default: 0 },
    totals: {
      scanned: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      annexures: { type: Number, default: 0 },
      obsoleteRouted: { type: Number, default: 0 },
      priorRelocated: { type: Number, default: 0 },
    },
    files: { type: [FileResultSchema], default: [] },
    scopes: {
      type: [String],
      enum: ["main", "annexure", "prior"],
      default: ["main", "annexure", "prior"],
    },
    parentIdentifier: String,
    error: String,
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
  },
  { timestamps: true },
);

if (mongoose.models.SopFilesImportJob) delete mongoose.models.SopFilesImportJob;
const SopFilesImportJob: Model<ISopFilesImportJob> = mongoose.model<ISopFilesImportJob>(
  "SopFilesImportJob",
  SopFilesImportJobSchema,
);
export default SopFilesImportJob;
