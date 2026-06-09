import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployee extends Document {
  name: string;
  designation: string;
  department: string;
  employeeId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    name:        { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    department:  { type: String, required: true, trim: true, index: true },
    employeeId:  { type: String, trim: true },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

EmployeeSchema.index({ department: 1, isActive: 1 });

export default mongoose.models.Employee ||
  mongoose.model<IEmployee>('Employee', EmployeeSchema);
