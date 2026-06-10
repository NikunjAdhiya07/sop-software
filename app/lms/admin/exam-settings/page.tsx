'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Save, Loader2, AlertCircle, Check,
  ClipboardList, Timer, Hash, RotateCcw, Eye, Shuffle, Plus, Trash2, Award,
} from 'lucide-react';

interface PassingScoreRule {
  employeeId?: string;
  employeeName?: string;
  department: string;
  designation: string;
  passingScore: number;
}

interface EmployeeMeta {
  id: string;
  name: string;
  department: string;
  designation: string;
}

interface ExamSettings {
  examQuestionCount: number;
  trialQuestionCount: number;
  passingScore: number;
  passingScoreRules: PassingScoreRule[];
  timeLimitMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswersAfterTrial: boolean;
  allowRetakeAfterPass: boolean;
  maxAttempts: number;
}

const DEFAULT: ExamSettings = {
  examQuestionCount: 20,
  trialQuestionCount: 5,
  passingScore: 70,
  passingScoreRules: [],
  timeLimitMinutes: 0,
  shuffleQuestions: true,
  shuffleOptions: false,
  showAnswersAfterTrial: true,
  allowRetakeAfterPass: true,
  maxAttempts: 0,
};

function NumberInput({
  label, description, value, onChange, min, max, unit,
}: {
  label: string; description: string; value: number;
  onChange: (v: number) => void; min: number; max?: number; unit?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v) && v >= min && (!max || v <= max)) onChange(v);
          }}
          className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm font-semibold focus:border-purple-300 focus:outline-none"
        />
        {unit && <span className="text-xs text-gray-400 shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function Toggle({
  label, description, checked, onChange,
}: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          checked ? 'bg-purple-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

// ─── Passing score rules component ───────────────────────────────────────────

const selectCls = 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-purple-300 focus:outline-none';

