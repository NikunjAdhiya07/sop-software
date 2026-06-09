'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FindingCard from '../components/FindingCard';

interface Finding {
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

interface ApplicableGroup {
  sopSection: string;
  findings: Finding[];
  compiledVerbiage?: string;
  implementationStatus?: string;
}

function ApplicableFindingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportId = searchParams.get('reportId');

  const [groups, setGroups] = useState<ApplicableGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [sopName, setSopName] = useState('');
  const [sopIdentifier, setSopIdentifier] = useState('');
  const [filterSection, setFilterSection] = useState('all');

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    fetch(`/api/compliance/analyze?reportId=${reportId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.report) {
          setSopName(data.report.sopName);
          setSopIdentifier(data.report.sopIdentifier);
          const findings: Finding[] = (data.report.findings ?? []).filter((f: Finding) =>
            f.complianceLevel === 'non-compliant' || f.complianceLevel === 'partial'
          );
          const sectionMap = new Map<string, Finding[]>();
          for (const f of findings) {
            const key = f.sopSectionAffected || 'General';
            if (!sectionMap.has(key)) sectionMap.set(key, []);
            sectionMap.get(key)!.push(f);
          }
          setGroups(Array.from(sectionMap.entries()).map(([sec, fs]) => ({
            sopSection: sec,
            findings: fs,
            implementationStatus: 'pending',
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reportId]);

  const sections = [...new Set(groups.map(g => g.sopSection))];

  const visibleGroups = filterSection === 'all' ? groups : groups.filter(g => g.sopSection === filterSection);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading applicable findings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Applicable Findings</h1>
            {sopName && <p className="text-sm text-gray-500">{sopIdentifier} — {sopName}</p>}
          </div>
          <button
            onClick={() => router.push('/compliance')}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all text-sm font-semibold"
          >
            ← Back to Compliance
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {!reportId ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-lg font-medium text-gray-700">No report selected</p>
            <p className="text-sm text-gray-500 mt-2 mb-6">Return to compliance engine and select a report.</p>
            <button onClick={() => router.push('/compliance')} className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700">
              Go to Compliance Engine
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <p className="text-4xl mb-4">✅</p>
            <p className="text-lg font-medium text-gray-700">No actionable findings</p>
            <p className="text-sm text-gray-500 mt-2">All clauses are compliant or not applicable.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <p className="text-3xl font-black text-gray-800">{groups.length}</p>
                <p className="text-xs font-semibold text-gray-500 mt-1">SOP Sections Affected</p>
              </div>
              <div className="bg-rose-50 rounded-xl border border-rose-200 p-5 text-center">
                <p className="text-3xl font-black text-rose-700">{groups.reduce((s, g) => s + g.findings.filter(f => f.complianceLevel === 'non-compliant').length, 0)}</p>
                <p className="text-xs font-semibold text-rose-600 mt-1">Non-Compliant Findings</p>
              </div>
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 text-center">
                <p className="text-3xl font-black text-amber-700">{groups.reduce((s, g) => s + g.findings.filter(f => f.complianceLevel === 'partial').length, 0)}</p>
                <p className="text-xs font-semibold text-amber-600 mt-1">Partial Findings</p>
              </div>
            </div>

            {/* Filter */}
            {sections.length > 1 && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600">Filter by Section:</span>
                <select
                  value={filterSection}
                  onChange={e => setFilterSection(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none"
                >
                  <option value="all">All Sections ({groups.length})</option>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Section groups */}
            {visibleGroups.map(group => (
              <div key={group.sopSection} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold border border-purple-200">
                      Section {group.sopSection}
                    </span>
                    <span className="text-sm text-gray-600">{group.findings.length} finding{group.findings.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex gap-2">
                    {group.findings.some(f => f.complianceLevel === 'non-compliant') && (
                      <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs font-bold border border-rose-200">Non-Compliant</span>
                    )}
                    {group.findings.some(f => f.complianceLevel === 'partial') && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-bold border border-amber-200">Partial</span>
                    )}
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {group.findings.map((f, i) => (
                    <FindingCard key={i} finding={f} index={i} showCheckbox={false} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApplicableFindingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    }>
      <ApplicableFindingsContent />
    </Suspense>
  );
}
