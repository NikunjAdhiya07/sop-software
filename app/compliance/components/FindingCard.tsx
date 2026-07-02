'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
const SopDraftModal = dynamic(() => import('@/components/compliance/SopDraftModal'), { ssr: false });
import {
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle,
  BookOpen,
  FileText,
  AlertTriangle,
  Target,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Search,
  XCircle,
  MapPin,
  FileSearch,
  Pencil,
  Check,
  X as XIcon,
} from 'lucide-react';
import {
  formatConfidence,
  getComplianceLevelBadge,
  getComplianceLevelBorder,
  getComplianceStatusColor,
  getScoreColorClass,
  getSeverityBadge,
  buildImpactAnalysis,
} from '@/lib/complianceFormatter';
import { cleanFindingText, buildProposedVerbiage } from '@/lib/ComplianceFindingValidator';

export interface FindingCardProps {
  finding: {
    _id?: string;
    guidelineName: string;
    folderName?: string;
    pdfName?: string;
    clauseNumber: string;
    clauseTitle: string;
    clauseText?: string;
    complianceLevel: 'compliant' | 'partial' | 'non-compliant' | 'not-applicable' | 'analysis-failed';
    matchConfidence: number;
    issueSeverity?: 'critical' | 'major' | 'minor' | 'informational';
    issueType?: string;
    sopSectionAffected?: string;
    mismatchExplanation?: string;
    highlightedIssue?: string;
    impactAnalysis?: string;
    sopTextSnippet?: string;
    guidelineRequirement?: string;
    suggestedAction?: string;
    suggestedText?: string;
    estimatedEffort?: 'low' | 'medium' | 'high';
    priority?: number;
    reviewStatus?: 'pending' | 'accepted' | 'disputed' | 'implemented';
    findingCategory?: string;
    riskLevel?: string;
    guidelineReference?: string;
    guidelineId?: string;
    evidenceFound?: string;
    evidenceMissing?: string;
    evidenceStrength?: string;
    pageNumber?: string;
    paragraphNumber?: string;
    requiresManualReview?: boolean;
    findingType?: string;
    mergedClauseRefs?: string[];
    applicability?: string;
    requirementCriticality?: string;
    scopeOwner?: string;
    whyApplies?: string;
    whyEvidenceInsufficient?: string;
    whyScoreReduced?: string;
    gapId?: string;
    resolved?: boolean;
    lastReviewedAt?: string;
  };
  sopId?: string;
  reportContext?: {
    sopIdentifier: string;
    sopName: string;
    department: string;
    overallScore: number;
    complianceStatus: string;
  };
  index?: number;
  isSelected?: boolean;
  onToggleSelect?: (idx: number) => void;
  onToggleApplicable?: (id: string, checked: boolean) => void;
  isApplicable?: boolean;
  onReviewStatusChange?: (id: string, status: 'pending' | 'accepted' | 'disputed' | 'implemented') => void;
  onApplyFix?: (gapId: string, finding: FindingCardProps['finding']) => Promise<void>;
  applyingFix?: boolean;
  showCheckbox?: boolean;
  defaultExpanded?: boolean;
}

function findingId(finding: FindingCardProps['finding'], index?: number): string {
  return finding.gapId ?? finding._id ?? `finding-${index ?? finding.clauseNumber}`;
}

function extractSectionNumber(section?: string): string {
  if (!section?.trim()) return '';
  const m = section.match(/(\d+(?:\.\d+)*)/);
  return m ? m[1] : section.trim();
}

