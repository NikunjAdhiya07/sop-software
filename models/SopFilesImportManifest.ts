import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISopFilesImportManifest extends Document {
  relativePath: string;
  checksum: string;
  identifier?: string;
  documentKind: "main" | "annexure";
  importedAt: Date;
  jobId?: mongoose.Types.ObjectId;
  archivedPath?: string;
  relocatedTo?: string;
}

const SopFilesImportManifestSchema = new Schema<ISopFilesImportManifest>(
  {
    relativePath: { type: String, required: true },
    checksum: { type: String, required: true, index: true },
    identifier: { type: String, trim: true },
    documentKind: { type: String, enum: ["main", "annexure"], default: "main" },
    importedAt: { type: Date, default: Date.now },
    jobId: { type: Schema.Types.ObjectId, ref: "SopFilesImportJob" },
    archivedPath: String,
    relocatedTo: String,
  },
  { timestamps: true },
);

SopFilesImportManifestSchema.index({ checksum: 1, relativePath: 1 });

if (mongoose.models.SopFilesImportManifest) delete mongoose.models.SopFilesImportManifest;
const SopFilesImportManifest: Model<ISopFilesImportManifest> = mongoose.model<ISopFilesImportManifest>(
  "SopFilesImportManifest",
  SopFilesImportManifestSchema,
);
export default SopFilesImportManifest;
