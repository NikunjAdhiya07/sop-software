'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, CheckCircle, BookOpen, FileText } from 'lucide-react';
import { getComplianceLevelBadge, getSeverityBadge } from '@/lib/complianceFormatter';

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
    sopTextSnippet?: string;
    guidelineRequirement?: string;
    suggestedAction?: string;
    suggestedText?: string;
    estimatedEffort?: 'low' | 'medium' | 'high';
    priority?: number;
    reviewStatus?: 'pending' | 'accepted' | 'disputed' | 'implemented';
  };
  index?: number;
  isSelected?: boolean;
  onToggleSelect?: (idx: number) => void;
  onToggleApplicable?: (id: string, checked: boolean) => void;
  isApplicable?: boolean;
  onReviewStatusChange?: (id: string, status: 'pending' | 'accepted' | 'disputed' | 'implemented') => void;
  showCheckbox?: boolean;
}

const EFFORT_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-red-100 text-red-700 border-red-200',
};

const SEVERITY_LEFT: Record<string, string> = {
  critical: 'border-l-red-500',
  major: 'border-l-orange-500',
  minor: 'border-l-amber-400',
  informational: 'border-l-blue-400',
};

export default function FindingCard({
  finding,
  index,
  isSelected,
  onToggleSelect,
  onToggleApplicable,
  isApplicable,
  onReviewStatusChange,
  showCheckbox = false,
}: FindingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const levelBadge = getComplianceLevelBadge(finding.complianceLevel);
  const severityBadge = getSeverityBadge(finding.issueSeverity ?? 'informational');
  const severityLeft = SEVERITY_LEFT[finding.issueSeverity ?? 'informational'] ?? 'border-l-gray-300';

  const handleCopy = () => {
    const text = [
      `Clause ${finding.clauseNumber}: ${finding.clauseTitle}`,
      finding.mismatchExplanation ? `Issue: ${finding.mismatchExplanation}` : '',
      finding.suggestedAction ? `Action: ${finding.suggestedAction}` : '',
      finding.suggestedText ? `Proposed Text:\n${finding.suggestedText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isNonActionable = finding.complianceLevel === 'compliant' || finding.complianceLevel === 'not-applicable';

  return (
    <div
      className={`rounded-xl border-l-4 overflow-hidden bg-white shadow-sm transition-all ${severityLeft} ${
        isSelected ? 'ring-2 ring-purple-400 border-purple-200' : 'border border-gray-100'
      } ${finding.complianceLevel === 'compliant' ? 'opacity-75' : ''}`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        {showCheckbox && index !== undefined && onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onToggleSelect(index)}
            className="mt-1 h-4 w-4 text-purple-600 rounded cursor-pointer flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${levelBadge.className}`}>
              {levelBadge.label}
            </span>
            {finding.issueSeverity && finding.complianceLevel !== 'compliant' && (
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${severityBadge.className}`}>
                {severityBadge.label}
              </span>
            )}
            {finding.folderName && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-700">
                <BookOpen className="h-2.5 w-2.5" />
                {finding.folderName}
              </span>
            )}
            <span className="text-[10px] text-gray-400 font-mono">
              Clause {finding.clauseNumber}
            </span>
            {finding.matchConfidence > 0 && (
              <span className="text-[10px] text-gray-400">{finding.matchConfidence}% confidence</span>
            )}
          </div>

          <p className="text-sm font-semibold text-gray-800 leading-tight">{finding.clauseTitle}</p>

          {finding.sopSectionAffected && (
            <p className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {finding.sopSectionAffected}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isNonActionable && onToggleApplicable && finding._id && (
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isApplicable ?? false}
                onChange={(e) => onToggleApplicable(finding._id!, e.target.checked)}
                className="h-3.5 w-3.5 text-purple-600 rounded"
              />
              <span className="text-[10px] text-gray-500 font-medium">Applicable</span>
            </label>
          )}
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded"
            title="Copy finding"
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors rounded"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Summary row */}
      {!expanded && finding.mismatchExplanation && !isNonActionable && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-600 line-clamp-2">{finding.mismatchExplanation}</p>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {finding.mismatchExplanation && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Gap / Issue</p>
              <p className="text-sm text-gray-700 leading-relaxed">{finding.mismatchExplanation}</p>
            </div>
          )}

          {finding.guidelineRequirement && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-wider mb-1">Guideline Requires</p>
              <p className="text-xs text-gray-600 leading-relaxed font-mono border-l-2 border-blue-200 pl-3">
                {finding.guidelineRequirement}
              </p>
            </div>
          )}

          {finding.sopTextSnippet && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">SOP Text Analyzed</p>
              <p className="text-xs text-gray-500 leading-relaxed font-mono border-l-2 border-gray-200 pl-3 italic">
                &ldquo;{finding.sopTextSnippet}&rdquo;
              </p>
            </div>
          )}

          {finding.suggestedAction && !isNonActionable && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Suggested Action</p>
                {finding.estimatedEffort && (
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded border ${EFFORT_COLORS[finding.estimatedEffort]}`}>
                    {finding.estimatedEffort} effort
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{finding.suggestedAction}</p>
            </div>
          )}

          {finding.suggestedText && !isNonActionable && (
            <div className="px-4 py-3 bg-emerald-50/50">
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-2">Proposed Verbiage</p>
              <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
                {finding.suggestedText}
              </pre>
            </div>
          )}

          {onReviewStatusChange && finding._id && (
            <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Review:</span>
              {(['pending', 'accepted', 'disputed', 'implemented'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onReviewStatusChange(finding._id!, s)}
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
      )}
    </div>
  );
}
