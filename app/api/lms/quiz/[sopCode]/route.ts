import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/mongodb';
import { verifyLmsToken, LMS_COOKIE } from '@/lib/lms-session';
import MCQBank from '@/models/MCQBank';
import Employee from '@/models/Employee';
import ExamSettings, { resolvePassingScore } from '@/models/lms/ExamSettings';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ sopCode: string }> };

// GET /api/lms/quiz/[sopCode]?mode=trial|exam
// Pulls questions from MCQBank (embedded mcqs array), converts to A/B/C/D format.
export async function GET(req: NextRequest, { params }: Params) {
  const jar = await cookies();
  const payload = verifyLmsToken(jar.get(LMS_COOKIE)?.value);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { sopCode } = await params;
  const mode = req.nextUrl.searchParams.get('mode') === 'trial' ? 'trial' : 'exam';

  try {
    await connectDB();

    const settings = await ExamSettings.findOneAndUpdate(
      { settingsKey: 'global' },
      { $setOnInsert: { settingsKey: 'global' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    const count = mode === 'trial'
      ? (settings?.trialQuestionCount ?? 5)
      : (settings?.examQuestionCount ?? 20);

    // Resolve passing score for this specific employee
    const employee = await Employee.findById(payload.sub)
      .select('department designation').lean();
    const passingScore = resolvePassingScore(
      settings?.passingScoreRules ?? [],
      employee?.department ?? '',
      employee?.designation ?? '',
      settings?.passingScore ?? 70,
      payload.sub,
    );

    const escaped = sopCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Unwind embedded questions, sample, then project into A/B/C/D shape
    const raw = await MCQBank.aggregate([
      {
        $match: {
          sopIdentifier: { $regex: new RegExp(`^${escaped}`, 'i') },
          isObsolete: { $ne: true },
          language: 'English',
        },
      },
      { $unwind: '$mcqs' },
      // Exclude questions flagged as duplicates
      { $match: { 'mcqs.isSimilar': { $ne: true } } },
      { $sample: { size: count } },
      {
        $project: {
          _id: 0,
          bankId: '$_id',
          question:      '$mcqs.question',
          options:       '$mcqs.options',
          correctAnswer: '$mcqs.correctAnswer',
          explanation:   '$mcqs.explanation',
        },
      },
    ]);

    // Convert options array + text correctAnswer → optionA/B/C/D + letter correctAnswer
    const questions = raw.map((q, i) => {
      const opts: string[] = Array.isArray(q.options) ? q.options : [];
      // correctAnswer might already be a letter (A/B/C/D) or the full text
      let letter: 'A' | 'B' | 'C' | 'D' = 'A';
      const letters = ['A', 'B', 'C', 'D'] as const;
      if (['A', 'B', 'C', 'D'].includes(q.correctAnswer)) {
        letter = q.correctAnswer as 'A' | 'B' | 'C' | 'D';
      } else {
        const idx = opts.findIndex(
          (o) => o.trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase(),
        );
        if (idx >= 0 && idx < 4) letter = letters[idx];
      }
      return {
        _id: `${String(q.bankId)}_${i}`,
        question:      q.question,
        optionA:       opts[0] ?? '',
        optionB:       opts[1] ?? '',
        optionC:       opts[2] ?? '',
        optionD:       opts[3] ?? '',
        correctAnswer: letter,
        explanation:   q.explanation ?? '',
      };
    });

    return NextResponse.json({
      questions,
      mode,
      settings: {
        passingScore:          passingScore,
        timeLimitMinutes:      settings?.timeLimitMinutes      ?? 0,
        shuffleOptions:        settings?.shuffleOptions        ?? false,
        showAnswersAfterTrial: settings?.showAnswersAfterTrial ?? true,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
