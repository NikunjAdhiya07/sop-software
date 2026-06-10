import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import { verifyLmsToken, LMS_COOKIE } from '@/lib/lms-session';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import LearningProgress from '@/models/lms/LearningProgress';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sopCode: string }> };

export interface JourneyStep {
  id: string;
  type: 'video' | 'slides' | 'pdf' | 'quiz';
  label: string;
  urls?: string[];           // video or slides (array of CDN URLs)
  url?: string;              // single PDF/SOP URL
  fileType?: 'pdf' | 'docx'; // sopPdf only
  questionCount?: number;    // quiz only
  attempts?: number;         // quiz only — 0 = trial, ≥1 = exam
  completed: boolean;
  percentage?: number;       // video watch % or quiz score
  lastTimestamp?: number;    // video resume position
}

function toArray(val: string | string[] | undefined | null): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val.filter(Boolean) : [val];
}

// GET /api/lms/journey/[sopCode]
export async function GET(_req: NextRequest, { params }: Params) {
  const jar = await cookies();
  const payload = verifyLmsToken(jar.get(LMS_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sopCode } = await params;

  try {
    await connectDB();

    // Find the best-matching SOP (latest version)
    const sop = await SOP.findOne({
      $or: [
        { identifier: sopCode },
        { sopBaseId: sopCode },
        { identifier: new RegExp(`^${sopCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') },
      ],
      isObsolete: { $ne: true },
    })
      .sort({ versionNum: -1, uploadedAt: -1 })
      .select('name identifier department fileUrl fileType mediaLinks sopDocuments mcqCount')
      .lean();

    // Count MCQ questions from the MCQBank collection for this SOP
    const escaped = sopCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bankDocs = await MCQBank.find({
      sopIdentifier: { $regex: new RegExp(`^${escaped}`, 'i') },
      isObsolete: { $ne: true },
      language: 'English',
    }).select('totalQuestions').lean();
    const mcqCount = bankDocs.reduce((sum, b) => sum + (b.totalQuestions || 0), 0);

    // Build step list from available content
    const videosEn = sop ? toArray(sop.mediaLinks?.videos?.en) : [];
    const videosGu = sop ? toArray(sop.mediaLinks?.videos?.gu) : [];
    const slidesEn = sop ? toArray(sop.mediaLinks?.slides?.en) : [];
    const slidesGu = sop ? toArray(sop.mediaLinks?.slides?.gu) : [];
    const sopPdfUrl = sop?.fileUrl || null;

    // Order: Video(s) → SOP Document → Slides → Quiz
    const availableStepIds: string[] = [];
    if (videosEn.length > 0)  availableStepIds.push('videoEn');
    if (videosGu.length > 0)  availableStepIds.push('videoGu');
    if (sopPdfUrl)             availableStepIds.push('sopPdf');
    if (slidesEn.length > 0)  availableStepIds.push('slidesEn');
    if (slidesGu.length > 0)  availableStepIds.push('slidesGu');
    if (mcqCount > 0)          availableStepIds.push('quiz');

    // Get or create progress record
    let progress = await LearningProgress.findOne({ employeeId: payload.sub, sopCode }).lean();
    if (!progress) {
      // Create initial record so the dashboard can see this SOP is being accessed
      const created = await LearningProgress.create({
        employeeId: payload.sub,
        sopCode,
        availableSteps: availableStepIds,
        status: 'not_started',
        overallPercentage: 0,
        lastAccessedAt: new Date(),
      });
      progress = created.toObject();
    } else if (progress.availableSteps.length === 0 && availableStepIds.length > 0) {
      // Back-fill available steps for existing records
      await LearningProgress.updateOne(
        { _id: progress._id },
        { $set: { availableSteps: availableStepIds } },
      );
      progress = { ...progress, availableSteps: availableStepIds };
    }

    const steps = progress as typeof progress & { steps?: Record<string, unknown> };
    const stepData = steps.steps || {};

    const journeySteps: JourneyStep[] = [];

    // Build steps in the canonical order: Video(s) → SOP Doc → Slides → Quiz
    if (videosEn.length > 0) {
      const s = (stepData.videoEn || {}) as { completed?: boolean; percentage?: number; lastTimestamp?: number };
      journeySteps.push({
        id: 'videoEn', type: 'video', label: 'English Video', urls: videosEn,
        completed: s.completed ?? false,
        percentage: s.percentage ?? 0,
        lastTimestamp: s.lastTimestamp ?? 0,
      });
    }
    if (videosGu.length > 0) {
      const s = (stepData.videoGu || {}) as { completed?: boolean; percentage?: number; lastTimestamp?: number };
      journeySteps.push({
        id: 'videoGu', type: 'video', label: 'Gujarati Video', urls: videosGu,
        completed: s.completed ?? false,
        percentage: s.percentage ?? 0,
        lastTimestamp: s.lastTimestamp ?? 0,
      });
    }
    if (sopPdfUrl) {
      const s = (stepData.sopPdf || {}) as { completed?: boolean };
      journeySteps.push({
        id: 'sopPdf', type: 'pdf', label: 'SOP Document', url: sopPdfUrl,
        fileType: (sop?.fileType === 'docx' ? 'docx' : 'pdf') as 'pdf' | 'docx',
        completed: s.completed ?? false,
      });
    }
    if (slidesEn.length > 0) {
      const s = (stepData.slidesEn || {}) as { completed?: boolean };
      journeySteps.push({
        id: 'slidesEn', type: 'slides', label: 'English Slides (PPT)', urls: slidesEn,
        completed: s.completed ?? false,
      });
    }
    if (slidesGu.length > 0) {
      const s = (stepData.slidesGu || {}) as { completed?: boolean };
      journeySteps.push({
        id: 'slidesGu', type: 'slides', label: 'Gujarati Slides (PPT)', urls: slidesGu,
        completed: s.completed ?? false,
      });
    }
    if (mcqCount > 0) {
      const s = (stepData.quiz || {}) as { completed?: boolean; passed?: boolean; score?: number; attempts?: number };
      journeySteps.push({
        id: 'quiz', type: 'quiz', label: 'Assessment', questionCount: mcqCount,
        completed: s.completed ?? false,
        percentage: s.score,
        attempts: s.attempts ?? 0,
      });
    }

    return NextResponse.json({
      sop: sop
        ? {
            name: sop.name,
            identifier: sop.identifier,
            department: sop.department,
            fileUrl: sop.fileUrl,
            fileType: sop.fileType,
            mcqCount,
          }
        : null,
      progress,
      steps: journeySteps,
      availableSteps: availableStepIds,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
