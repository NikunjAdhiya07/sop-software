'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Settings, RefreshCw, Trophy,
  UserX, UserCheck, ChevronDown, Search, CheckCircle2, Clock, Circle, X,
} from 'lucide-react';

const DEPARTMENTS = ['All', 'QA', 'QC', 'Microbiology', 'Production', 'Store', 'Engineering', 'Personnel'];

interface EmployeeRecord {
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  isActive: boolean;
  totalSops: number;
  completedSops: number;
  certCount: number;
  overallPct: number;
  status: 'completed' | 'in_progress' | 'not_started';
}

export default function LmsAdminPage() {
  const { status } = useSession();
  const router = useRouter();

  const [records,  setRecords]  = useState<EmployeeRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [dept,     setDept]     = useState('All');
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState<'all' | 'completed' | 'in_progress' | 'not_started' | 'left'>('all');
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dept !== 'All') params.set('department', dept);
      const res  = await fetch(`/api/lms/admin/training-status?${params}`);
      const json = await res.json();
      setRecords(json.records || []);
    } finally {
      setLoading(false);
    }
  }, [dept]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (rec: EmployeeRecord) => {
    setToggling(rec.employeeId);
    try {
      await fetch(`/api/employees/${rec.employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rec.isActive }),
      });
      setRecords((prev) =>
        prev.map((r) => r.employeeId === rec.employeeId ? { ...r, isActive: !r.isActive } : r),
      );
    } finally {
      setToggling(null);
    }
  };

  const visible = records.filter((r) => {
    if (search && !r.employeeName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'left')   return !r.isActive;
    if (filter !== 'all')    return r.status === filter && r.isActive;
    return true;
  });

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-400" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/employees" className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-3.5 w-3.5" /> Employee Master
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <h1 className="text-sm font-bold tracking-tight">LMS Training Status</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/lms/admin/exam-settings"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Settings className="h-3.5 w-3.5" /> Exam Settings
            </Link>
            <button onClick={load} disabled={loading} className="rounded-lg border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        {/* Clickable summary cards */}
        {!loading && records.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { key: 'completed',   label: 'All Trained',  count: records.filter(r => r.isActive && r.status === 'completed').length,  activeColor: 'bg-green-600 border-green-600 text-white', idleColor: 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100' },
              { key: 'in_progress', label: 'In Progress',  count: records.filter(r => r.isActive && r.status === 'in_progress').length, activeColor: 'bg-blue-500 border-blue-500 text-white',  idleColor: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' },
              { key: 'not_started', label: 'Not Started',  count: records.filter(r => r.isActive && r.status === 'not_started').length, activeColor: 'bg-gray-500 border-gray-500 text-white',  idleColor: 'text-gray-600 bg-gray-50 border-gray-200 hover:bg-gray-100' },
              { key: 'left',        label: 'Left Company', count: records.filter(r => !r.isActive).length,                              activeColor: 'bg-red-500 border-red-500 text-white',    idleColor: 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100' },
            ] as const).map(({ key, label, count, activeColor, idleColor }) => (
              <button
                key={key}
                onClick={() => setFilter((prev) => prev === key ? 'all' : key)}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${filter === key ? activeColor : idleColor}`}
              >
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs font-medium opacity-90">{label}</p>
              </button>
            ))}
          </div>
        )}

        {/* Search + department + clear */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-52 max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-8 text-xs focus:border-purple-300 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Department dropdown */}
          <div className="relative">
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-7 text-xs font-medium text-gray-600 focus:outline-none"
            >
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          {/* Clear all filters — only shown when something is active */}
          {(filter !== 'all' || search || dept !== 'All') && (
            <button
              onClick={() => { setFilter('all'); setSearch(''); setDept('All'); }}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}

          {/* Result count */}
          <span className="ml-auto text-xs text-gray-400">{visible.length} employee{visible.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Active filter label */}
        {filter !== 'all' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Showing:</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              filter === 'completed'   ? 'bg-green-100 text-green-700' :
              filter === 'in_progress' ? 'bg-blue-100 text-blue-700' :
              filter === 'not_started' ? 'bg-gray-100 text-gray-600' :
              'bg-red-100 text-red-600'
            }`}>
              {filter === 'in_progress' ? 'In Progress' : filter === 'not_started' ? 'Not Started' : filter === 'left' ? 'Left Company' : 'All Trained'}
              <button onClick={() => setFilter('all')} className="ml-0.5 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </span>
          </div>
        )}


        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
            <p className="text-sm font-medium text-gray-500">No records found</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Training Progress</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 w-36" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.employeeId} className={`hover:bg-gray-50 ${!r.isActive ? 'opacity-60' : ''}`}>
                    {/* Employee */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${r.isActive ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                          {r.employeeName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 leading-tight">
                            {r.employeeName}
                            {!r.isActive && (
                              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Left</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">{r.designation} · {r.department}</p>
                        </div>
                      </div>
                    </td>

                    {/* Progress bar */}
                    <td className="px-4 py-3">
                      {r.totalSops === 0 ? (
                        <p className="text-xs text-gray-400 italic">No SOPs assigned</p>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full transition-all ${r.status === 'completed' ? 'bg-green-500' : 'bg-purple-500'}`}
                                style={{ width: `${r.overallPct}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-700">{r.overallPct}%</span>
                          </div>
                          <p className="text-[11px] text-gray-400">
                            {r.completedSops} / {r.totalSops} SOP{r.totalSops !== 1 ? 's' : ''} completed
                            {r.certCount > 0 && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600 font-medium">
                                <Trophy className="h-3 w-3" /> {r.certCount} cert{r.certCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      {!r.isActive ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                          <UserX className="h-3.5 w-3.5" /> Left
                        </span>
                      ) : r.status === 'completed' ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> All Trained
                        </span>
                      ) : r.status === 'in_progress' ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                          <Clock className="h-3.5 w-3.5" /> In Progress
                        </span>
                      ) : (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                          <Circle className="h-3.5 w-3.5" /> Not Started
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(r)}
                        disabled={toggling === r.employeeId}
                        title={r.isActive ? 'Mark as Left' : 'Reactivate'}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                          r.isActive
                            ? 'border border-red-200 text-red-600 hover:bg-red-50'
                            : 'border border-green-200 text-green-600 hover:bg-green-50'
                        }`}
                      >
                        {toggling === r.employeeId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : r.isActive ? (
                          <span className="flex items-center gap-1"><UserX className="h-3 w-3" /> Mark Left</span>
                        ) : (
                          <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> Reactivate</span>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
