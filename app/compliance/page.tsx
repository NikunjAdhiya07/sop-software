'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import FindingCard from './components/FindingCard';
import { BookOpen, FileText, Layers, CheckCircle, Copy, X, Upload } from 'lucide-react';

interface Guideline {
  _id: string;
  name: string;
  folder: string;
  clauses: { number: string; title: string; text: string }[];
}

interface GuidelineFolder {
  folderName: string;
  guidelineCount: number;
  totalClauses: number;
}

interface SOP {
  _id: string;
  identifier: string;
  name: string;
  department: string;
  version?: string;
  location?: string;
  language?: string;
}

interface ComplianceFinding {
  _id?: string;
  guidelineName: string;
  folderName?: string;
  clauseNumber: string;
  clauseTitle: string;
  clauseText?: string;
  complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' | 'analysis-failed';
  matchConfidence: number;
  issueSeverity?: 'critical' | 'major' | 'minor' | 'informational';
  sopSectionAffected?: string;
  mismatchExplanation?: string;
  highlightedIssue?: string;
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

type WorkflowStep = 'fetch-sops' | 'fetch-guidelines' | 'review' | 'analyze' | 'results';

function ConsolidatedSectionCard({ sec }: {
  sec: {
    sectionKey: string;
    isMulti: boolean;
    findings: ComplianceFinding[];
    sources: string[];
    clauses: string[];
    combinedAction: string;
    combinedSuggestion: string;
  };
}) {
  const [refExpanded, setRefExpanded] = useState(false);
  return (
    <div className={`rounded-2xl border overflow-hidden ${sec.isMulti ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'}`}>
      <div className={`px-5 py-3 flex items-center justify-between border-b ${sec.isMulti ? 'border-purple-200 bg-purple-100/60' : 'border-gray-100 bg-gray-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${sec.isMulti ? 'bg-purple-200 text-purple-800 border border-purple-300' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
            Section {sec.sectionKey}
          </div>
          {sec.isMulti && (
            <span className="text-xs text-purple-600 font-semibold flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />{sec.findings.length} changes combined
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefExpanded(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${refExpanded ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'}`}
          >
            <BookOpen className="h-3 w-3" />Guideline Refs
            {refExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText([sec.combinedAction, sec.combinedSuggestion ? `\nPROPOSED VERBIAGE:\n${sec.combinedSuggestion}` : ''].filter(Boolean).join('\n'))}
            className="text-[10px] text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      </div>
      {refExpanded && (
        <div className="border-b border-blue-100 bg-blue-50">
          <div className="px-5 py-4 space-y-3">
            <p className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em]"><BookOpen className="h-3 w-3 inline mr-1" />Guideline Source References</p>
            {sec.findings.map((f, fi) => (
              <div key={fi} className="bg-white border border-blue-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-3 flex-wrap">
                  {fi > 0 && sec.isMulti && (<span className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[9px] font-black flex-shrink-0">{fi + 1}</span>)}
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 border border-blue-200 rounded text-[10px] font-bold text-blue-700"><BookOpen className="h-2.5 w-2.5" />{f.folderName || f.guidelineName || 'Guideline'}</span>
                  {f.clauseNumber && <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 border border-gray-200 rounded text-[10px] font-bold text-gray-600 font-mono">Clause {f.clauseNumber}</span>}
                </div>
                <div className="px-4 py-3 space-y-2">
                  {f.clauseTitle && <p className="text-[10px] font-black text-gray-700 uppercase tracking-wider">{f.clauseTitle}</p>}
                  {f.guidelineRequirement && <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-blue-300 pl-3 font-mono">{f.guidelineRequirement}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {sec.sources.map(src => (
            <span key={src} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-[10px] font-bold text-blue-700 uppercase tracking-wider">
              <BookOpen className="h-3 w-3" />{src}
            </span>
          ))}
          {sec.clauses.map(cl => (
            <span key={cl} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-600">
              <FileText className="h-3 w-3" />Clause {cl}
            </span>
          ))}
        </div>
        {sec.isMulti && (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Issues being resolved:</p>
            {sec.findings.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-[9px] font-black flex-shrink-0">{i + 1}</span>
                <span className="leading-relaxed">{f.mismatchExplanation || f.highlightedIssue || 'Gap identified'}</span>
              </div>
            ))}
          </div>
        )}
        <div>
          <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider mb-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />{sec.isMulti ? 'Consolidated Action' : 'Suggested Action'}
          </p>
          <p className="text-sm text-gray-800 font-medium leading-relaxed whitespace-pre-wrap">{sec.combinedAction}</p>
        </div>
        {sec.combinedSuggestion && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-100 border-b border-gray-200">
              <span className="text-[9px] text-emerald-700 font-black uppercase tracking-widest">{sec.isMulti ? 'Combined Proposed Verbiage' : 'Proposed Verbiage'}</span>
            </div>
            <div className="p-4"><pre className="text-gray-700 font-mono text-xs whitespace-pre-wrap leading-relaxed">{sec.combinedSuggestion}</pre></div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChevronDownIcon() {
  return <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}
function ChevronUpIcon() {
  return <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>;
}

export default function ComplianceEnginePage() {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<WorkflowStep>('fetch-sops');
  const [folders, setFolders] = useState<GuidelineFolder[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [guidelineStats, setGuidelineStats] = useState<Record<string, {
    totalFindings: number; compliantCount: number; partialCount: number; nonCompliantCount: number; sopCount: number
  }>>({});
  const [sops, setSops] = useState<SOP[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [reports, setReports] = useState<ComplianceReport[]>([]);

  const [loadingSops, setLoadingSops] = useState(false);
  const [loadingGuidelines, setLoadingGuidelines] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pauseRef = useRef(false);
  const [analysisStats, setAnalysisStats] = useState({ total: 0, completed: 0, cached: 0, failed: 0, currentSopName: '', currentSopIdentifier: '' });
  const [sopLists, setSopLists] = useState<{
    completed: { identifier: string; name: string; score: number | null; status: string }[];
    cached: { identifier: string; name: string; score: number | null; status: string }[];
    failed: { identifier: string; name: string; error?: string }[];
  }>({ completed: [], cached: [], failed: [] });
  const [activeChip, setActiveChip] = useState<'completed' | 'cached' | 'failed' | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const [preflightData, setPreflightData] = useState({ checked: false, existingCount: 0, newCount: 0 });
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);
  const [loadingFullReport, setLoadingFullReport] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'compliant' | 'partial' | 'non-compliant' | 'not-applicable'>('all');
  const [hideNotApplicable, setHideNotApplicable] = useState(true);
  const [filterGuideline, setFilterGuideline] = useState('all');
  const [selectedSopId, setSelectedSopId] = useState<string>('all');

  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<number>>(new Set());
  const [showConsolidatedSummary, setShowConsolidatedSummary] = useState(false);
  const [applicableFindings, setApplicableFindings] = useState<Set<string>>(new Set());
  const [submittingApplicable, setSubmittingApplicable] = useState(false);
  const [expandedGuideline, setExpandedGuideline] = useState<string | null>(null);

  // Upload guidelines modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  // When folder upload detects subfolders, store grouped structure
  const [uploadGroups, setUploadGroups] = useState<{ folder: string; files: File[] }[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentFolder: string }>({ current: 0, total: 0, currentFolder: '' });
  const [uploadResults, setUploadResults] = useState<{ name: string; clauses: number; status: string; error?: string; folder?: string }[] | null>(null);

  const fetchSops = async () => {
    setLoadingSops(true);
    try {
      const res = await fetch('/api/compliance/sops?limit=500');
      const data = await res.json();
      if (data.success) {
        setSops(data.sops ?? []);
        setDepartments(data.departments ?? []);
      }
    } catch { /* silent */ } finally { setLoadingSops(false); }
  };

  const fetchGuidelines = async () => {
    setLoadingGuidelines(true);
    try {
      const res = await fetch('/api/guidelines');
      const data = await res.json();
      if (data.guidelines) {
        setGuidelines(data.guidelines);
        const folderMap: Record<string, GuidelineFolder> = {};
        for (const g of data.guidelines as Guideline[]) {
          if (!folderMap[g.folder]) folderMap[g.folder] = { folderName: g.folder, guidelineCount: 0, totalClauses: 0 };
          folderMap[g.folder].guidelineCount++;
          folderMap[g.folder].totalClauses += g.clauses?.length ?? 0;
        }
        setFolders(Object.values(folderMap));
      }
    } catch { /* silent */ } finally { setLoadingGuidelines(false); }
  };

  const handleDeleteGuideline = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete guideline "${name}"?`)) return;
    try {
      const res = await fetch(`/api/guidelines/upload?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setGuidelines(prev => prev.filter(g => g._id !== id));
        setExpandedGuideline(v => v === id ? null : v);
      } else {
        alert(data.error ?? 'Delete failed');
      }
    } catch { alert('Delete request failed'); }
  };

  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const res = await fetch('/api/compliance/analyze');
      const data = await res.json();
      if (data.success) setReports(data.reports ?? []);
    } catch { /* silent */ } finally { setLoadingReports(false); }
  };

  const runPreflightCheck = useCallback(async () => {
    const target = selectedSopId === 'all' ? sops : sops.filter(s => s._id === selectedSopId);
    if (!target.length) return;
    try {
      const res = await fetch('/api/compliance/check-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sopIds: target.map(s => s._id) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const existingCount = target.filter(s => data.results?.[s._id]?.hasReport).length;
      setPreflightData({ checked: true, existingCount, newCount: target.length - existingCount });
    } catch {
      setPreflightData({ checked: false, existingCount: 0, newCount: 0 });
    }
  }, [sops, selectedSopId]);

  useEffect(() => { if (currentStep === 'review') runPreflightCheck(); }, [currentStep, selectedSopId]);

  const runAnalysis = async () => {
    const candidates = selectedSopId === 'all' ? sops : sops.filter(s => s._id === selectedSopId);
    if (!candidates.length || !guidelines.length) return;
    pauseRef.current = false;
    setIsPaused(false);
    setIsAnalyzing(true);
    setAnalysisComplete(false);
    setCurrentStep('analyze');

    const waitIfPaused = () => new Promise<void>(resolve => {
      const check = () => pauseRef.current ? setTimeout(check, 500) : resolve();
      check();
    });

    setAnalysisStats({ total: candidates.length, completed: 0, cached: 0, failed: 0, currentSopName: candidates[0]?.name ?? '', currentSopIdentifier: candidates[0]?.identifier ?? '' });
    setSopLists({ completed: [], cached: [], failed: [] });
    setActiveChip(null);

    for (const sop of candidates) {
      await waitIfPaused();
      setAnalysisStats(prev => ({ ...prev, currentSopName: sop.name, currentSopIdentifier: sop.identifier }));
      try {
        const res = await fetch('/api/compliance/analyze-v3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sopId: sop._id, config: { maxClausesToAnalyze: 500 } }),
        });
        const data = await res.json().catch(() => ({ success: false, error: 'Parse error' }));
        if (data.success) {
          setAnalysisStats(prev => ({ ...prev, completed: prev.completed + 1 }));
          setSopLists(prev => ({ ...prev, completed: [...prev.completed, { identifier: sop.identifier, name: sop.name, score: data.overallScore ?? null, status: data.complianceStatus ?? '' }] }));
        } else {
          setAnalysisStats(prev => ({ ...prev, failed: prev.failed + 1 }));
          setSopLists(prev => ({ ...prev, failed: [...prev.failed, { identifier: sop.identifier, name: sop.name, error: data.error }] }));
        }
      } catch (err) {
        setAnalysisStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        setSopLists(prev => ({ ...prev, failed: [...prev.failed, { identifier: sop.identifier, name: sop.name, error: err instanceof Error ? err.message : 'Network error' }] }));
      }
      await new Promise(r => setTimeout(r, 800));
    }

    setIsAnalyzing(false);
    setIsPaused(false);
    pauseRef.current = false;
    setAnalysisComplete(true);
    fetchReports();
    fetch('/api/compliance/guideline-stats').then(r => r.json()).then(d => { if (d.success) setGuidelineStats(d.stats ?? {}); }).catch(() => {});
  };

  const handleGuidelineUpload = async () => {
    // Bulk folder mode: one request per subfolder group
    if (uploadGroups?.length) {
      setUploading(true);
      setUploadResults(null);
      setUploadProgress({ current: 0, total: uploadGroups.length, currentFolder: '' });
      const allResults: { name: string; clauses: number; status: string; error?: string; folder?: string }[] = [];
      for (let i = 0; i < uploadGroups.length; i++) {
        const group = uploadGroups[i];
        setUploadProgress({ current: i + 1, total: uploadGroups.length, currentFolder: group.folder });
        try {
          const form = new FormData();
          form.append('folder', group.folder);
          for (const file of group.files) form.append('files', file);
          const res = await fetch('/api/guidelines/upload', { method: 'POST', body: form });
          const data = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }));
          if (!data.results && !data.success) {
            allResults.push({ name: group.folder, clauses: 0, status: 'failed', error: data.error ?? `HTTP ${res.status}`, folder: group.folder });
          } else {
            for (const r of data.results ?? []) allResults.push({ ...r, folder: group.folder });
          }
        } catch (err) {
          allResults.push({ name: group.folder, clauses: 0, status: 'failed', error: err instanceof Error ? err.message : 'Upload failed', folder: group.folder });
        }
      }
      setUploadResults(allResults);
      if (allResults.some(r => r.status !== 'failed')) fetchGuidelines();
      setUploading(false);
      return;
    }

    // Single folder mode
    if (!uploadFolder.trim() || !uploadFiles?.length) return;
    setUploading(true);
    setUploadResults(null);
    try {
      const form = new FormData();
      form.append('folder', uploadFolder.trim());
      for (const file of Array.from(uploadFiles)) form.append('files', file);
      const res = await fetch('/api/guidelines/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({ success: false, error: `Server error (${res.status})` }));
      if (!data.results && !data.success) {
        setUploadResults([{ name: 'Server Error', clauses: 0, status: 'failed', error: data.error ?? `HTTP ${res.status}` }]);
      } else {
        setUploadResults(data.results ?? []);
        if (data.success) fetchGuidelines();
      }
    } catch (err) {
      setUploadResults([{ name: 'Error', clauses: 0, status: 'failed', error: err instanceof Error ? err.message : 'Upload request failed' }]);
    } finally { setUploading(false); }
  };

  useEffect(() => { fetchSops(); fetchGuidelines(); fetchReports(); }, []);

  const totalClauses = guidelines.reduce((s, g) => s + (g.clauses?.length ?? 0), 0);

  const getStepStyle = (id: string) => {
    const isActive = currentStep === id;
    return `flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all border cursor-pointer ${isActive ? 'bg-purple-600 text-white shadow-lg border-purple-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-purple-50 hover:border-purple-200'}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Fully Compliant': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Partially Compliant': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Non-Compliant': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const handleSelectReport = async (report: ComplianceReport) => {
    setSelectedReport(report);
    setFilterGuideline('all');
    setLoadingFullReport(true);
    try {
      const res = await fetch(`/api/compliance/analyze?reportId=${report._id}`);
      const data = await res.json();
      if (data.success) setSelectedReport(data.report);
    } catch { /* silent */ } finally { setLoadingFullReport(false); }
  };

  const handleDeleteReport = async (reportId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('Delete this compliance report?')) return;
    await fetch(`/api/compliance/analyze?reportId=${reportId}`, { method: 'DELETE' });
    if (selectedReport?._id === reportId) setSelectedReport(null);
    fetchReports();
  };

  const visibleFindings = useMemo(() => {
    if (!selectedReport?.findings) return [];
    return selectedReport.findings.map((f, i) => ({ f, i })).filter(({ f }) => {
      if (filterStatus !== 'all' && f.complianceLevel !== filterStatus) return false;
      if (filterGuideline !== 'all' && f.folderName !== filterGuideline) return false;
      if (hideNotApplicable && f.complianceLevel === 'not-applicable') return false;
      return true;
    });
  }, [selectedReport, filterStatus, filterGuideline, hideNotApplicable]);

  const normaliseSectionKey = (f: ComplianceFinding) => {
    const raw = f.sopSectionAffected || 'General';
    const m = String(raw).match(/(\d[\d.]*)/);
    return m ? m[1] : String(raw).trim() || 'General';
  };

  const consolidatedSections = useMemo(() => {
    if (!selectedReport?.findings) return [];
    const selected = selectedReport.findings.filter((_, i) => selectedFindingIds.has(i));
    const map = new Map<string, ComplianceFinding[]>();
    for (const f of selected) {
      const key = normaliseSectionKey(f);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries()).map(([key, group]) => ({
      sectionKey: key,
      findings: group,
      isMulti: group.length > 1,
      sources: [...new Set(group.map(f => f.folderName || f.guidelineName || 'Guideline').filter(Boolean))],
      clauses: [...new Set(group.map(f => f.clauseNumber).filter(Boolean))],
      combinedAction: [...new Set(group.map(f => (f.suggestedAction ?? '').replace(/```[\s\S]*?```/g, '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean))].join(' '),
      combinedSuggestion: group.map(f => f.suggestedText ?? '').filter(Boolean).join('\n\n'),
    })).sort((a, b) => { const na = parseFloat(a.sectionKey), nb = parseFloat(b.sectionKey); return !isNaN(na) && !isNaN(nb) ? na - nb : a.sectionKey.localeCompare(b.sectionKey); });
  }, [selectedReport, selectedFindingIds]);

  const submitApplicableFindings = async () => {
    if (!selectedReport || applicableFindings.size === 0) return;
    setSubmittingApplicable(true);
    try {
      const res = await fetch('/api/compliance/applicable-findings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: selectedReport._id, findingIds: [...applicableFindings] }),
      });
      const data = await res.json();
      if (data.success) router.push(`/compliance/applicable?reportId=${selectedReport._id}`);
    } catch { /* silent */ } finally { setSubmittingApplicable(false); }
  };

  const guidelineFolders = [...new Set(guidelines.map(g => g.folder))];

  const progressPct = analysisStats.total > 0 ? Math.round(((analysisStats.completed + analysisStats.cached + analysisStats.failed) / analysisStats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-700 to-purple-500">
              Compliance Intelligence Engine
            </h1>
            <p className="text-sm text-gray-500 font-medium">Automated Regulatory Compliance Validation</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all text-sm font-semibold shadow-sm"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Step tabs */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {([
            { id: 'fetch-sops',       label: '1. SOPs',       icon: '📄', count: sops.length },
            { id: 'fetch-guidelines', label: '2. Guidelines', icon: '📚', count: guidelines.length },
            { id: 'review',           label: '3. Review',     icon: '👁️', count: null },
            { id: 'analyze',          label: '4. Analyze',    icon: '🤖', count: null },
            { id: 'results',          label: '5. Results',    icon: '📊', count: reports.length },
          ] as const).map(step => (
            <button key={step.id} onClick={() => setCurrentStep(step.id)} className={getStepStyle(step.id)}>
              <span className="text-xl opacity-90">{step.icon}</span>
              <span className="font-semibold text-sm hidden md:inline">{step.label}</span>
              {step.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${currentStep === step.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {step.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── UPLOAD GUIDELINES MODAL ── */}
        {uploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[88vh]">

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Upload Guidelines</h2>
                  <p className="text-xs text-gray-500 mt-0.5">PDFs are parsed and clauses extracted automatically</p>
                </div>
                <button onClick={() => { setUploadModalOpen(false); setUploadResults(null); setUploadGroups(null); setUploadFiles(null); setUploadFolder(''); }}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">

                {/* ── Results view ── */}
                {uploadResults ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      {uploadResults.filter(r => r.status !== 'failed').length} / {uploadResults.length} processed successfully
                    </p>
                    {uploadResults.map((r, i) => (
                      <div key={i} className={`flex items-start justify-between px-3 py-2.5 rounded-xl border text-xs gap-2 ${r.status === 'failed' ? 'bg-rose-50 border-rose-200 text-rose-700' : r.status === 'updated' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                        <div className="min-w-0 flex-1">
                          {r.folder && <span className="opacity-60 mr-1">📂 {r.folder} ›</span>}
                          <span className="font-semibold">{r.name}</span>
                          {r.error && <p className="text-[10px] mt-0.5 opacity-80">{r.error}</p>}
                        </div>
                        <span className="flex-shrink-0 font-bold capitalize whitespace-nowrap">
                          {r.status === 'failed' ? 'Failed' : `${r.status} · ${r.clauses} clauses`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* ── Bulk groups preview ── */}
                    {uploadGroups ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-sm font-bold text-purple-800">📁 {uploadGroups.length} categories detected</p>
                            <p className="text-xs text-purple-600 mt-0.5">Each subfolder → separate guideline category</p>
                          </div>
                          <button type="button" onClick={() => { setUploadGroups(null); setUploadFiles(null); setUploadFolder(''); }}
                            className="text-xs text-purple-500 hover:text-purple-700 font-bold">Clear</button>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {uploadGroups.map((g, i) => (
                            <div key={i} className="flex items-center justify-between bg-white border border-purple-100 rounded-lg px-3 py-2">
                              <span className="text-sm font-semibold text-gray-800">📂 {g.folder}</span>
                              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{g.files.length} PDF{g.files.length !== 1 ? 's' : ''}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* ── Category name ── */}
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Folder / Category Name</label>
                          <input type="text" placeholder="e.g., EU GMP Part 1" value={uploadFolder}
                            onChange={e => setUploadFolder(e.target.value)} disabled={uploading}
                            className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-400 disabled:opacity-50" />
                          <p className="text-[11px] text-gray-400 mt-1">Existing folders will be updated.</p>
                        </div>

                        {/* ── Selected files ── */}
                        {uploadFiles && uploadFiles.length > 0 && (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-purple-700">{uploadFiles.length} PDF{uploadFiles.length > 1 ? 's' : ''} ready</span>
                              <button type="button" onClick={() => setUploadFiles(null)} className="text-[10px] text-purple-500 hover:text-purple-700 font-bold">Remove</button>
                            </div>
                            <ul className="space-y-1 max-h-24 overflow-y-auto">
                              {Array.from(uploadFiles).map((f, i) => (
                                <li key={i} className="text-xs text-gray-600 flex items-center gap-2 truncate">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />{f.name}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    {/* ── Picker buttons ── */}
                    <div className={`grid grid-cols-3 gap-2 ${uploading ? 'pointer-events-none opacity-40' : ''}`}>
                      <label className="flex flex-col items-center gap-1.5 p-3 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all text-center">
                        <span className="text-xl">📄</span>
                        <span className="text-xs font-semibold text-gray-700">Files</span>
                        <span className="text-[10px] text-gray-400">Select PDFs</span>
                        <input type="file" accept=".pdf" multiple className="hidden" disabled={uploading}
                          onChange={e => { if (e.target.files?.length) { setUploadGroups(null); setUploadFiles(e.target.files); } }} />
                      </label>

                      <label className="flex flex-col items-center gap-1.5 p-3 border-2 border-dashed border-purple-200 rounded-xl cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all text-center">
                        <span className="text-xl">📁</span>
                        <span className="text-xs font-semibold text-purple-700">Folder</span>
                        <span className="text-[10px] text-gray-400">One category</span>
                        <input type="file" accept=".pdf" multiple className="hidden" disabled={uploading}
                          // @ts-expect-error webkitdirectory non-standard
                          webkitdirectory=""
                          onChange={e => {
                            const files = e.target.files;
                            if (!files?.length) return;
                            type WF = File & { webkitRelativePath?: string };
                            const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
                            const dt = new DataTransfer(); pdfs.forEach(f => dt.items.add(f));
                            setUploadGroups(null); setUploadFiles(dt.files);
                            if (!uploadFolder.trim()) setUploadFolder((files[0] as WF).webkitRelativePath?.split('/')[0] || '');
                          }} />
                      </label>

                      <label className="flex flex-col items-center gap-1.5 p-3 border-2 border-dashed border-purple-400 rounded-xl cursor-pointer hover:border-purple-600 hover:bg-purple-50 transition-all text-center">
                        <span className="text-xl">🗂️</span>
                        <span className="text-xs font-semibold text-purple-800">Bulk</span>
                        <span className="text-[10px] text-gray-400">Subfolders</span>
                        <input type="file" accept=".pdf" multiple className="hidden" disabled={uploading}
                          // @ts-expect-error webkitdirectory non-standard
                          webkitdirectory=""
                          onChange={e => {
                            const files = e.target.files;
                            if (!files?.length) return;
                            type WF = File & { webkitRelativePath?: string };
                            const groupMap = new Map<string, File[]>();
                            for (const f of Array.from(files) as WF[]) {
                              if (!f.name.toLowerCase().endsWith('.pdf')) continue;
                              const parts = (f.webkitRelativePath ?? f.name).split('/');
                              const folder = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
                              if (!groupMap.has(folder)) groupMap.set(folder, []);
                              groupMap.get(folder)!.push(f);
                            }
                            if (groupMap.size <= 1) {
                              const dt = new DataTransfer();
                              (Array.from(files) as WF[]).filter(f => f.name.toLowerCase().endsWith('.pdf')).forEach(f => dt.items.add(f));
                              setUploadGroups(null); setUploadFiles(dt.files);
                              setUploadFolder((Array.from(files)[0] as WF).webkitRelativePath?.split('/')[0] || '');
                            } else {
                              setUploadFiles(null); setUploadFolder('');
                              setUploadGroups(Array.from(groupMap.entries()).map(([folder, files]) => ({ folder, files })));
                            }
                          }} />
                      </label>
                    </div>

                    {/* ── Bulk progress ── */}
                    {uploading && uploadGroups && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>Processing <span className="font-semibold text-purple-700">{uploadProgress.currentFolder}</span></span>
                          <span>{uploadProgress.current}/{uploadProgress.total}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-600 rounded-full transition-all duration-500"
                            style={{ width: `${uploadProgress.total > 0 ? Math.round((uploadProgress.current / uploadProgress.total) * 100) : 0}%` }} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
                <button onClick={() => { setUploadModalOpen(false); setUploadResults(null); setUploadGroups(null); setUploadFiles(null); setUploadFolder(''); }}
                  disabled={uploading}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 font-semibold hover:bg-gray-50 transition-all disabled:opacity-50">
                  {uploadResults ? 'Close' : 'Cancel'}
                </button>
                {!uploadResults && (
                  <button onClick={handleGuidelineUpload}
                    disabled={uploading || (!uploadGroups?.length && (!uploadFolder.trim() || !uploadFiles?.length))}
                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {uploading
                      ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing...</>
                      : uploadGroups?.length ? `Upload ${uploadGroups.length} Categories` : 'Confirm Upload'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 1: SOPs ── */}
        {currentStep === 'fetch-sops' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">SOP Repository</h2>
                <p className="text-gray-500 mt-1">{sops.length} SOPs across {departments.length} departments available for analysis.</p>
              </div>
              <button onClick={fetchSops} disabled={loadingSops} className="px-5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-all disabled:opacity-50 font-medium text-sm flex items-center gap-2 border border-purple-200">
                {loadingSops ? <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Fetching...</> : '🔄 Refresh Data'}
              </button>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-600">Filter by Department:</span>
              <div className="relative">
                <select
                  value={filterDepartment}
                  onChange={e => setFilterDepartment(e.target.value)}
                  className="pl-4 pr-10 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-sm appearance-none cursor-pointer hover:border-purple-300 transition-all font-medium min-w-[240px]"
                >
                  <option value="all">All Departments ({sops.length})</option>
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept} ({sops.filter(s => s.department === dept).length})</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-xs">▼</div>
              </div>
            </div>

            {loadingSops ? (
              <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
                <p className="text-gray-500">Loading SOPs...</p>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
                {sops.filter(s => filterDepartment === 'all' || s.department === filterDepartment).map(sop => (
                  <div key={sop._id} className="p-5 bg-gray-50 border border-gray-100 rounded-xl hover:border-purple-200 hover:bg-purple-50/30 transition-all group">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-purple-700 font-bold text-sm bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{sop.identifier}</span>
                          {sop.version && <span className="text-gray-400 text-xs">v{sop.version}</span>}
                        </div>
                        <h3 className="text-gray-800 font-medium group-hover:text-purple-700 transition-colors">{sop.name}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {sop.location && <span className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-bold shadow-sm">📍 {sop.location}</span>}
                        <span className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium shadow-sm">🏢 {sop.department}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-8 pt-6 border-t border-gray-100">
              <button onClick={() => setCurrentStep('fetch-guidelines')} className="px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200">
                Next: Guidelines →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: GUIDELINES ── */}
        {currentStep === 'fetch-guidelines' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Compliance Guidelines</h2>
                <p className="text-gray-500 mt-1">Managing {guidelines.length} guidelines ({totalClauses} clauses) across {folders.length} categories.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setUploadFolder(''); setUploadFiles(null); setUploadResults(null); setUploadModalOpen(true); }} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all shadow-sm font-medium text-sm flex items-center gap-2">
                  <Upload className="h-4 w-4" /> Upload Files
                </button>
                <button onClick={fetchGuidelines} disabled={loadingGuidelines} className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-all disabled:opacity-50 font-medium text-sm border border-gray-200">
                  {loadingGuidelines ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Folder summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {folders.map(folder => (
                <div key={folder.folderName} className="p-5 bg-purple-50 rounded-xl border border-purple-100 hover:border-purple-300 hover:shadow-md transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-500 opacity-80">📁</span>
                    <p className="text-gray-800 font-semibold truncate" title={folder.folderName}>{folder.folderName}</p>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-2xl font-bold text-purple-700 leading-none">{folder.guidelineCount}</p>
                      <p className="text-xs text-gray-500 mt-1">Guidelines</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">{folder.totalClauses}</p>
                      <p className="text-xs text-gray-400">Clauses</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Guidelines list */}
            {loadingGuidelines ? (
              <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4" />
                <p className="text-gray-500">Loading guidelines...</p>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto space-y-3 pr-2">
                {guidelines.map(g => {
                  const stat = guidelineStats[g.name];
                  return (
                    <div key={g._id} className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden hover:bg-purple-50 hover:border-purple-200 transition-all group/row">
                      {/* Row header — div not button so we can nest the delete button safely */}
                      <div className="w-full p-5 flex items-center justify-between">
                        {/* Clickable expand area */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedGuideline(expandedGuideline === g._id ? null : g._id)}
                          onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedGuideline(expandedGuideline === g._id ? null : g._id)}
                          className="flex-1 pr-4 min-w-0 cursor-pointer"
                        >
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-bold uppercase tracking-wider border border-purple-200">{g.folder}</span>
                          </div>
                          <h3 className="text-gray-800 font-semibold text-base leading-tight">{g.name}</h3>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="px-2.5 py-1 bg-white text-gray-500 rounded-lg text-xs font-medium border border-gray-200">{g.clauses?.length ?? 0} clauses</span>
                          {stat && stat.totalFindings > 0 && (
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${stat.nonCompliantCount > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : stat.compliantCount === stat.totalFindings ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {stat.totalFindings} points
                            </span>
                          )}
                          {stat && stat.sopCount > 0 && (
                            <span className="px-2 py-1 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-bold border border-purple-200">{stat.sopCount} SOPs</span>
                          )}
                          <button
                            onClick={(e) => handleDeleteGuideline(g._id, g.name, e)}
                            className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors rounded opacity-0 group-hover/row:opacity-100"
                            title="Delete guideline"
                          >
                            <X className="h-4 w-4" />
                          </button>
                          <span
                            role="button"
                            tabIndex={-1}
                            aria-hidden
                            onClick={() => setExpandedGuideline(expandedGuideline === g._id ? null : g._id)}
                            className={`text-gray-400 transition-transform duration-300 cursor-pointer ${expandedGuideline === g._id ? 'rotate-180' : ''}`}
                          >▼</span>
                        </div>
                      </div>
                      {expandedGuideline === g._id && (
                        <div className="px-5 pb-5 pt-2 bg-white border-t border-gray-100">
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {(g.clauses ?? []).map((c, idx) => (
                              <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex gap-3">
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold border border-purple-200 flex-shrink-0">{c.number}</span>
                                <div>
                                  <p className="text-xs font-semibold text-gray-700">{c.title}</p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.text}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
              <button onClick={() => setCurrentStep('fetch-sops')} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-all">← Back</button>
              <button onClick={() => setCurrentStep('review')} className="px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200">
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: REVIEW ── */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Review Configuration</h2>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Analysis Scope</label>
                <div className="relative">
                  <select
                    value={selectedSopId}
                    onChange={e => { setSelectedSopId(e.target.value); setPreflightData({ checked: false, existingCount: 0, newCount: 0 }); }}
                    className="w-full pl-4 pr-10 py-3 bg-white border border-gray-300 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-sm appearance-none"
                  >
                    <option value="all">Analyze All Available SOPs ({sops.length})</option>
                    {sops.map(s => <option key={s._id} value={s._id}>{s.identifier} - {s.name}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">▼</div>
                </div>
              </div>

              {preflightData.checked && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl mb-6">
                  <p className="text-sm font-semibold text-purple-700 mb-2">Analysis Scope</p>
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-white text-purple-700 rounded-full text-xs font-bold border border-purple-200">
                      {(preflightData.existingCount + preflightData.newCount)} SOPs will be analyzed
                    </span>
                    {preflightData.existingCount > 0 && (
                      <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200">
                        {preflightData.existingCount} already have reports (will be refreshed)
                      </span>
                    )}
                    {preflightData.newCount > 0 && (
                      <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-200">
                        {preflightData.newCount} new (first analysis)
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'TARGET SOPS', value: selectedSopId === 'all' ? sops.length : 1, sub: `across ${departments.length} departments`, color: 'border-purple-200 bg-purple-50' },
                  { label: 'REFERENCE GUIDELINES', value: guidelines.length, sub: `from ${folders.length} categories`, color: 'border-pink-200 bg-pink-50' },
                  { label: 'TOTAL VALIDATION POINTS', value: totalClauses, sub: 'clauses to verify', color: 'border-amber-200 bg-amber-50' },
                ].map(card => (
                  <div key={card.label} className={`p-6 rounded-xl border ${card.color}`}>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{card.label}</p>
                    <p className="text-4xl font-bold text-gray-800">{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.sub}</p>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <h3 className="font-bold text-gray-800 mb-4">Process Overview</h3>
                <div className="space-y-3">
                  {['Cross-referencing each SOP against all active guidelines', 'AI-driven compliance scoring (Compliant, Partial, Non-Compliant)', 'Section-level gap identification with suggested fixes', 'Consolidated report with implementation guidance'].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-black flex-shrink-0">{i + 1}</span>
                      <p className="text-sm text-gray-600">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setCurrentStep('fetch-guidelines')} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-all">← Back</button>
              <button
                onClick={runAnalysis}
                disabled={sops.length === 0 || guidelines.length === 0}
                className="px-10 py-3.5 bg-purple-600 text-white rounded-xl font-bold text-base hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-200"
              >
                🚀 Start Analysis
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: ANALYZE ── */}
        {currentStep === 'analyze' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {isAnalyzing ? 'Processing Compliance Checks...' : analysisComplete ? '✅ Analysis Complete' : 'Analysis'}
                  </h2>
                  {isAnalyzing && analysisStats.currentSopName && (
                    <p className="text-sm text-gray-500 mt-1">Finishing up...</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isAnalyzing && (
                    <button
                      onClick={() => { pauseRef.current = !isPaused; setIsPaused(v => !v); }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold text-sm transition-all ${isPaused ? 'bg-purple-600 text-white border-purple-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                    >
                      {isPaused ? '▶ Resume' : '⏸ Pause'}
                    </button>
                  )}
                  <div className={`px-4 py-2 rounded-xl border font-black text-sm ${isAnalyzing ? 'bg-purple-100 text-purple-700 border-purple-200' : analysisComplete ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {progressPct}% DONE
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-6">
                <div className="absolute inset-y-0 left-0 bg-purple-600 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }}>
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">{analysisStats.completed + analysisStats.cached + analysisStats.failed}/{analysisStats.total}</span>
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'COMPLETED', value: analysisStats.completed, color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', chip: 'completed' as const },
                  { label: 'CACHED', value: analysisStats.cached, color: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500', chip: 'cached' as const },
                  { label: 'REMAINING', value: Math.max(0, analysisStats.total - analysisStats.completed - analysisStats.cached - analysisStats.failed), color: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500', chip: null },
                  { label: 'FAILED', value: analysisStats.failed, color: 'bg-rose-50 border-rose-200', dot: 'bg-rose-400', chip: 'failed' as const },
                ].map(card => (
                  <button
                    key={card.label}
                    onClick={() => card.chip && setActiveChip(activeChip === card.chip ? null : card.chip)}
                    className={`p-4 rounded-xl border ${card.color} text-left transition-all ${card.chip ? 'hover:shadow-md cursor-pointer' : 'cursor-default'} ${activeChip === card.chip ? 'ring-2 ring-purple-400' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${card.dot}`} />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{card.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                  </button>
                ))}
              </div>

              {/* Current SOP being analyzed */}
              {isAnalyzing && analysisStats.currentSopName && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0">C</div>
                  <div>
                    <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider">ANALYZING SOP {analysisStats.completed + 1} OF {analysisStats.total}</p>
                    <p className="font-bold text-gray-800">{analysisStats.currentSopName}</p>
                    <p className="text-xs text-purple-600 font-mono">{analysisStats.currentSopIdentifier}</p>
                  </div>
                </div>
              )}

              {/* Chip list */}
              {activeChip && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 max-h-48 overflow-y-auto space-y-1">
                  {sopLists[activeChip].map((item, i) => (
                    <div key={i} className="py-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-purple-600 font-bold text-xs">{item.identifier}</span>
                        <span className="text-gray-600 text-xs truncate mx-2">{item.name}</span>
                        {'score' in item && item.score !== null && (
                          <span className={`text-xs font-bold ${item.score >= 8 ? 'text-emerald-600' : item.score >= 5 ? 'text-amber-600' : 'text-rose-600'}`}>{item.score}/10</span>
                        )}
                      </div>
                      {'error' in item && item.error && (
                        <p className="text-[10px] text-rose-500 mt-0.5 leading-tight">{item.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* SOP progress map */}
              <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">SOP Progress Map</p>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: analysisStats.total }, (_, i) => {
                    const completed = i < analysisStats.completed + analysisStats.cached;
                    const failed = i >= analysisStats.completed + analysisStats.cached && i < analysisStats.completed + analysisStats.cached + analysisStats.failed;
                    const inProgress = i === analysisStats.completed + analysisStats.cached + analysisStats.failed && isAnalyzing;
                    return (
                      <div
                        key={i}
                        className={`w-4 h-4 rounded-sm transition-colors ${inProgress ? 'bg-purple-500 animate-pulse' : completed ? 'bg-emerald-500' : failed ? 'bg-rose-400' : 'bg-gray-200'}`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  {[{ color: 'bg-emerald-500', label: 'Analyzed' }, { color: 'bg-purple-500', label: 'In Progress' }, { color: 'bg-rose-400', label: 'Failed' }, { color: 'bg-gray-200', label: 'Pending' }].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                      <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />{l.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {analysisComplete && (
              <div className="flex justify-center">
                <button onClick={() => setCurrentStep('results')} className="px-10 py-3.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-200">
                  View Results →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5: RESULTS ── */}
        {currentStep === 'results' && (
          <div className="space-y-6">
            {!selectedReport ? (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Compliance Reports</h2>
                    <p className="text-gray-500 mt-1">{reports.length} reports available</p>
                  </div>
                  <button onClick={fetchReports} disabled={loadingReports} className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl border border-purple-200 font-medium text-sm hover:bg-purple-100 transition-all">
                    {loadingReports ? 'Loading...' : '🔄 Refresh'}
                  </button>
                </div>

                {reports.length === 0 ? (
                  <div className="text-center py-20 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-4xl mb-4 opacity-50">📊</p>
                    <p className="text-lg font-medium text-gray-700 mb-2">No reports yet</p>
                    <p className="text-sm text-gray-500 mb-6">Run an analysis to generate compliance reports.</p>
                    <button onClick={() => setCurrentStep('review')} className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-all">
                      Start Analysis
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reports.map(r => (
                      <button
                        key={r._id}
                        onClick={() => handleSelectReport(r)}
                        className="w-full text-left p-5 bg-gray-50 border border-gray-100 rounded-xl hover:border-purple-200 hover:bg-purple-50/30 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-purple-700 font-bold text-sm bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{r.sopIdentifier}</span>
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getStatusColor(r.complianceStatus)}`}>{r.complianceStatus}</span>
                            </div>
                            <h3 className="text-gray-800 font-medium truncate group-hover:text-purple-700 transition-colors">{r.sopName}</h3>
                            <p className="text-xs text-gray-400 mt-0.5">{r.department} · {new Date(r.analyzedAt).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-center">
                              <p className={`text-xl font-black ${r.overallScore >= 8 ? 'text-emerald-600' : r.overallScore >= 5 ? 'text-amber-600' : 'text-rose-600'}`}>{r.overallScore?.toFixed(1)}</p>
                              <p className="text-[10px] text-gray-400">/10</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-emerald-600 font-bold">{r.compliantCount}✓</span>
                              <span className="text-amber-600 font-bold">{r.partialCount}~</span>
                              <span className="text-rose-600 font-bold">{r.nonCompliantCount}✗</span>
                            </div>
                            <button onClick={(e) => handleDeleteReport(r._id, e)} className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors rounded opacity-0 group-hover:opacity-100">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Report detail */
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => setSelectedReport(null)} className="flex items-center gap-2 text-purple-600 hover:text-purple-800 font-semibold text-sm">
                      ← Back to Reports
                    </button>
                    {!showConsolidatedSummary && selectedFindingIds.size > 0 && (
                      <button onClick={() => setShowConsolidatedSummary(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-all">
                        <Layers className="h-4 w-4" />Consolidated Summary ({selectedFindingIds.size})
                      </button>
                    )}
                  </div>

                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-purple-700 font-bold bg-purple-50 px-3 py-1 rounded-lg border border-purple-100">{selectedReport.sopIdentifier}</span>
                        <span className={`px-3 py-1 rounded-lg border text-sm font-bold ${getStatusColor(selectedReport.complianceStatus)}`}>{selectedReport.complianceStatus}</span>
                      </div>
                      <h2 className="text-xl font-bold text-gray-800">{selectedReport.sopName}</h2>
                      <p className="text-sm text-gray-500">{selectedReport.department}</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-4xl font-black ${selectedReport.overallScore >= 8 ? 'text-emerald-600' : selectedReport.overallScore >= 5 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {selectedReport.overallScore?.toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-400 font-semibold">/ 10</p>
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { label: 'Compliant', count: selectedReport.compliantCount, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      { label: 'Partial', count: selectedReport.partialCount, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      { label: 'Non-Compliant', count: selectedReport.nonCompliantCount, color: 'bg-rose-50 text-rose-700 border-rose-200' },
                    ].map(b => (
                      <div key={b.label} className={`p-4 rounded-xl border ${b.color} text-center`}>
                        <p className="text-2xl font-black">{b.count}</p>
                        <p className="text-xs font-semibold mt-1">{b.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Filters */}
                  <div className="flex flex-wrap gap-3 mb-6">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as never)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                      <option value="all">All Status</option>
                      <option value="non-compliant">Non-Compliant</option>
                      <option value="partial">Partial</option>
                      <option value="compliant">Compliant</option>
                      <option value="not-applicable">N/A</option>
                    </select>
                    <select value={filterGuideline} onChange={e => setFilterGuideline(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20">
                      <option value="all">All Guidelines</option>
                      {guidelineFolders.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={hideNotApplicable} onChange={e => setHideNotApplicable(e.target.checked)} className="rounded" />
                      <span className="text-sm text-gray-600">Hide N/A</span>
                    </label>
                    {visibleFindings.length > 0 && (
                      <button
                        onClick={() => {
                          const allSel = visibleFindings.every(({ i }) => selectedFindingIds.has(i));
                          const next = new Set(selectedFindingIds);
                          if (allSel) visibleFindings.forEach(({ i }) => next.delete(i));
                          else visibleFindings.forEach(({ i }) => next.add(i));
                          setSelectedFindingIds(next);
                        }}
                        className="px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm font-medium hover:bg-purple-100 transition-all"
                      >
                        {visibleFindings.every(({ i }) => selectedFindingIds.has(i)) ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                    {applicableFindings.size > 0 && (
                      <button
                        onClick={submitApplicableFindings}
                        disabled={submittingApplicable}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-all"
                      >
                        {submittingApplicable ? 'Submitting...' : `Submit ${applicableFindings.size} Applicable`}
                      </button>
                    )}
                  </div>

                  {/* Consolidated Summary Modal */}
                  {showConsolidatedSummary && (
                    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-8 overflow-y-auto">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl">
                        <div className="flex items-center justify-between p-6 border-b">
                          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Layers className="h-5 w-5 text-purple-600" />Consolidated Action Plan
                          </h3>
                          <button onClick={() => setShowConsolidatedSummary(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <X className="h-5 w-5 text-gray-500" />
                          </button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                          {consolidatedSections.map(sec => (
                            <ConsolidatedSectionCard key={sec.sectionKey} sec={sec} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {loadingFullReport ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Loading full report...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-gray-600">{visibleFindings.length} findings shown</p>
                      {visibleFindings.map(({ f, i }) => (
                        <FindingCard
                          key={i}
                          finding={f}
                          index={i}
                          isSelected={selectedFindingIds.has(i)}
                          onToggleSelect={(idx) => {
                            const next = new Set(selectedFindingIds);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            setSelectedFindingIds(next);
                          }}
                          onToggleApplicable={(id, checked) => {
                            setApplicableFindings(prev => { const s = new Set(prev); if (checked) s.add(id); else s.delete(id); return s; });
                          }}
                          isApplicable={f._id ? applicableFindings.has(f._id) : false}
                          showCheckbox
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
