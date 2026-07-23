'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertCircle, Award, Check, ClipboardList, Eye, Hash, Loader2, Plus,
  RotateCcw, Save, Shuffle, Timer, Trash2, type LucideIcon,
} from 'lucide-react';
import {
  lmsClientFields,
  LMS_CLIENT_FRESH_MS,
  readLmsClientCache,
  writeLmsClientCache,
  invalidateLmsClientFields,
} from '@/lib/lmsCache';

export interface PassingScoreRule {
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

export interface ExamSettings {
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

export const EXAM_SETTINGS_DEFAULT: ExamSettings = {
  examQuestionCount: 20,
  trialQuestionCount: 5,
  passingScore: 80,
  passingScoreRules: [],
  timeLimitMinutes: 0,
  shuffleQuestions: true,
  shuffleOptions: false,
  showAnswersAfterTrial: true,
  allowRetakeAfterPass: true,
  maxAttempts: 0,
};

type ShuffleMode = 'options' | 'questions' | 'both' | 'none';

const SHUFFLE_OPTIONS: {
  value: ShuffleMode;
  title: string;
  description: string;
}[] = [
  {
    value: 'options',
    title: '1 — Shuffle options',
    description: 'Same questions for every employee; A/B/C/D order is randomised.',
  },
  {
    value: 'questions',
    title: '2 — Shuffle questions',
    description: 'Different questions are drawn for different employees from the bank.',
  },
  {
    value: 'both',
    title: '3 — Shuffle both',
    description: 'Different questions per employee, and options are randomised.',
  },
  {
    value: 'none',
    title: '4 — No shuffle',
    description: 'Same questions and same option order for every employee.',
  },
];

function shuffleModeFromFlags(shuffleQuestions: boolean, shuffleOptions: boolean): ShuffleMode {
  if (shuffleQuestions && shuffleOptions) return 'both';
  if (shuffleQuestions) return 'questions';
  if (shuffleOptions) return 'options';
  return 'none';
}

function flagsFromShuffleMode(mode: ShuffleMode): {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
} {
  return {
    shuffleQuestions: mode === 'questions' || mode === 'both',
    shuffleOptions: mode === 'options' || mode === 'both',
  };
}

/** A titled, bordered card that groups related settings rows vertically. */
function SettingsCard({
  icon: Icon, title, subtitle, children, bodyClassName,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className={bodyClassName ?? 'divide-y divide-gray-100'}>{children}</div>
    </section>
  );
}

function NumberInput({
  label, description, value, onChange, min, max, unit,
}: {
  label: string; description: string; value: number;
  onChange: (v: number) => void; min: number; max?: number; unit?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw);
    let next = Number.isFinite(n) ? Math.round(n) : min;
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    setText(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (raw === '' || /^\d+$/.test(raw)) setText(raw);
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className="w-16 rounded-lg border border-gray-300 bg-white px-2 py-2 text-center text-sm font-bold text-gray-900 shadow-sm transition focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
        />
        {unit && <span className="text-xs font-semibold text-gray-700">{unit}</span>}
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
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${
          checked ? 'bg-purple-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

const selectCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 transition focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100';

function PassingScoreRulesSection({
  rules, defaultScore, onChange,
}: {
  rules: PassingScoreRule[];
  defaultScore: number;
  onChange: (rules: PassingScoreRule[]) => void;
}) {
  const [departments, setDepartments] = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeMeta[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const [empId, setEmpId] = useState('');
  const [dept, setDept] = useState('');
  const [desig, setDesig] = useState('');
  const [score, setScore] = useState('');
  const [addErr, setAddErr] = useState('');

  useEffect(() => {
    const cached = readLmsClientCache<{
      departments: string[];
      designations: string[];
      employees: EmployeeMeta[];
    }>(lmsClientFields.adminMeta);
    if (cached?.value) {
      setDepartments(cached.value.departments ?? []);
      setDesignations(cached.value.designations ?? []);
      setEmployees(cached.value.employees ?? []);
      setMetaLoading(false);
      if (Date.now() - cached.cachedAt <= LMS_CLIENT_FRESH_MS) return;
    }
    fetch('/api/lms/admin/meta')
      .then((r) => r.json())
      .then((d) => {
        setDepartments(d.departments ?? []);
        setDesignations(d.designations ?? []);
        setEmployees(d.employees ?? []);
        writeLmsClientCache(lmsClientFields.adminMeta, d);
      })
      .finally(() => setMetaLoading(false));
  }, []);

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

    const dup = rules.find((r) =>
      (empId ? r.employeeId === empId : !r.employeeId) &&
      r.department.toLowerCase() === dept.toLowerCase() &&
      r.designation.toLowerCase() === desig.toLowerCase(),
    );
    if (dup) { setAddErr('A rule for this combination already exists.'); return; }

    const emp = employees.find((e) => e.id === empId);
    onChange([...rules, {
      employeeId: empId || undefined,
      employeeName: emp?.name || undefined,
      department: dept,
      designation: desig,
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
    <SettingsCard
      icon={Award}
      title="Passing Score by Department / Designation"
      subtitle="Override the default score for specific people, departments, or roles."
      bodyClassName=""
    >
      {rules.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-gray-400">
          No rules yet — the default score ({defaultScore}%) applies to everyone.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-100 bg-gray-50/70">
              <tr>
                <th className="px-5 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-500">Employee</th>
                <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-500">Department</th>
                <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-gray-500">Designation</th>
                <th className="px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-gray-500">Pass %</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.map((r, i) => (
                <tr key={i} className="transition hover:bg-gray-50">
                  <td className="whitespace-nowrap px-5 py-3 text-gray-700">
                    {r.employeeName
                      ? <span className="font-semibold text-purple-700">{r.employeeName}</span>
                      : <span className="italic text-gray-400">Any</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-700">
                    {r.department || <span className="italic text-gray-400">Any</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {r.designation || <span className="italic text-gray-400">Any</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center rounded-lg border border-gray-200 transition focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100">
                      <input
                        type="number" min={1} max={100}
                        value={r.passingScore}
                        onChange={(e) => updateScore(i, e.target.value)}
                        className="w-12 bg-transparent py-1.5 pl-2 text-center text-xs font-bold text-gray-800 focus:outline-none"
                      />
                      <span className="pr-2 text-gray-400">%</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => removeRule(i)}
                      className="rounded-md p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                      title="Remove rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Add Rule</p>
        {metaLoading ? (
          <p className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading employee data…
          </p>
        ) : (
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Employee (optional)</label>
              <select value={empId} onChange={(e) => handleEmpChange(e.target.value)} className={selectCls}>
                <option value="">— Any employee —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Department</label>
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={selectCls}>
                <option value="">— Any —</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Designation</label>
              <select value={desig} onChange={(e) => setDesig(e.target.value)} className={selectCls}>
                <option value="">— Any —</option>
                {designations.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">Pass %</label>
              <input
                type="number" min={1} max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="80"
                className={selectCls}
              />
            </div>
            <div className="lg:col-span-2">
              <button
                onClick={addRule}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add Rule
              </button>
            </div>
          </div>
        )}
        {addErr && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-red-600">
            <AlertCircle className="h-3.5 w-3.5" /> {addErr}
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          Match priority: Employee &gt; Dept + Designation &gt; Dept only &gt; Designation only &gt; Default ({defaultScore}%)
        </p>
      </div>
    </SettingsCard>
  );
}

export function useExamSettings() {
  const [settings, setSettings] = useState<ExamSettings>(EXAM_SETTINGS_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = readLmsClientCache<{ settings: ExamSettings }>(lmsClientFields.adminExamSettings);
    if (cached?.value?.settings) {
      setSettings({ ...EXAM_SETTINGS_DEFAULT, ...cached.value.settings });
      setLoading(false);
      if (Date.now() - cached.cachedAt <= LMS_CLIENT_FRESH_MS) return;
    }
    fetch('/api/lms/admin/exam-settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setSettings({ ...EXAM_SETTINGS_DEFAULT, ...d.settings });
          writeLmsClientCache(lmsClientFields.adminExamSettings, d);
        }
      })
      .catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const patch = (partial: Partial<ExamSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
    setSaved(false);
  };

  const save = async () => {
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
      const merged = { ...EXAM_SETTINGS_DEFAULT, ...json.settings };
      setSettings(merged);
      writeLmsClientCache(lmsClientFields.adminExamSettings, { settings: merged });
      // SOP table embeds global defaults — bust that cache so Global-sourced rows refresh.
      invalidateLmsClientFields(lmsClientFields.adminSopExamSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return { settings, set, patch, loading, saving, saved, error, save };
}

export function ExamSettingsForm({
  settings,
  set,
  patch,
  error,
}: {
  settings: ExamSettings;
  set: <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => void;
  patch?: (partial: Partial<ExamSettings>) => void;
  error: string;
}) {
  const setShuffleMode = (mode: ShuffleMode) => {
    const flags = flagsFromShuffleMode(mode);
    if (patch) patch(flags);
    else {
      set('shuffleQuestions', flags.shuffleQuestions);
      set('shuffleOptions', flags.shuffleOptions);
    }
  };
  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* How the quiz works */}
      <div className="overflow-hidden rounded-2xl border border-purple-200 bg-linear-to-br from-purple-50 to-white p-5 shadow-sm">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-purple-600">
          <ClipboardList className="h-3.5 w-3.5" /> How the quiz works
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-purple-100 bg-white/70 p-3.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-[11px] font-bold text-white">1</span>
            <p className="text-sm leading-relaxed text-gray-700">
              <span className="font-semibold text-gray-900">Demo Assessment</span> — {settings.trialQuestionCount === 0 ? 'skipped' : `${settings.trialQuestionCount} questions, no pass/fail${settings.showAnswersAfterTrial ? ', answers shown after' : ''}`}.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-purple-100 bg-white/70 p-3.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-600 text-[11px] font-bold text-white">2</span>
            <p className="text-sm leading-relaxed text-gray-700">
              <span className="font-semibold text-gray-900">Exam (2nd attempt+)</span> — {settings.examQuestionCount} questions, must score ≥{settings.passingScore}%{settings.timeLimitMinutes > 0 ? `, ${settings.timeLimitMinutes} min limit` : ', no time limit'}.
            </p>
          </div>
        </div>
      </div>

      <SettingsCard icon={Hash} title="Question Count" subtitle="How many questions appear in each stage.">
        <NumberInput
          label="Demo Assessment Questions"
          description="Questions shown on the first attempt (demo — no pass/fail). Set to 0 to skip the demo."
          value={settings.trialQuestionCount}
          onChange={(v) => set('trialQuestionCount', v)}
          min={0} max={50}
        />
        <NumberInput
          label="Exam Questions"
          description="Questions shown on the 2nd attempt onwards (formal exam)."
          value={settings.examQuestionCount}
          onChange={(v) => set('examQuestionCount', v)}
          min={1} max={200}
        />
      </SettingsCard>

      <SettingsCard icon={ClipboardList} title="Pass Criteria" subtitle="The score needed to pass and how many attempts are allowed.">
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
      </SettingsCard>

      <PassingScoreRulesSection
        rules={settings.passingScoreRules}
        defaultScore={settings.passingScore}
        onChange={(rules) => set('passingScoreRules', rules)}
      />

      <SettingsCard icon={Timer} title="Time Limit" subtitle="Cap how long learners have to finish the exam.">
        <NumberInput
          label="Exam Time Limit"
          description="Minutes allowed to complete the exam. Set to 0 for no limit."
          value={settings.timeLimitMinutes}
          onChange={(v) => set('timeLimitMinutes', v)}
          min={0} unit="minutes"
        />
      </SettingsCard>

      <SettingsCard icon={Shuffle} title="Shuffle Mode" subtitle="Four ways to present questions to employees.">
        <div className="space-y-2 px-5 py-4">
          {SHUFFLE_OPTIONS.map((opt) => {
            const active = shuffleModeFromFlags(settings.shuffleQuestions, settings.shuffleOptions) === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setShuffleMode(opt.value)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                  active
                    ? 'border-purple-300 bg-purple-50 ring-2 ring-purple-100'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? 'border-purple-600' : 'border-gray-400'
                  }`}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-purple-600" />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${active ? 'text-purple-900' : 'text-gray-900'}`}>
                    {opt.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-700">
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard icon={Eye} title="Demo & Retake" subtitle="Control answer visibility and post-pass retakes.">
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
      </SettingsCard>

      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-700">
          These are the <span className="font-semibold">default</span> settings used when a SOP has no custom override.
          Edit per-SOP values from{' '}
          <Link href="/lms/admin" className="font-semibold underline underline-offset-2 hover:text-amber-900">
            SOP Exam Settings
          </Link>
          . Changes take effect immediately for new quiz sessions.
        </p>
      </div>
    </div>
  );
}

export function ExamSettingsSaveButton({
  saving, saved, onSave,
}: {
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white shadow transition disabled:opacity-50 ${
        saved ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-700'
      }`}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
      {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
    </button>
  );
}