function PassingScoreRulesSection({
  rules, defaultScore, onChange,
}: {
  rules: PassingScoreRule[];
  defaultScore: number;
  onChange: (rules: PassingScoreRule[]) => void;
}) {
  const [departments,  setDepartments]  = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [employees,    setEmployees]    = useState<EmployeeMeta[]>([]);
  const [metaLoading,  setMetaLoading]  = useState(true);

  const [empId,  setEmpId]  = useState('');
  const [dept,   setDept]   = useState('');
  const [desig,  setDesig]  = useState('');
  const [score,  setScore]  = useState('');
  const [addErr, setAddErr] = useState('');

  useEffect(() => {
    fetch('/api/lms/admin/meta')
      .then((r) => r.json())
      .then((d) => {
        setDepartments(d.departments  ?? []);
        setDesignations(d.designations ?? []);
        setEmployees(d.employees      ?? []);
      })
      .finally(() => setMetaLoading(false));
  }, []);

  // When an employee is selected, auto-fill their dept/desig
  const handleEmpChange = (id: string) => {
    setEmpId(id);
    if (!id) return;
    const emp = employees.find((e) => e.id === id);
    if (emp) { setDept(emp.department); setDesig(emp.designation); }
  };

  const addRule = () => {
    setAddErr('');
    if (!empId && !dept && !desig) {
      setAddErr('Select an employee, a department, or a designation.');
      return;
    }
    const s = Number(score);
    if (!score || isNaN(s) || s < 1 || s > 100) { setAddErr('Score must be 1–100.'); return; }

    // Duplicate check
    const dup = rules.find((r) =>
      (empId ? r.employeeId === empId : !r.employeeId) &&
      r.department.toLowerCase() === dept.toLowerCase() &&
      r.designation.toLowerCase() === desig.toLowerCase(),
    );
    if (dup) { setAddErr('A rule for this combination already exists.'); return; }

    const emp = employees.find((e) => e.id === empId);
    onChange([...rules, {
      employeeId:   empId || undefined,
      employeeName: emp?.name || undefined,
      department:   dept,
      designation:  desig,
      passingScore: s,
    }]);
    setEmpId(''); setDept(''); setDesig(''); setScore('');
  };

  const removeRule = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  const updateScore = (i: number, val: string) => {
    const s = Number(val);
    if (isNaN(s) || s < 1 || s > 100) return;
    onChange(rules.map((r, idx) => idx === i ? { ...r, passingScore: s } : r));
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-purple-600" />
        <h2 className="text-sm font-bold text-gray-800">Passing Score by Department / Designation</h2>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {/* Existing rules */}
        {rules.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            No rules yet — the default score ({defaultScore}%) applies to everyone.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-500">Employee</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-500">Department</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-500">Designation</th>
                <th className="px-4 py-2 text-center font-semibold text-gray-500">Pass %</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">
                    {r.employeeName
                      ? <span className="font-medium text-purple-700">{r.employeeName}</span>
                      : <span className="italic text-gray-400">Any</span>}
                  </td>
                  <td className="px-4 py-2 font-medium text-gray-700">
                    {r.department || <span className="italic text-gray-400">Any</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {r.designation || <span className="italic text-gray-400">Any</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number" min={1} max={100}
                      value={r.passingScore}
                      onChange={(e) => updateScore(i, e.target.value)}
                      className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-xs font-semibold focus:border-purple-300 focus:outline-none"
                    />
                    <span className="ml-1 text-gray-400">%</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => removeRule(i)} className="text-gray-300 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Add new rule */}
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Add Rule</p>
          {metaLoading ? (
            <p className="text-xs text-gray-400">Loading employee data…</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              {/* Employee dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Employee (optional)</label>
                <select value={empId} onChange={(e) => handleEmpChange(e.target.value)} className={selectCls} style={{ minWidth: 160 }}>
                  <option value="">— Any employee —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              {/* Department dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Department (blank = any)</label>
                <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
                  <option value="">— Any —</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Designation dropdown */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Designation (blank = any)</label>
                <select value={desig} onChange={(e) => setDesig(e.target.value)} className={selectCls} style={{ minWidth: 130 }}>
                  <option value="">— Any —</option>
                  {designations.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Score */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Pass %</label>
                <input
                  type="number" min={1} max={100}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="80"
                  className={`w-20 ${selectCls}`}
                />
              </div>

              <button
                onClick={addRule}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          )}
          {addErr && <p className="mt-1.5 text-[11px] text-red-600">{addErr}</p>}
          <p className="mt-2 text-[11px] text-gray-400">
            Match priority: Employee &gt; Dept + Designation &gt; Dept only &gt; Designation only &gt; Default ({defaultScore}%)
          </p>
        </div>
      </div>
    </section>
  );
}

export default function ExamSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [settings, setSettings] = useState<ExamSettings>(DEFAULT);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  useEffect(() => {
    fetch('/api/lms/admin/exam-settings')
      .then((r) => r.json())
      .then((d) => { if (d.settings) setSettings({ ...DEFAULT, ...d.settings }); })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/lms/admin/exam-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed to save'); return; }
      setSettings({ ...DEFAULT, ...json.settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/lms/admin" className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-3.5 w-3.5" /> LMS Admin
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-purple-600" />
              <h1 className="text-sm font-bold">Exam Settings</h1>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white shadow transition disabled:opacity-50 ${
              saved ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Preview card */}
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs font-semibold text-purple-700">How the quiz works</p>
          <div className="mt-2 grid gap-3 text-sm text-purple-800 sm:grid-cols-2">
            <span><strong>1st attempt:</strong> Demo Assessment — {settings.trialQuestionCount} questions, no pass/fail{settings.showAnswersAfterTrial ? ', answers shown after' : ''}</span>
            <span><strong>2nd attempt+:</strong> Exam — {settings.examQuestionCount} questions, must score ≥{settings.passingScore}%{settings.timeLimitMinutes > 0 ? `, ${settings.timeLimitMinutes} min limit` : ', no time limit'}</span>
          </div>
        </div>

        {/* Question counts + Pass criteria — side-by-side on wide screens */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Hash className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-bold text-gray-800">Question Count</h2>
            </div>
            <div className="space-y-2">
              <NumberInput
                label="Demo Assessment Questions"
                description="Questions shown on the first attempt (demo — no pass/fail, answers revealed after)."
                value={settings.trialQuestionCount}
                onChange={(v) => set('trialQuestionCount', v)}
                min={1} max={50}
              />
              <NumberInput
                label="Exam Questions"
                description="Questions shown on the 2nd attempt onwards (formal exam)."
                value={settings.examQuestionCount}
                onChange={(v) => set('examQuestionCount', v)}
                min={1} max={200}
              />
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-bold text-gray-800">Pass Criteria</h2>
            </div>
            <div className="space-y-2">
              <NumberInput
                label="Default Passing Score"
                description="Global fallback — applies when no department/designation rule matches."
                value={settings.passingScore}
                onChange={(v) => set('passingScore', v)}
                min={1} max={100} unit="%"
              />
              <NumberInput
                label="Maximum Attempts"
                description="Max number of exam attempts allowed (0 = unlimited)."
                value={settings.maxAttempts}
                onChange={(v) => set('maxAttempts', v)}
                min={0} unit="attempts"
              />
            </div>
          </section>
        </div>

        {/* Passing score rules */}
        <PassingScoreRulesSection
          rules={settings.passingScoreRules}
          defaultScore={settings.passingScore}
          onChange={(rules) => { set('passingScoreRules', rules); setSaved(false); }}
        />

        {/* Time limit + Shuffle + Demo & Retake — 2-col on wide screens */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Timer className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-bold text-gray-800">Time Limit</h2>
            </div>
            <NumberInput
              label="Exam Time Limit"
              description="Minutes allowed to complete the exam. Set to 0 for no limit."
              value={settings.timeLimitMinutes}
              onChange={(v) => set('timeLimitMinutes', v)}
              min={0} unit="minutes"
            />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-bold text-gray-800">Shuffle</h2>
            </div>
            <div className="space-y-2">
              <Toggle
                label="Shuffle Questions"
                description="Randomise the order of questions in each attempt."
                checked={settings.shuffleQuestions}
                onChange={(v) => set('shuffleQuestions', v)}
              />
              <Toggle
                label="Shuffle Answer Options"
                description="Randomise the order of A/B/C/D options for each question."
                checked={settings.shuffleOptions}
                onChange={(v) => set('shuffleOptions', v)}
              />
            </div>
          </section>
        </div>

        {/* Trial + retake */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-600" />
            <h2 className="text-sm font-bold text-gray-800">Demo & Retake</h2>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            <Toggle
              label="Show Answers After Demo"
              description="Display correct answers and explanations after the demo assessment."
              checked={settings.showAnswersAfterTrial}
              onChange={(v) => set('showAnswersAfterTrial', v)}
            />
            <Toggle
              label="Allow Retake After Passing"
              description="Let employees retake the exam even after they have already passed."
              checked={settings.allowRetakeAfterPass}
              onChange={(v) => set('allowRetakeAfterPass', v)}
            />
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700">
              These settings apply globally to all SOPs. Changes take effect immediately for new quiz sessions.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
