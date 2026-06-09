'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  ArrowLeft, Plus, Search, Pencil, Trash2, X, Check,
  UserRound, RefreshCw, AlertTriangle, ChevronDown,
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

interface Employee {
  _id: string;
  name: string;
  designation: string;
  department: string;
  employeeId?: string;
  isActive: boolean;
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
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const handleSave = async () => {
    if (!name.trim() || !designation.trim()) { setError('Name and designation are required.'); return; }
    setLoading(true);
    setError('');
    try {
      const isEdit = !!initial?._id;
      const res = await fetch(isEdit ? `/api/employees/${initial._id}` : '/api/employees', {
        method:  isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, designation, department, employeeId }),
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
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/employees?includeInactive=1');
      const json = await res.json();
      setEmployees(json.employees || []);
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
      if (term && !e.name.toLowerCase().includes(term) && !e.designation.toLowerCase().includes(term) && !(e.employeeId || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [employees, activeDept, search]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch('/api/employees/sync-from-matrix', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setSyncResult(`Error: ${json.error || 'Sync failed'}`); return; }
      setSyncResult(`Synced ${json.upserted} employees from ${json.departments} department(s)`);
      await load();
    } finally {
      setSyncing(false);
    }
  }, [load]);

  const handleSaved = (emp: Employee) => {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e._id === emp._id);
      return idx >= 0 ? prev.map((e) => e._id === emp._id ? emp : e) : [emp, ...prev];
    });
    setShowAdd(false);
    setEditing(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
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
              onClick={handleSync}
              disabled={syncing}
              title="Import employees from uploaded training matrix files"
              className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync from Matrix
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

      <main className="mx-auto max-w-5xl px-5 py-6">
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

        {/* Search + count */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              suppressHydrationWarning
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, designation, or ID…"
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
    </div>
  );
}
