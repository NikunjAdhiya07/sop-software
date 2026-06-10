'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GraduationCap, LogOut, Search, PlayCircle, BookOpen, Clock,
  CheckCircle2, AlertCircle, ChevronRight, Loader2, RefreshCw,
  FileText, ClipboardList, TrendingUp, Award,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SopAssignment {
  sopCode: string;
  sopName?: string;
  month: number;
  monthName: string;
  year: number;
  trainingType: 'induction' | 'training';
  status?: string;
}

interface Employee {
  id: string;
  name: string;
  designation: string;
  department: string;
}

interface CertRecord {
  _id: string;
  certificateNumber: string;
  sopCode: string;
  sopName: string;
  completedAt: string;
  quizScore: number;
  hasPractical: boolean;
}

interface ProgressRecord {
  sopCode: string;
  status: 'not_started' | 'in_progress' | 'completed';
  overallPercentage: number;
  lastAccessedAt: string;
  completedAt?: string;
}

type FilterTab = 'all' | 'in_progress' | 'completed' | 'overdue' | 'not_started';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(a: SopAssignment): boolean {
  const now = new Date();
  const trainingMonth = new Date(a.year, a.month - 1, 1);
  return trainingMonth < new Date(now.getFullYear(), now.getMonth(), 1);
}

function statusLabel(s: FilterTab): string {
  if (s === 'in_progress')  return 'In Progress';
  if (s === 'completed')    return 'Completed';
  if (s === 'overdue')      return 'Overdue';
  if (s === 'not_started')  return 'Not Started';
  return 'All';
}

function ProgressBar({ pct, color = 'purple' }: { pct: number; color?: string }) {
  const bg = color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-500' : 'bg-purple-500';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full transition-all duration-500 ${bg}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Training card ────────────────────────────────────────────────────────────

function TrainingCard({
  assignment,
  progress,
  onStart,
}: {
  assignment: SopAssignment;
  progress?: ProgressRecord;
  onStart: (sopCode: string) => void;
}) {
  const pct = progress?.overallPercentage ?? 0;
  const status = progress?.status ?? 'not_started';
  const overdue = isOverdue(assignment) && status !== 'completed';

  return (
    <div
      className={`group flex items-center gap-4 rounded-xl border bg-white px-4 py-3.5 shadow-sm transition hover:shadow-md ${
        overdue ? 'border-red-200' : 'border-gray-200 hover:border-purple-200'
      }`}
    >
      {/* Icon */}
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
        status === 'completed' ? 'bg-green-50' : overdue ? 'bg-red-50' : 'bg-purple-50'
      }`}>
        {status === 'completed'
          ? <CheckCircle2 className="h-5 w-5 text-green-600" />
          : status === 'in_progress'
          ? <PlayCircle className="h-5 w-5 text-purple-600" />
          : overdue
          ? <AlertCircle className="h-5 w-5 text-red-500" />
          : <BookOpen className="h-5 w-5 text-purple-400" />}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-gray-700">{assignment.sopCode}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            assignment.trainingType === 'induction'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-sky-100 text-sky-700'
          }`}>
            {assignment.trainingType === 'induction' ? 'Induction' : 'Training'}
          </span>
          {overdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              Overdue
            </span>
          )}
        </div>
        <p className="truncate text-sm font-medium text-gray-800" title={assignment.sopName}>
          {assignment.sopName || assignment.sopCode}
        </p>
        <div className="flex items-center gap-3">
          <ProgressBar pct={pct} color={status === 'completed' ? 'green' : overdue ? 'amber' : 'purple'} />
          <span className="w-10 shrink-0 text-right text-[11px] font-semibold text-gray-400">{pct}%</span>
        </div>
        <p className="text-[11px] text-gray-400">
          {assignment.monthName.slice(0, 3)} {assignment.year}
          {progress?.lastAccessedAt && status === 'in_progress' && (
            <> · Last opened {new Date(progress.lastAccessedAt).toLocaleDateString()}</>
          )}
          {status === 'completed' && progress?.completedAt && (
            <> · Completed {new Date(progress.completedAt).toLocaleDateString()}</>
          )}
        </p>
      </div>

      {/* Action */}
      <button
        onClick={() => onStart(assignment.sopCode)}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
          status === 'completed'
            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            : 'bg-purple-600 text-white shadow hover:bg-purple-700'
        }`}
      >
        {status === 'completed' ? 'Review' : status === 'in_progress' ? 'Continue' : 'Start'}
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Continue learning strip ──────────────────────────────────────────────────

function ContinueLearning({
  assignments,
  progressMap,
  onOpen,
}: {
  assignments: SopAssignment[];
  progressMap: Map<string, ProgressRecord>;
  onOpen: (sopCode: string) => void;
}) {
  const inProgress = assignments
    .filter((a) => progressMap.get(a.sopCode)?.status === 'in_progress')
    .sort((a, b) => {
      const pa = progressMap.get(a.sopCode);
      const pb = progressMap.get(b.sopCode);
      return new Date(pb?.lastAccessedAt ?? 0).getTime() - new Date(pa?.lastAccessedAt ?? 0).getTime();
    })
    .slice(0, 3);

  if (inProgress.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <PlayCircle className="h-4 w-4 text-purple-600" />
        <h2 className="text-sm font-bold text-gray-800">Continue Learning</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {inProgress.map((a) => {
          const p = progressMap.get(a.sopCode)!;
          return (
            <button
              key={a.sopCode}
              onClick={() => onOpen(a.sopCode)}
              className="group relative overflow-hidden rounded-xl border border-purple-200 bg-linear-to-br from-purple-50 to-white p-4 text-left shadow-sm transition hover:shadow-md hover:border-purple-400"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-bold text-purple-700">{a.sopCode}</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 line-clamp-2">{a.sopName || a.sopCode}</p>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white shadow">
                  <PlayCircle className="h-4 w-4" />
                </div>
              </div>
              <ProgressBar pct={p.overallPercentage} />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-400">
                <span>Resume from where you left off</span>
                <span className="font-semibold text-purple-600">{p.overallPercentage}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({
  assignments,
  progressMap,
}: {
  assignments: SopAssignment[];
  progressMap: Map<string, ProgressRecord>;
}) {
  const total      = assignments.length;
  const completed  = assignments.filter((a) => progressMap.get(a.sopCode)?.status === 'completed').length;
  const inProgress = assignments.filter((a) => progressMap.get(a.sopCode)?.status === 'in_progress').length;
  const overdue    = assignments.filter((a) => isOverdue(a) && progressMap.get(a.sopCode)?.status !== 'completed').length;

  const stats = [
    { label: 'Total Assigned', value: total,      Icon: FileText,      color: 'text-gray-600',   bg: 'bg-gray-50'   },
    { label: 'In Progress',    value: inProgress,  Icon: TrendingUp,    color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Completed',      value: completed,   Icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Overdue',        value: overdue,     Icon: AlertCircle,   color: 'text-red-600',    bg: 'bg-red-50'    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map(({ label, value, Icon, color, bg }) => (
        <div key={label} className={`flex items-center gap-4 rounded-xl border border-gray-200 ${bg} px-5 py-4`}>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg} ring-1 ring-inset ring-gray-200`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Login card ───────────────────────────────────────────────────────────────

