'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  ArrowLeft, Plus, Search, Pencil, Trash2, X, Check,
  UserRound, RefreshCw, AlertTriangle, FileText, GraduationCap, KeyRound, Copy,
  UserX, UserCheck, Loader2, Trophy,
} from 'lucide-react';

const DEPARTMENTS = ['QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'] as const;
type Dept = (typeof DEPARTMENTS)[number];

const DEPT_COLOR: Record<Dept, string> = {
  QA:           'bg-indigo-100 text-indigo-700',
  QC:           'bg-blue-100 text-blue-700',
  Microbiology: 'bg-emerald-100 text-emerald-700',
  Production:   'bg-amber-100 text-amber-700',
  Store:        'bg-red-100 text-red-700',
  Engineering:  'bg-slate-100 text-slate-700',
  Personnel:    'bg-pink-100 text-pink-700',
};

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
  _id: string;
  name: string;
  designation: string;
  department: string;
  employeeId?: string;
  isActive: boolean;
  lmsUsername?: string;
  hasLmsPassword?: boolean;
  assignments?: SopAssignment[];
}

interface TrainingStatus {
  employeeId: string;
  totalSops: number;
  completedSops: number;
  certCount: number;
  overallPct: number;
  status: 'completed' | 'in_progress' | 'not_started';
}

