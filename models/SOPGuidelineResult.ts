import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISOPGuidelineResult extends Document {
  sopId?: mongoose.Types.ObjectId;
  sopNo: string;
  sopName: string;
  overallScore: number;
  clausesAnalyzed: number;
  guidelineDocumentsUsed: number;
  guidelineIds: string[];
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SOPGuidelineResultSchema = new Schema<ISOPGuidelineResult>(
  {
    sopId: { type: Schema.Types.ObjectId, ref: "SOP", index: true },
    sopNo: { type: String, required: true, trim: true, index: true },
    sopName: { type: String, default: "" },
    overallScore: { type: Number, default: 0 },
    clausesAnalyzed: { type: Number, default: 0 },
    guidelineDocumentsUsed: { type: Number, default: 0 },
    guidelineIds: [{ type: String }],
    runAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

SOPGuidelineResultSchema.index({ sopNo: 1 }, { unique: true });

const SOPGuidelineResult: Model<ISOPGuidelineResult> =
  mongoose.models.SOPGuidelineResult ||
  mongoose.model<ISOPGuidelineResult>("SOPGuidelineResult", SOPGuidelineResultSchema);

export default SOPGuidelineResult;