function categoryBadge(category?: string): { label: string; className: string } | null {
  switch (category) {
    case 'Critical Non-Compliance':
      return { label: 'Critical Non-Compliance', className: 'bg-red-100 text-red-800 border-red-300' };
    case 'Major Gap':
      return { label: 'Major Gap', className: 'bg-orange-100 text-orange-800 border-orange-300' };
    case 'Minor Gap':
      return { label: 'Minor Gap', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
    case 'Improvement Opportunity':
      return { label: 'Improvement Opportunity', className: 'bg-sky-100 text-sky-800 border-sky-300' };
    case 'Best Practice Recommendation':
      return { label: 'Best Practice', className: 'bg-slate-100 text-slate-700 border-slate-300' };
    default:
      return null;
  }
}

function riskBadge(risk?: string): { label: string; className: string } | null {
  switch (risk) {
    case 'Critical':
      return { label: 'Critical Risk', className: 'bg-red-600 text-white border-red-700' };
    case 'Major':
      return { label: 'Major Risk', className: 'bg-orange-500 text-white border-orange-600' };
    case 'Minor':
      return { label: 'Minor Risk', className: 'bg-yellow-500 text-white border-yellow-600' };
    case 'Improvement':
      return { label: 'Advisory', className: 'bg-sky-500 text-white border-sky-600' };
    default:
      return null;
  }
}

function evidenceStrengthBadge(strength?: string): { label: string; className: string } | null {
  switch (strength) {
    case 'strong':
      return { label: 'Strong evidence', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'moderate':
      return { label: 'Moderate evidence', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'weak':
      return { label: 'Weak evidence', className: 'bg-orange-50 text-orange-700 border-orange-200' };
    case 'none':
      return { label: 'No evidence', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    default:
      return null;
  }
}

function isMeaningful(text?: string): boolean {
  if (!text?.trim()) return false;
  return !/^(none|n\/a|na|not\s+found|not\s+applicable|-)$/i.test(text.trim());
}

/**
 * Split prose text into bullet-ready strings.
 * Priority: explicit \n separators → sentence boundaries → single item.
 */
function toBullets(text: string): string[] {
  if (!text.trim()) return [];

  // Already newline-separated (from buildImpactAnalysis)
  if (text.includes('\n')) {
    return text.split('\n').map(s => s.trim()).filter(Boolean);
  }

  // Split on sentence boundaries: ". " followed by a capital letter or known label
  const sentences = text
    .split(/(?<=[\.\!\?])\s+(?=[A-Z"'(])/)
    .map(s => s.trim())
    .filter(Boolean);

  return sentences.length > 1 ? sentences : [text.trim()];
}

function BulletList({ text, className }: { text: string; className?: string }) {
  const items = toBullets(text);
  if (items.length <= 1) {
    return <p className={`text-sm text-gray-800 leading-relaxed ${className ?? ''}`}>{text}</p>;
  }
  return (
    <ul className={`space-y-1.5 ${className ?? ''}`}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-800 leading-relaxed">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-50" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function applicabilityBadge(applicability?: string): { label: string; className: string } | null {
  switch (applicability) {
    case 'applicable':
      return { label: 'Applicable', className: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'partially-applicable':
      return { label: 'Partially Applicable', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'not-applicable':
      return { label: 'N/A', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return null;
  }
}

function scopeOwnerLabel(owner?: string): string {
  switch (owner) {
    case 'referenced-sop': return 'Owned by a referenced SOP';
    case 'department-procedure': return 'Owned by a department procedure';
    case 'quality-system': return 'Owned by a quality-system procedure';
    case 'current-sop': return 'Owned by this SOP';
    default: return '';
  }
}

export default function FindingCard({
  finding,
  sopId,
  reportContext,
  index,
  isSelected,
  onToggleSelect,
  onToggleApplicable,
  isApplicable,
  onReviewStatusChange,
  onApplyFix,
  applyingFix = false,
  showCheckbox = false,
  defaultExpanded = false,
}: FindingCardProps) {
  const isActionable =
    finding.complianceLevel === 'partial' || finding.complianceLevel === 'non-compliant';

  const [expanded, setExpanded] = useState(defaultExpanded || isActionable);
  const [copied, setCopied] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteText, setRewriteText] = useState('');

  const levelBadge = getComplianceLevelBadge(finding.complianceLevel);
  const severityBadge = getSeverityBadge(finding.issueSeverity ?? 'informational');
  const levelBorder = getComplianceLevelBorder(finding.complianceLevel);
  const confidence = formatConfidence(finding.matchConfidence);
  const id = findingId(finding, index);

  const catBadge = categoryBadge(finding.findingCategory);
  const rBadge = riskBadge(finding.riskLevel);
  const evBadge = evidenceStrengthBadge(finding.evidenceStrength);
  const evidenceFound = finding.evidenceFound?.trim();
  const evidenceMissing = finding.evidenceMissing?.trim();
  const guidelineRef = finding.guidelineReference?.trim();
  const pageRef = finding.pageNumber?.trim();
  const paraRef = finding.paragraphNumber?.trim();
  const isGmp = finding.findingType === 'gmp-expectation';
  const isCrossSop = finding.findingType === 'cross-sop-dependency';
  const appBadge = applicabilityBadge(finding.applicability);
  const scopeLabel = scopeOwnerLabel(finding.scopeOwner);
  const whyApplies = finding.whyApplies?.trim();
  const whyEvidence = finding.whyEvidenceInsufficient?.trim();
  const whyScore = finding.whyScoreReduced?.trim();
  const hasReasoning = !!(whyApplies || whyEvidence || whyScore);

  const guidelineTag = finding.folderName || finding.guidelineName;
  const requirement =
    finding.guidelineRequirement?.trim() ||
    finding.clauseText?.trim() ||
    '';
  const gapText =
    finding.mismatchExplanation?.trim() ||
    finding.highlightedIssue?.trim() ||
    '';
  const impactText =
    finding.impactAnalysis?.trim() ||
    (isActionable && requirement
      ? buildImpactAnalysis(finding, requirement)
      : '');
  const sectionRaw = finding.sopSectionAffected?.trim() || '';
  const sectionNum = extractSectionNumber(sectionRaw);
  const sopSnippet =
    cleanFindingText(finding.sopTextSnippet) ||
    (reportContext ? `${reportContext.sopIdentifier}_${reportContext.sopName}` : '');
  const displaySectionNum = sectionNum || (reportContext ? '1' : '');
  const proposedVerbiage =
    cleanFindingText(finding.suggestedText) ||
    (isActionable
      ? buildProposedVerbiage({
          suggestedAction: cleanFindingText(finding.suggestedAction) || finding.suggestedAction || '',
          sopTextSnippet: sopSnippet,
          sopSectionAffected: sectionRaw,
          gap: gapText,
          clauseTitle: finding.clauseTitle,
          clauseNumber: finding.clauseNumber,
          guidelineName: finding.guidelineName,
        })
      : '');

  const handleCopyVerbiage = () => {
    const text = proposedVerbiage || cleanFindingText(finding.suggestedAction) || '';
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scoreColor = reportContext ? getScoreColorClass(reportContext.overallScore) : '';
  const statusColor = reportContext ? getComplianceStatusColor(reportContext.complianceStatus) : '';

  return (
    <div
      className={`rounded-2xl border-l-4 overflow-hidden bg-white shadow-sm transition-all ${levelBorder} ${
        isSelected ? 'ring-2 ring-purple-400 border-purple-200' : 'border border-gray-200'
      }`}
    >
      {/* Collapsed summary row */}
      <div className="px-4 py-3 flex items-start gap-3">
        {showCheckbox && index !== undefined && onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onToggleSelect(index)}
            className="mt-1 h-4 w-4 text-purple-600 rounded cursor-pointer shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {catBadge ? (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${catBadge.className}`}>
                {catBadge.label}
              </span>
            ) : (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${levelBadge.className}`}>
                {levelBadge.label}
              </span>
            )}
            {rBadge ? (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${rBadge.className}`}>
                {rBadge.label}
              </span>
            ) : (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${severityBadge.className}`}>
                {severityBadge.label}
              </span>
            )}
            {isGmp && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded text-[10px] font-bold text-indigo-700">
                <ShieldAlert className="h-2.5 w-2.5" />
                GMP Intelligence
              </span>
            )}
            {isCrossSop && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-fuchsia-50 border border-fuchsia-200 rounded text-[10px] font-bold text-fuchsia-700">
                <ExternalLink className="h-2.5 w-2.5" />
                Cross-SOP
              </span>
            )}
            {guidelineTag && !isGmp && !isCrossSop && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-700">
                <BookOpen className="h-2.5 w-2.5" />
                {guidelineTag}
              </span>
            )}
            {appBadge && (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${appBadge.className}`}>
                {appBadge.label}
              </span>
            )}
            {finding.requiresManualReview && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-300 rounded text-[10px] font-bold text-rose-700">
                <Search className="h-2.5 w-2.5" />
                Manual review
              </span>
            )}
            <span className="text-[10px] text-gray-400 font-medium">
              {guidelineRef || `Clause ${finding.clauseNumber}`}
              {confidence > 0 && ` · ${confidence}% confidence`}
            </span>
          </div>

          <p className="text-sm font-semibold text-gray-800 leading-tight">{finding.clauseTitle}</p>

          {sectionRaw && sectionRaw !== 'Not Found' && (
            <p className="text-xs text-purple-600 mt-1 flex items-center gap-1 font-medium">
              <FileText className="h-3 w-3 shrink-0" />
              {sectionRaw}
            </p>
          )}

          {!expanded && gapText && isActionable && (
            <p className="text-xs text-gray-600 mt-2 leading-relaxed line-clamp-2">{gapText}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isActionable && onToggleApplicable && (
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isApplicable ?? false}
                onChange={(e) => onToggleApplicable(id, e.target.checked)}
                className="h-3.5 w-3.5 text-purple-600 rounded"
              />
              <span className="text-[10px] text-gray-500 font-medium">Applicable</span>
            </label>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded — reference detail panel */}
      {expanded && (
        <div className="border-t border-gray-100 bg-white">
          {reportContext && (
            <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-4">
              <div
                className={`shrink-0 w-[72px] h-[72px] rounded-full border-[3px] flex flex-col items-center justify-center ${
                  reportContext.overallScore >= 8
                    ? 'border-emerald-200 bg-emerald-50'
                    : reportContext.overallScore >= 5
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-rose-200 bg-rose-50'
                }`}
              >
                <span className={`text-xl font-black leading-none ${scoreColor}`}>
                  {reportContext.overallScore.toFixed(1)}
                </span>
                <span className="text-[9px] text-gray-400 font-semibold">/ 10</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">
                  {reportContext.department}
                </p>
                <p className="text-sm font-bold text-gray-900 leading-snug truncate">
                  {reportContext.sopIdentifier}_{reportContext.sopName}
                </p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full border text-xs font-bold ${statusColor}`}>
                  {reportContext.complianceStatus}
                </span>
              </div>
              <button
                type="button"
                className="shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Copy finding summary"
                onClick={handleCopyVerbiage}
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="px-5 py-5 space-y-5">
            {requirement && (
              <section>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Guideline Requirement
                </h4>
                {guidelineRef && (
                  <p className="text-[11px] font-bold text-blue-700 mb-1">{guidelineRef}</p>
                )}
                <p className="text-sm text-gray-700 leading-relaxed">{requirement}</p>
              </section>
            )}

            {/* Evidence-based assessment */}
            {(isMeaningful(evidenceFound) || isMeaningful(evidenceMissing)) && (
              <div className={`grid gap-4 ${isMeaningful(evidenceFound) && isMeaningful(evidenceMissing) ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
                {isMeaningful(evidenceFound) && (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Evidence Found
                  </h4>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {evidenceFound}
                  </p>
                </section>
                )}
                {isMeaningful(evidenceMissing) && (
                <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-4">
                  <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    Evidence Missing
                  </h4>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {evidenceMissing}
                  </p>
                </section>
                )}
              </div>
            )}

            {/* Confidence + evidence strength + source traceability */}
            <div className="flex flex-wrap items-center gap-2">
              {confidence > 0 && (
                <span className="px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-[11px] font-bold text-gray-600">
                  AI Confidence: {confidence}%
                </span>
              )}
              {evBadge && (
                <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${evBadge.className}`}>
                  {evBadge.label}
                </span>
              )}
              {(displaySectionNum || pageRef || paraRef) && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-purple-200 bg-purple-50 text-[11px] font-bold text-purple-700">
                  <MapPin className="h-3 w-3" />
                  {[
                    displaySectionNum && `Section ${displaySectionNum}`,
                    pageRef && `Page ${pageRef}`,
                    paraRef && `¶ ${paraRef}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              {finding.requiresManualReview && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-300 bg-rose-50 text-[11px] font-bold text-rose-700">
                  <Search className="h-3 w-3" />
                  Flagged for manual review
                </span>
              )}
            </div>

            {/* Auditor reasoning panel — defensible, challengeable findings */}
            {hasReasoning && (
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Auditor Reasoning
                </h4>
                <div className="space-y-2.5">
                  {whyApplies && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Why the requirement applies</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{whyApplies}</p>
                      {scopeLabel && <p className="text-[11px] text-slate-500 mt-0.5">Scope: {scopeLabel}</p>}
                    </div>
                  )}
                  {whyEvidence && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Why SOP evidence is insufficient</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{whyEvidence}</p>
                    </div>
                  )}
                  {whyScore && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Why the score was affected</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{whyScore}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {finding.mergedClauseRefs && finding.mergedClauseRefs.length > 0 && (
              <section className="rounded-xl border border-purple-200 bg-purple-50/50 p-3">
                <h4 className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-1.5">
                  Same root cause — merged clauses
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {finding.mergedClauseRefs.map((ref, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white border border-purple-200 rounded text-[10px] font-semibold text-purple-700">
                      {ref}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {(sopSnippet || displaySectionNum) && (
              <section className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-4">
                <h4 className="text-[10px] font-black text-purple-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Current SOP Content
                </h4>
                {sopSnippet ? (
                  <p className="text-sm text-gray-800 leading-relaxed italic">
                    &ldquo;{sopSnippet}&rdquo;
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 italic">No matching SOP text found for this requirement.</p>
                )}
                {displaySectionNum && (
                  <p className="text-[10px] font-black text-purple-600 mt-3 uppercase tracking-widest">
                    Section: {displaySectionNum}
                  </p>
                )}
              </section>
            )}

            {isActionable && (gapText || impactText) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                  <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Gap Identified
                  </h4>
                  <BulletList text={gapText} />
                </section>
                <section className="rounded-xl border border-orange-200 bg-orange-50/80 p-4">
                  <h4 className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Impact Analysis
                  </h4>
                  <BulletList text={impactText} />
                  {finding.guidelineId && (() => {
                    const pageFragment = finding.pageNumber?.trim()
                      ? `#page=${finding.pageNumber.trim()}`
                      : '';
                    const href = `/api/guidelines/upload?serve=${finding.guidelineId}${pageFragment}`;
                    const label = [
                      finding.pdfName || finding.folderName || finding.guidelineName,
                      finding.clauseNumber ? `§ ${finding.clauseNumber}` : '',
                      finding.pageNumber?.trim() ? `p. ${finding.pageNumber.trim()}` : '',
                    ].filter(Boolean).join(' · ');
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-orange-300 bg-white text-[11px] font-bold text-orange-700 hover:bg-orange-50 hover:border-orange-400 transition-colors"
                        title="Open source guideline document"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        {label || 'View source in guideline'}
                      </a>
                    );
                  })()}
                </section>
              </div>
            )}

            {isActionable && finding.suggestedAction && (
              <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
                <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Suggested Action
                </h4>
                <p className="text-sm font-semibold text-gray-900 leading-relaxed mb-3">
                  {finding.suggestedAction}
                </p>
                {proposedVerbiage && (() => {
                  const activeVerbiage = rewriting ? rewriteText : (finding as any).__rewrittenVerbiage ?? proposedVerbiage;
                  return (
                    <div className="rounded-lg border border-emerald-300 bg-white p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                          Proposed Verbiage
                        </p>
                        <div className="flex items-center gap-2">
                          {rewriting ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  (finding as any).__rewrittenVerbiage = rewriteText;
                                  setRewriting(false);
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wide bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                <Check className="h-3 w-3" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setRewriting(false)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wide bg-gray-200 text-gray-700 hover:bg-gray-300"
                              >
                                <XIcon className="h-3 w-3" />
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRewriteText((finding as any).__rewrittenVerbiage ?? proposedVerbiage);
                                  setRewriting(true);
                                }}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wide bg-amber-500 text-white hover:bg-amber-600"
                              >
                                <Pencil className="h-3 w-3" />
                                Rewrite
                              </button>
                              <button
                                type="button"
                                disabled={!sopId || !sopSnippet}
                                onClick={() => setDraftOpen(true)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wide bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                <FileSearch className="h-3 w-3" />
                                Preview Doc
                              </button>
                              {onApplyFix && finding.gapId && !finding.resolved && (
                                <button
                                  type="button"
                                  disabled={applyingFix}
                                  onClick={() => onApplyFix(finding.gapId!, finding)}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wide bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {applyingFix ? 'Applying…' : 'Apply Fix'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={handleCopyVerbiage}
                                className="flex items-center gap-1 text-[10px] font-black text-emerald-700 hover:text-emerald-900 uppercase tracking-wide"
                              >
                                {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                Copy
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {rewriting ? (
                        <textarea
                          autoFocus
                          value={rewriteText}
                          onChange={(e) => setRewriteText(e.target.value)}
                          rows={6}
                          className="w-full text-sm text-gray-800 leading-relaxed border border-emerald-300 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-emerald-50/40"
                          placeholder="Rewrite the proposed verbiage…"
                        />
                      ) : (
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                          {activeVerbiage}
                          {(finding as any).__rewrittenVerbiage && (finding as any).__rewrittenVerbiage !== proposedVerbiage && (
                            <span className="ml-2 text-[10px] text-amber-600 font-bold">(edited)</span>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </section>
            )}

            {/* DOCX draft preview modal — uses rewritten verbiage if edited */}
            <SopDraftModal
              isOpen={draftOpen}
              onClose={() => setDraftOpen(false)}
              sopId={sopId}
              sopIdentifier={reportContext?.sopIdentifier}
              sopName={reportContext?.sopName}
              sectionAffected={sectionRaw}
              suggestedAction={finding.suggestedAction}
              currentText={sopSnippet}
              proposedText={(finding as any).__rewrittenVerbiage ?? proposedVerbiage}
            />

            {finding.complianceLevel === 'compliant' && (
              <p className="text-sm text-gray-600 bg-emerald-50/50 border border-emerald-100 rounded-lg p-3">
                SOP section{' '}
                <span className="font-semibold text-purple-700">{sectionRaw || 'referenced'}</span>{' '}
                adequately addresses this guideline requirement.
              </p>
            )}

            {onReviewStatusChange && (
              <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
                <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Review:</span>
                {finding.resolved && (
                  <span className="px-2 py-1 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-200">
                    Resolved
                  </span>
                )}
                {finding.lastReviewedAt && (
                  <span className="text-[10px] text-gray-400">
                    Last reviewed: {new Date(finding.lastReviewedAt).toLocaleDateString()}
                  </span>
                )}
                {(['pending', 'accepted', 'disputed', 'implemented'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onReviewStatusChange(id, s)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all capitalize ${
                      finding.reviewStatus === s
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300 hover:text-purple-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
