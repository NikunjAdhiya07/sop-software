'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import FindingCard from '../../components/FindingCard';

interface ComplianceFinding {
  _id?: string;
  guidelineName: string;
  folderName?: string;
  clauseNumber: string;
  clauseTitle: string;
  complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' | 'analysis-failed';
  matchConfidence: number;
  issueSeverity?: 'critical' | 'major' | 'minor' | 'informational';
  sopSectionAffected?: string;
  mismatchExplanation?: string;
  sopTextSnippet?: string;
  guidelineRequirement?: string;
  suggestedAction?: string;
  suggestedText?: string;
  reviewStatus?: 'pending' | 'accepted' | 'disputed' | 'implemented';
}

interface ComplianceReport {
  _id: string;
  sopIdentifier: string;
  sopName: string;
  department: string;
  overallScore: number;
  complianceStatus: string;
  totalGuidelinesChecked: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  findings: ComplianceFinding[];
  analyzedAt: string;
}

export default function ComplianceReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'compliant' | 'partial' | 'non-compliant' | 'not-applicable'>('all');
  const [filterGuideline, setFilterGuideline] = useState('all');
  const [hideNotApplicable, setHideNotApplicable] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/compliance/analyze?reportId=${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setReport(data.report);
        else setError(data.error || 'Report not found');
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false));
  }, [id]);

  const guidelineFolders = useMemo(() => {
    if (!report?.findings) return [];
    return [...new Set(report.findings.map(f => f.folderName).filter(Boolean))] as string[];
  }, [report]);

  const visibleFindings = useMemo(() => {
    if (!report?.findings) return [];
    return report.findings.filter(f => {
      if (filterStatus !== 'all' && f.complianceLevel !== filterStatus) return false;
      if (filterGuideline !== 'all' && f.folderName !== filterGuideline) return false;
      if (hideNotApplicable && f.complianceLevel === 'not-applicable') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return f.clauseTitle?.toLowerCase().includes(q)
          || f.clauseNumber?.toLowerCase().includes(q)
          || f.mismatchExplanation?.toLowerCase().includes(q)
          || false;
      }
      return true;
    });
  }, [report, filterStatus, filterGuideline, hideNotApplicable, searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Fully Compliant': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Partially Compliant': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Non-Compliant': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading compliance report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-md">
          <p className="text-4xl mb-4">❌</p>
          <p className="text-lg font-medium text-gray-700">{error || 'Report not found'}</p>
          <button onClick={() => router.push('/compliance')} className="mt-6 px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700">
            Back to Compliance
          </button>
        </div>
      </div>
    );
  }

  const compliantPct = report.totalGuidelinesChecked > 0
    ? Math.round((report.compliantCount / report.totalGuidelinesChecked) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Compliance Report</h1>
            <p className="text-sm text-gray-500">{report.sopIdentifier} — {report.sopName}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/compliance/applicable?reportId=${id}`)}
              className="px-4 py-2 bg-purple-50 text-purple-700 rounded-lg border border-purple-200 font-medium text-sm hover:bg-purple-100 transition-all"
            >
              View Applicable
            </button>
            <button
              onClick={() => router.push('/compliance')}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all text-sm font-semibold"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Report header */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-purple-700 font-bold bg-purple-50 px-3 py-1 rounded-lg border border-purple-100 text-sm">{report.sopIdentifier}</span>
                <span className={`px-3 py-1 rounded-lg border text-sm font-bold ${getStatusColor(report.complianceStatus)}`}>{report.complianceStatus}</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800">{report.sopName}</h2>
              <p className="text-gray-500 mt-1">{report.department}</p>
              <p className="text-xs text-gray-400 mt-1">Analyzed {new Date(report.analyzedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="text-center">
              <p className={`text-5xl font-black ${report.overallScore >= 8 ? 'text-emerald-600' : report.overallScore >= 5 ? 'text-amber-600' : 'text-rose-600'}`}>
                {report.overallScore?.toFixed(1)}
              </p>
              <p className="text-sm text-gray-400 font-semibold">/ 10</p>
            </div>
          </div>

          {/* Score bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>{compliantPct}% compliant</span>
              <span>{report.totalGuidelinesChecked} total checks</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${compliantPct}%` }} />
              <div className="bg-amber-400 h-full transition-all" style={{ width: `${report.totalGuidelinesChecked > 0 ? Math.round((report.partialCount / report.totalGuidelinesChecked) * 100) : 0}%` }} />
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Compliant', value: report.compliantCount, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
              { label: 'Partial', value: report.partialCount, color: 'bg-amber-50 border-amber-200 text-amber-700' },
              { label: 'Non-Compliant', value: report.nonCompliantCount, color: 'bg-rose-50 border-rose-200 text-rose-700' },
            ].map(b => (
              <div key={b.label} className={`p-4 rounded-xl border ${b.color} text-center`}>
                <p className="text-2xl font-black">{b.value}</p>
                <p className="text-xs font-semibold mt-1">{b.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Findings */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-gray-800">Findings</h3>
            <span className="text-sm text-gray-500">{visibleFindings.length} shown</span>
          </div>

          <div className="flex flex-wrap gap-3 mb-5">
            <input
              type="text"
              placeholder="Search findings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 w-48"
            />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as never)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none">
              <option value="all">All Status</option>
              <option value="non-compliant">Non-Compliant</option>
              <option value="partial">Partial</option>
              <option value="compliant">Compliant</option>
              <option value="not-applicable">N/A</option>
            </select>
            {guidelineFolders.length > 0 && (
              <select value={filterGuideline} onChange={e => setFilterGuideline(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none">
                <option value="all">All Guidelines</option>
                {guidelineFolders.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={hideNotApplicable} onChange={e => setHideNotApplicable(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-600">Hide N/A</span>
            </label>
          </div>

          <div className="space-y-3">
            {visibleFindings.map((f, i) => (
              <FindingCard key={i} finding={f} index={i} showCheckbox={false} />
            ))}
            {visibleFindings.length === 0 && (
              <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-gray-500">No findings match the current filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