function LoginCard({ onLogin }: { onLogin: (emp: Employee) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError('Enter your username and password.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lms/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Login failed'); return; }
      onLogin(json.employee);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600 shadow-lg">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-800">Learning Portal</h1>
            <p className="mt-0.5 text-xs text-gray-400">Sign in to access your training</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Abbas.Mehdi"
              autoComplete="username"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono focus:border-purple-300 focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-purple-300 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ employee, onLogout }: { employee: Employee; onLogout: () => void }) {
  const router = useRouter();
  const [assignments, setAssignments] = useState<SopAssignment[]>([]);
  const [progressMap, setProgressMap] = useState<Map<string, ProgressRecord>>(new Map());
  const [certificates, setCertificates] = useState<CertRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<FilterTab>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, progressRes, certRes] = await Promise.all([
        fetch('/api/lms/auth/me'),
        fetch('/api/lms/progress'),
        fetch('/api/lms/certificates'),
      ]);
      if (meRes.status === 401) { router.push('/lms'); return; }
      const meData    = await meRes.json();
      const progData  = await progressRes.json();
      const certData  = certRes.ok ? await certRes.json() : { certificates: [] };
      setAssignments(meData.assignments || []);
      const map = new Map<string, ProgressRecord>();
      for (const p of (progData.progress || []) as ProgressRecord[]) {
        map.set(p.sopCode, p);
      }
      setProgressMap(map);
      setCertificates(certData.certificates || []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const handleSignOut = async () => {
    await fetch('/api/lms/auth/logout', { method: 'POST' });
    onLogout();
  };

  const handleOpen = useCallback((sopCode: string) => {
    router.push(`/lms/journey/${sopCode}`);
  }, [router]);

  const filtered = useMemo(() => {
    let list = assignments;
    if (filter === 'in_progress')  list = list.filter((a) => progressMap.get(a.sopCode)?.status === 'in_progress');
    if (filter === 'completed')    list = list.filter((a) => progressMap.get(a.sopCode)?.status === 'completed');
    if (filter === 'not_started')  list = list.filter((a) => !progressMap.get(a.sopCode) || progressMap.get(a.sopCode)?.status === 'not_started');
    if (filter === 'overdue')      list = list.filter((a) => isOverdue(a) && progressMap.get(a.sopCode)?.status !== 'completed');
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.sopCode.toLowerCase().includes(term) ||
          (a.sopName || '').toLowerCase().includes(term) ||
          a.monthName.toLowerCase().includes(term),
      );
    }
    return list;
  }, [assignments, progressMap, filter, search]);

  const tabCounts = useMemo(() => ({
    all:         assignments.length,
    in_progress: assignments.filter((a) => progressMap.get(a.sopCode)?.status === 'in_progress').length,
    completed:   assignments.filter((a) => progressMap.get(a.sopCode)?.status === 'completed').length,
    not_started: assignments.filter((a) => !progressMap.get(a.sopCode) || progressMap.get(a.sopCode)?.status === 'not_started').length,
    overdue:     assignments.filter((a) => isOverdue(a) && progressMap.get(a.sopCode)?.status !== 'completed').length,
  }), [assignments, progressMap]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">My Training</p>
              <p className="text-[11px] text-gray-400">{employee.name} · {employee.department}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : (
          <>
            {/* Stats */}
            <StatsRow assignments={assignments} progressMap={progressMap} />

            {/* Continue learning */}
            <ContinueLearning assignments={assignments} progressMap={progressMap} onOpen={handleOpen} />

            {/* Certificates */}
            {certificates.length > 0 && (
              <section className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-gray-800">My Certificates</h2>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {certificates.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {certificates.map((cert) => (
                    <button
                      key={cert._id}
                      onClick={() => router.push(`/lms/certificate/${cert.sopCode}`)}
                      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-4 text-left shadow-sm transition hover:shadow-md hover:border-amber-400"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                        <Award className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-amber-700">{cert.sopCode}</p>
                        <p className="truncate text-sm font-semibold text-gray-800">{cert.sopName}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {new Date(cert.completedAt).toLocaleDateString()}
                          {cert.quizScore > 0 && ` · Score: ${cert.quizScore}%`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* My Trainings section */}
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <ClipboardList className="h-4 w-4 text-purple-600" /> My Trainings
                </h2>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search SOP code or name…"
                    className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-purple-300 focus:outline-none"
                  />
                </div>
              </div>

              {/* Filter tabs */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {(['all', 'in_progress', 'not_started', 'completed', 'overdue'] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFilter(tab)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      filter === tab
                        ? tab === 'overdue'
                          ? 'bg-red-600 text-white'
                          : tab === 'completed'
                          ? 'bg-green-600 text-white'
                          : 'bg-purple-600 text-white'
                        : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {statusLabel(tab)}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      filter === tab ? 'bg-white/20' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tabCounts[tab]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Training list */}
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
                  <BookOpen className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">
                    {search ? `No trainings match "${search}"` : `No ${filter !== 'all' ? statusLabel(filter).toLowerCase() : ''} trainings`}
                  </p>
                </div>
              ) : (
                <div className="grid gap-2 xl:grid-cols-2">
                  {filtered.map((a) => (
                    <TrainingCard
                      key={`${a.sopCode}-${a.month}-${a.year}`}
                      assignment={a}
                      progress={progressMap.get(a.sopCode)}
                      onStart={handleOpen}
                    />
                  ))}
                </div>
              )}

              <div className="mt-3 text-center text-xs text-gray-400">
                {filtered.length} of {assignments.length} training{assignments.length !== 1 ? 's' : ''}
              </div>
            </section>

            {/* Overdue warning */}
            {tabCounts.overdue > 0 && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs text-amber-800">
                  You have <strong>{tabCounts.overdue} overdue</strong> training{tabCounts.overdue !== 1 ? 's' : ''}.
                  Please complete them as soon as possible to remain compliant.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

export default function LmsPage() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/lms/auth/me')
      .then((r) => r.json())
      .then((d) => { if (d.employee) setEmployee(d.employee); })
      .catch(() => { /* not logged in */ })
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!employee) {
    return <LoginCard onLogin={setEmployee} />;
  }

  return <Dashboard employee={employee} onLogout={() => setEmployee(null)} />;
}
