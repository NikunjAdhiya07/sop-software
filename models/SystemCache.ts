import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Generic durable key/value snapshot store. Used to persist expensive,
 * infrequently-changing API payloads (e.g. the Training Matrix overview) so a
 * cold process / new serverless instance can serve the last-good snapshot
 * instantly instead of recomputing from scratch.
 */
export interface ISystemCache extends Document {
  key: string;
  payload: unknown;
  computedAt: number;
  updatedAt: Date;
}

const SystemCacheSchema = new Schema<ISystemCache>(
  {
    key: { type: String, required: true, unique: true, index: true },
    payload: { type: Schema.Types.Mixed },
    computedAt: { type: Number, default: () => Date.now() },
  },
  { timestamps: true, minimize: false },
);

const SystemCache: Model<ISystemCache> =
  mongoose.models.SystemCache ||
  mongoose.model<ISystemCache>("SystemCache", SystemCacheSchema);

export default SystemCache;
