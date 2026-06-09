'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  GraduationCap, Loader2, LogOut, Search, FileText, AlertTriangle,
} from 'lucide-react';

interface SopAssignment {
  sopCode: string;
  sopName?: string;
  month: number;
  monthName: string;
  year: number;
  trainingType: 'induction' | 'training';
  status?: string;
}

interface Learner {
  id: string;
  name: string;
  designation: string;
  department: string;
}

function LoginCard({ onAuthed }: { onAuthed: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/lms/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Sign in failed'); return; }
      onAuthed();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-white to-sky-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-violet-900">Learning Module</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to view your training</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Username</span>
            <input
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </label>

          {error && (
            <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ learner, assignments, onLogout }: {
  learner: Learner;
  assignments: SopAssignment[];
  onLogout: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return assignments;
    return assignments.filter(
      (a) =>
        a.sopCode.toLowerCase().includes(term) ||
        (a.sopName || '').toLowerCase().includes(term) ||
        a.monthName.toLowerCase().includes(term) ||
        String(a.year).includes(term),
    );
  }, [assignments, query]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <GraduationCap className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight">My Training</h1>
              <p className="text-xs text-gray-400">{learner.name} · {learner.department}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SOP code, name, or month…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm focus:border-violet-300 focus:outline-none"
            />
          </div>
          <span className="text-xs text-gray-400">{filtered.length} of {assignments.length}</span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {assignments.length === 0 ? (
            <div className="py-20 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm font-medium text-gray-500">No SOPs assigned yet</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No SOPs match “{query}”.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((a) => (
                <li key={`${a.sopCode}-${a.month}-${a.year}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold text-gray-800">{a.sopCode}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-500">{a.monthName.slice(0, 3)} {a.year}</span>
                    </div>
                    <p className="truncate text-xs text-gray-500" title={a.sopName || a.sopCode}>
                      {a.sopName || 'No title available'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      a.trainingType === 'induction'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-sky-100 text-sky-700'
                    }`}
                  >
                    {a.trainingType === 'induction' ? 'Induction' : 'Training'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

export default function LmsPage() {
  const [loading, setLoading] = useState(true);
  const [learner, setLearner] = useState<Learner | null>(null);
  const [assignments, setAssignments] = useState<SopAssignment[]>([]);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/lms/auth/me');
      if (!res.ok) { setLearner(null); return; }
      const json = await res.json();
      setLearner(json.employee);
      setAssignments(json.assignments || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const onLogout = async () => {
    await fetch('/api/lms/auth/logout', { method: 'POST' });
    setLearner(null);
    setAssignments([]);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!learner) return <LoginCard onAuthed={loadMe} />;
  return <Dashboard learner={learner} assignments={assignments} onLogout={onLogout} />;
}