function AssignmentsModal({
  employeeName,
  assignments,
  onClose,
}: {
  employeeName: string;
  assignments: SopAssignment[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return assignments;
    return assignments.filter(
      (a) =>
        a.sopCode.toLowerCase().includes(term) ||
        (a.sopName || '').toLowerCase().includes(term) ||
        a.monthName.toLowerCase().includes(term) ||
        String(a.year).includes(term) ||
        a.trainingType.toLowerCase().includes(term),
    );
  }, [assignments, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800">Assigned SOPs</h2>
              <p className="text-xs text-gray-400">{employeeName} · {assignments.length} total</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-gray-100 px-5 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              suppressHydrationWarning
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SOP code, name, or month…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-purple-300 focus:outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No SOPs match “{query}”.</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((a) => (
                <div
                  key={`${a.sopCode}-${a.month}-${a.year}`}
                  className="rounded-lg px-2.5 py-2 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-mono font-semibold text-gray-800">{a.sopCode}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500">{a.monthName.slice(0, 3)} {a.year}</span>
                    <span
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.trainingType === 'induction'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {a.trainingType === 'induction' ? 'Induction' : 'Training'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-gray-500" title={a.sopName || a.sopCode}>
                    {a.sopName || <span className="italic text-gray-300">No title available</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-2.5 text-right text-[11px] text-gray-400">
          {filtered.length} of {assignments.length} shown
        </div>
      </div>
    </div>
  );
}

function AssignmentBadge({ employeeName, assignments }: { employeeName: string; assignments: SopAssignment[] }) {
  const [open, setOpen] = useState(false);

  if (assignments.length === 0) {
    return <span className="text-xs text-gray-400">No SOPs assigned</span>;
  }

  return (
    <>
      <button
        suppressHydrationWarning
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
        title={`View ${assignments.length} assigned SOP${assignments.length !== 1 ? 's' : ''}`}
      >
        <FileText className="h-3.5 w-3.5 text-gray-400" />
        <span className="font-semibold">{assignments.length}</span>
      </button>

      {open && (
        <AssignmentsModal
          employeeName={employeeName}
          assignments={assignments}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

function EmployeeModal({
  initial,
  defaultDept,
  onClose,
  onSaved,
}: {
  initial?: Employee;
  defaultDept?: string;
  onClose: () => void;
  onSaved: (emp: Employee) => void;
}) {
  const [name,        setName]        = useState(initial?.name        || '');
  const [designation, setDesignation] = useState(initial?.designation || '');
  const [department,  setDepartment]  = useState(initial?.department  || defaultDept || 'QA');
  const [employeeId,  setEmployeeId]  = useState(initial?.employeeId  || '');
  const [password,    setPassword]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const hasPassword = !!initial?.hasLmsPassword;

  const handleSave = async () => {
    if (!name.trim() || !designation.trim()) { setError('Name and designation are required.'); return; }
    if (password && password.length < 4) { setError('Password must be at least 4 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      const isEdit = !!initial?._id;
      const res = await fetch(isEdit ? `/api/employees/${initial._id}` : '/api/employees', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, designation, department, employeeId, ...(password ? { password } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Save failed'); return; }
      onSaved(json.employee);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-purple-300 focus:outline-none';
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800">{initial ? 'Edit Employee' : 'Add Employee'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className={labelCls}>Full Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" className={inputCls} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Designation *</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Analyst" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Employee ID</label>
              <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="optional" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Department *</label>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Learning-module credentials */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <GraduationCap className="h-3.5 w-3.5 text-purple-500" /> Learning Module Login
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Username</label>
                <input
                  value={initial?.lmsUsername || ''}
                  readOnly
                  disabled
                  placeholder="Generated automatically on save"
                  className={`${inputCls} cursor-not-allowed bg-gray-100 font-mono text-gray-500`}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  {initial?.lmsUsername
                    ? 'Auto-generated. Share this with the employee.'
                    : 'A unique username is created automatically when you save.'}
                </p>
              </div>
              <div>
                <label className={labelCls}>
                  Password {initial ? (hasPassword ? '(set — leave blank to keep)' : '(not set yet)') : '(optional)'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={hasPassword ? '••••••••  enter to reset' : 'Set a password'}
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-gray-400">Minimum 4 characters. The employee uses this to sign in to the learning module.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" /> {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Add Employee')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation ───────────────────────────────────────────────────────

function DeleteConfirm({ employee, onClose, onDeleted }: { employee: Employee; onClose: () => void; onDeleted: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleDelete = async () => {
    setLoading(true);
    const res  = await fetch(`/api/employees/${employee._id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Delete failed'); setLoading(false); return; }
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-bold text-gray-800">Remove Employee</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
            <p>Remove <strong>{employee.name}</strong> ({employee.designation}) from <strong>{employee.department}</strong>?</p>
            <p className="mt-1 text-xs text-red-600">They will no longer appear in the assign-SOP employee list.</p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {loading ? 'Removing…' : 'Yes, Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Generated-credentials modal ───────────────────────────────────────────────

interface GeneratedCredential {
  name: string;
  username: string;
  password: string;
}

function CredentialsModal({
  credentials,
  onClose,
}: {
  credentials: GeneratedCredential[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const copyAll = () => {
    const text = credentials
      .map((c) => `${c.name}\t${c.username}\t${c.password}`)
      .join('\n');
    copy(`Name\tUsername\tPassword\n${text}`, '__all__');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <KeyRound className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800">Logins generated</h2>
              <p className="text-xs text-gray-400">
                {credentials.length} credential{credentials.length !== 1 ? 's' : ''} · copy now, passwords aren’t shown again
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-[11px] text-amber-700">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Passwords are stored encrypted and can’t be retrieved later — share them now.
          </span>
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-700 hover:bg-amber-100"
          >
            {copied === '__all__' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === '__all__' ? 'Copied' : 'Copy all'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2.5">Name</th>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">Password</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {credentials.map((c) => (
                <tr key={c.username} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-800">{c.name}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{c.username}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{c.password}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => copy(`${c.username}\t${c.password}`, c.username)}
                      title="Copy username & password"
                      className="rounded p-1.5 text-gray-400 hover:bg-purple-50 hover:text-purple-600"
                    >
                      {copied === c.username ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-100 px-5 py-3 text-right">
          <button onClick={onClose} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  useAuthGuard();
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeDept, setActiveDept] = useState<Dept | 'All'>('All');
  const [search,     setSearch]     = useState('');
  const [showAdd,    setShowAdd]    = useState(false);
  const [editing,    setEditing]    = useState<Employee | null>(null);
  const [deleting,   setDeleting]   = useState<Employee | null>(null);
  const [togglingId,     setTogglingId]     = useState<string | null>(null);
  const [trainingMap,    setTrainingMap]    = useState<Map<string, TrainingStatus>>(new Map());
  const [generating, setGenerating] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [generatedCreds, setGeneratedCreds] = useState<GeneratedCredential[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, trainingRes] = await Promise.all([
        fetch('/api/employees?includeInactive=1&includeAssignments=1'),
        fetch('/api/lms/admin/training-status'),
      ]);
      const empJson      = await empRes.json();
      const trainingJson = await trainingRes.json();
      setEmployees(empJson.employees || []);
      const map = new Map<string, TrainingStatus>();
      for (const r of (trainingJson.records ?? []) as TrainingStatus[]) {
        map.set(r.employeeId, r);
      }
      setTrainingMap(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const countsByDept = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of employees) {
      if (e.isActive) m[e.department] = (m[e.department] || 0) + 1;
    }
    return m;
  }, [employees]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (activeDept !== 'All' && e.department !== activeDept) return false;
      if (term) {
        const inCore =
          e.name.toLowerCase().includes(term) ||
          e.designation.toLowerCase().includes(term) ||
          (e.employeeId || '').toLowerCase().includes(term);
        const inAssignments = (e.assignments || []).some(
          (a) =>
            a.sopCode.toLowerCase().includes(term) ||
            (a.sopName || '').toLowerCase().includes(term) ||
            a.monthName.toLowerCase().includes(term),
        );
        if (!inCore && !inAssignments) return false;
      }
      return true;
    });
  }, [employees, activeDept, search]);

  const handleGenerateLogins = useCallback(async () => {
    setGenerating(true);
    setSyncResult(null);
    try {
      const res  = await fetch('/api/lms/admin/credentials/generate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setSyncResult(`Error: ${json.error || 'Failed to generate logins'}`); return; }
      if (json.generated > 0) {
        setGeneratedCreds(json.credentials || []);
        setSyncResult(`Generated logins for ${json.generated} employee(s).`);
      } else {
        setSyncResult('All employees already have a login and password.');
      }
      await load();
    } finally {
      setGenerating(false);
    }
  }, [load]);

  const toggleActive = async (emp: Employee) => {
    setTogglingId(emp._id);
    try {
      const res  = await fetch(`/api/employees/${emp._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !emp.isActive }),
      });
      const json = await res.json();
      if (json.employee) {
        setEmployees((prev) => prev.map((e) => e._id === emp._id ? { ...e, isActive: json.employee.isActive } : e));
      }
    } finally {
      setTogglingId(null);
    }
  };

  const handleSaved = (emp: Employee) => {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e._id === emp._id);
      if (idx >= 0) {
        return prev.map((e) => (e._id === emp._id ? { ...emp, assignments: e.assignments } : e));
      }
      return [{ ...emp, assignments: [] }, ...prev];
    });
    setShowAdd(false);
    setEditing(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/training-matrix" className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Training Matrix
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-purple-600" />
              <h1 className="text-sm font-bold tracking-tight">Employee Master</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button suppressHydrationWarning onClick={load} disabled={loading} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              suppressHydrationWarning
              onClick={handleGenerateLogins}
              disabled={generating}
              title="Create a First.Last username and an auto password for any employee that doesn't have a login yet"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <KeyRound className={`h-3.5 w-3.5 ${generating ? 'animate-pulse' : ''}`} /> Generate Logins
            </button>
            <button
              suppressHydrationWarning
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-purple-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add Employee
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">
        {syncResult && (
          <div className={`mb-4 flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${syncResult.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            <span>{syncResult}</span>
            <button suppressHydrationWarning onClick={() => setSyncResult(null)} className="ml-3 rounded p-0.5 hover:bg-black/10"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {/* Department pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            suppressHydrationWarning
            onClick={() => setActiveDept('All')}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${activeDept === 'All' ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            All Departments
            <span className="ml-1.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
              {employees.filter(e => e.isActive).length}
            </span>
          </button>
          {DEPARTMENTS.map((d) => (
            <button
              suppressHydrationWarning
              key={d}
              onClick={() => setActiveDept(d)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${activeDept === d ? 'bg-purple-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {d}
              {(countsByDept[d] || 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                  {countsByDept[d]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
          <span className="font-medium text-gray-600">Assigned SOPs show:</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Training</span>
            regular scheduled training
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">Induction</span>
            induction training
          </span>
        </div>

        {/* Search + count */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              suppressHydrationWarning
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, designation, SOP, or ID…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-purple-300 focus:outline-none"
            />
          </div>
          <span className="text-xs text-gray-400">{visible.length} employee{visible.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-20 text-center text-sm text-gray-400">Loading employees…</div>
          ) : visible.length === 0 ? (
            <div className="py-20 text-center">
              <UserRound className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">No employees found</p>
              {activeDept !== 'All' && (
                <p className="mt-1 text-xs text-gray-400">No employees in {activeDept} yet.</p>
              )}
              <button
                suppressHydrationWarning
                onClick={() => setShowAdd(true)}
                className="mt-4 flex items-center gap-1.5 mx-auto rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add first employee
              </button>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Designation</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Emp. ID</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Login</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned SOPs</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Training</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((emp) => (
                  <tr key={emp._id} className={`hover:bg-gray-50 ${!emp.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.designation}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${DEPT_COLOR[emp.department as Dept] || 'bg-gray-100 text-gray-600'}`}>
                        {emp.department}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{emp.employeeId || '—'}</td>
                    <td className="px-4 py-3">
                      {emp.lmsUsername ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs text-gray-700">{emp.lmsUsername}</span>
                          <span
                            className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              emp.hasLmsPassword ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}
                            title={emp.hasLmsPassword ? 'Password set' : 'No password yet'}
                          >
                            <KeyRound className="h-2.5 w-2.5" />
                            {emp.hasLmsPassword ? 'Password set' : 'No password'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <AssignmentBadge employeeName={emp.name} assignments={emp.assignments || []} />
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const t = trainingMap.get(emp._id);
                        if (!t || t.totalSops === 0) return <span className="text-xs text-gray-300">—</span>;
                        return (
                          <div className="space-y-1 min-w-[120px]">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full ${t.status === 'completed' ? 'bg-green-500' : 'bg-purple-500'}`}
                                  style={{ width: `${t.overallPct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-600">{t.overallPct}%</span>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-tight">
                              {t.completedSops}/{t.totalSops} done
                              {t.certCount > 0 && (
                                <span className="ml-1 inline-flex items-center gap-0.5 text-amber-500 font-medium">
                                  <Trophy className="h-2.5 w-2.5" />{t.certCount}
                                </span>
                              )}
                            </p>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${emp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {emp.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          suppressHydrationWarning
                          onClick={() => setEditing(emp)}
                          className="rounded p-1.5 text-gray-400 hover:bg-purple-50 hover:text-purple-600"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          suppressHydrationWarning
                          onClick={() => toggleActive(emp)}
                          disabled={togglingId === emp._id}
                          className={`rounded p-1.5 text-gray-400 ${emp.isActive ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-green-50 hover:text-green-600'}`}
                          title={emp.isActive ? 'Mark as Left' : 'Reactivate'}
                        >
                          {togglingId === emp._id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : emp.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          suppressHydrationWarning
                          onClick={() => setDeleting(emp)}
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showAdd && (
        <EmployeeModal
          defaultDept={activeDept !== 'All' ? activeDept : 'QA'}
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
      {editing && (
        <EmployeeModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
      {deleting && (
        <DeleteConfirm
          employee={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setEmployees((p) => p.filter((e) => e._id !== deleting._id)); setDeleting(null); }}
        />
      )}
      {generatedCreds && (
        <CredentialsModal
          credentials={generatedCreds}
          onClose={() => setGeneratedCreds(null)}
        />
      )}
    </div>
  );
}
