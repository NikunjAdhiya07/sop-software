import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITrainingMatrix extends Document {
  employeeName: string;
  employeeCode?: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  trainingDate: Date;
  scheduledWeek?: string;
  trainerName?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Trained' | 'Retest Required';
  testSessionId?: mongoose.Types.ObjectId;
  score?: number;
  passStatus?: 'Pass' | 'Fail' | 'Not Taken';
  sourceFile: string;
  extractedAt: Date;
  attemptCount: number;
  retestRequired: boolean;
  wrongAnswers?: Array<{
    question: string;
    selectedAnswer: string;
    correctAnswer: string;
    sopName?: string;
  }>;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  linkedUserId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TrainingMatrixSchema = new Schema<ITrainingMatrix>({
  employeeName: { type: String, required: true, trim: true, index: true },
  employeeCode: { type: String, trim: true, index: true },
  department: { type: String, required: true, trim: true, index: true },
  sopIdentifier: { type: String, required: true, trim: true, index: true },
  sopName: { type: String, trim: true },
  trainingDate: { type: Date, required: true, index: true },
  scheduledWeek: { type: String, trim: true, index: true },
  trainerName: { type: String, trim: true, index: true },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Trained', 'Retest Required'],
    default: 'Pending',
    trim: true,
  },
  testSessionId: { type: Schema.Types.ObjectId, ref: 'TestSession' },
  score: { type: Number },
  passStatus: {
    type: String,
    enum: ['Pass', 'Fail', 'Not Taken'],
    default: 'Not Taken',
  },
  sourceFile: { type: String, required: true },
  extractedAt: { type: Date, default: Date.now },
  attemptCount: { type: Number, default: 0 },
  retestRequired: { type: Boolean, default: false },
  wrongAnswers: [{
    question: String,
    selectedAnswer: String,
    correctAnswer: String,
    sopName: String,
  }],
  acknowledgedAt: { type: Date },
  acknowledgedBy: { type: String, trim: true },
  linkedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const TrainingMatrix: Model<ITrainingMatrix> = mongoose.models.TrainingMatrix
  || mongoose.model<ITrainingMatrix>('TrainingMatrix', TrainingMatrixSchema, 'trainingmatrixes');

export default TrainingMatrix;
