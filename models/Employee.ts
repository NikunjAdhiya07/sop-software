import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployee extends Document {
  name: string;
  designation: string;
  department: string;
  employeeId?: string;
  isActive: boolean;
  /** Auto-generated login handle for the learning module. */
  lmsUsername?: string;
  /** bcrypt hash of the learning-module password (never returned to the client). */
  lmsPasswordHash?: string;
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
    // Casing is preserved (e.g. "Abbas.Mehdi"); login matches case-insensitively.
    lmsUsername: { type: String, trim: true, unique: true, sparse: true },
    // select:false keeps the hash out of every normal query result.
    lmsPasswordHash: { type: String, select: false },
  },
  { timestamps: true },
);

EmployeeSchema.index({ department: 1, isActive: 1 });

export default mongoose.models.Employee ||
  mongoose.model<IEmployee>('Employee', EmployeeSchema);
