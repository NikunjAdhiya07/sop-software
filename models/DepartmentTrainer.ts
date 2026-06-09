import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepartmentTrainer extends Document {
  departmentName?: string;
  trainerName: string;
  sopIdentifier?: string;
  sopName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentTrainerSchema = new Schema<IDepartmentTrainer>({
  departmentName: { type: String, required: false, trim: true },
  sopIdentifier:  { type: String, required: false, trim: true, index: { sparse: true } },
  sopName:        { type: String, required: false, trim: true },
  trainerName:    { type: String, required: true, trim: true },
}, { timestamps: true });

const DepartmentTrainer: Model<IDepartmentTrainer> =
  (mongoose.models.DepartmentTrainer as Model<IDepartmentTrainer>) ||
  mongoose.model<IDepartmentTrainer>('DepartmentTrainer', DepartmentTrainerSchema);

export default DepartmentTrainer;
