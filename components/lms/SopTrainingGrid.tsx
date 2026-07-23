'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, ChevronsUpDown, Eye, EyeOff, Loader2,
} from 'lucide-react';
import { hasGujaratiScript, isInvalidSopAssignmentCode, isPlaceholderSopName } from '@/lib/sop-name-resolution';
import type { MonthBreakdown } from '@/components/employees/EmployeeTrainingGrid';
import { colPct, sopGridColWidths } from '@/components/lms/trainingGridLayout';
import { DeptFieldCell } from '@/components/lms/DeptFieldCell';
import { getDeptCellColors } from '@/lib/department-colors';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW_BATCH = 50;

type SopStatus = 'completed' | 'not_completed';
type SortDir = 'asc' | 'desc';
interface SortState { key: string; dir: SortDir; }

export interface SopGridRow {
  sopKey: string;
  sopCode: string;
  sopName: string;
  sopNameGujarati?: string;
  department: string;
  assigned: number;
  completed: number;
  notCompleted: number;
  completionPct: number;
  monthlyBreakdown: MonthBreakdown[];
}

export type SopGridDrill =
  | { kind: 'status'; row: SopGridRow; status: SopStatus }
  | { kind: 'month'; row: SopGridRow; month: number; status: SopStatus };

const MONTH_STATUS_SUBS = [
  { suffix: 'completed', label: '✓', title: 'Completed', tone: 'text-green-600' },
  { suffix: 'notCompleted', label: '○', title: 'Not completed', tone: 'text-violet-600' },
] as const;

const MONTH_SUB_CELL = 'px-0 py-1 text-center align-middle';

function nextSort(prev: SortState, key: string, defaultDir: SortDir = 'asc'): SortState {
  if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: defaultDir };
}

function monthTotal(b: MonthBreakdown): number {
  return b.completed + b.notCompleted;
}

function monthSortValue(breakdown: MonthBreakdown | undefined, sub: typeof MONTH_STATUS_SUBS[number]['suffix'] | 'total'): number {
  if (!breakdown) return 0;
  if (sub === 'total') return monthTotal(breakdown);
  if (sub === 'completed') return breakdown.completed;
  return breakdown.notCompleted;
}

function parseMonthSortKey(key: string): { monthIndex: number; sub: typeof MONTH_STATUS_SUBS[number]['suffix'] | 'total' } | null {
  const match = key.match(/^m(\d+)(?:_(completed|notCompleted))?$/);
  if (!match) return null;
  return {
    monthIndex: Number(match[1]),
    sub: (match[2] as typeof MONTH_STATUS_SUBS[number]['suffix'] | undefined) ?? 'total',
  };
}

function SortHeader({
  label, sortKey, sort, onSort, align = 'left', cls = 'px-3 py-2.5', stickyCls = '', rowSpan,
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: 'left' | 'center';
  cls?: string;
  stickyCls?: string;
  rowSpan?: number;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      rowSpan={rowSpan}
      onClick={() => onSort(sortKey)}
      className={`${cls} ${stickyCls} cursor-pointer select-none whitespace-nowrap bg-gray-50 text-[11px] font-semibold uppercase tracking-wider transition hover:text-gray-700 ${active ? 'text-gray-700' : 'text-gray-500'}`}
    >
      <span className={`inline-flex items-center gap-0.5 ${align === 'center' ? 'w-full justify-center' : ''}`}>
        {label}
        {active
          ? (sort.dir === 'asc' ? <ArrowUp className="h-2.5 w-2.5 shrink-0" /> : <ArrowDown className="h-2.5 w-2.5 shrink-0" />)
          : <ChevronsUpDown className="h-2.5 w-2.5 shrink-0 opacity-30" />}
      </span>
    </th>
  );
}

function MonthSortHeader({
  label, title, tone, sortKey, sort, onSort, isFirst, isFuture, subIdx,
}: {
  label: string;
  title: string;
  tone: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  isFirst?: boolean;
  isFuture?: boolean;
  subIdx: number;
}) {
  const active = sort.key === sortKey;
  const borderCls = [
    isFirst ? 'border-l border-gray-200' : '',
    subIdx < 1 ? 'border-r border-gray-100' : '',
  ].filter(Boolean).join(' ');
  return (
    <th
      onClick={() => onSort(sortKey)}
      title={`${title} — click to sort`}
      className={`${MONTH_SUB_CELL} ${borderCls} cursor-pointer select-none bg-gray-50 transition hover:text-gray-700 ${isFuture ? 'bg-gray-100/90 text-gray-300' : active ? 'text-gray-700' : 'text-gray-500'}`}
    >
      <span className={`inline-flex flex-col items-center gap-px leading-none ${tone}`}>
        <span className="text-[9px] font-bold">{label}</span>
        {active && (sort.dir === 'asc'
          ? <ArrowUp className="h-2 w-2 shrink-0" />
          : <ArrowDown className="h-2 w-2 shrink-0" />)}
      </span>
    </th>
  );
}

function CountCell({
  count, tone, onClick,
}: {
  count: number;
  tone: 'green' | 'gray';
  onClick: () => void;
}) {
  if (count === 0) return <span className="text-sm text-violet-300">0</span>;
  const toneCls =
    tone === 'green' ? 'bg-green-50 text-green-700 hover:bg-green-100' :
    'bg-violet-50 text-violet-700 hover:bg-violet-100';
  return (
    <button
      onClick={onClick}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-bold transition ${toneCls}`}
      title="View employee breakdown"
    >
      {count}
    </button>
  );
}

function MiniMonthCount({
  count, tone, onClick,
}: {
  count: number;
  tone: 'green' | 'gray';
  onClick?: () => void;
}) {
  const toneCls =
    tone === 'green' ? 'bg-green-50 text-green-700 hover:bg-green-100' :
    'bg-violet-50 text-violet-700 hover:bg-violet-100';
  const body = (
    <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-bold leading-none ${count === 0 ? 'text-violet-200' : toneCls}`}>
      {count === 0 ? '·' : count}
    </span>
  );
  if (count === 0 || !onClick) return body;
  return (
    <button type="button" onClick={onClick} className="rounded transition" title="View employee breakdown">
      {body}
    </button>
  );
}

function OverallProgressCell({ pct, complete }: { pct: number; complete: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full ${complete ? 'bg-green-500' : 'bg-purple-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums text-gray-700">{pct}%</span>
    </div>
  );
}

function MonthStatusCell({
  count, monthIndex, status, onDrill, extraClass, subIdx,
}: {
  count: number;
  monthIndex: number;
  status: SopStatus;
  onDrill: (status: SopStatus) => void;
  extraClass?: string;
  subIdx: number;
}) {
  const currentMonth = new Date().getMonth();
  const isFuture = monthIndex > currentMonth;
  const tone: 'green' | 'gray' = status === 'completed' ? 'green' : 'gray';

  const borderCls = [
    subIdx === 0 ? 'border-l border-gray-200' : '',
    subIdx < 1 ? 'border-r border-gray-100' : '',
  ].filter(Boolean).join(' ');
  const cellCls = [MONTH_SUB_CELL, borderCls, extraClass].filter(Boolean).join(' ');

  if (isFuture) {
    return (
      <td className={`${cellCls} bg-gray-50/90`}>
        <span className="text-[9px] text-gray-300">—</span>
      </td>
    );
  }

  return (
    <td className={cellCls}>
      <MiniMonthCount
        count={count}
        tone={tone}
        onClick={count > 0 ? () => onDrill(status) : undefined}
      />
    </td>
  );
}

function SopNameCell({ name, gujarati, code, department }: { name: string; gujarati?: string; code: string; department: string }) {
  let english = name;
  let guj = gujarati;
  if (hasGujaratiScript(name) && !guj) {
    guj = name;
    english = isInvalidSopAssignmentCode(code) ? '' : code;
  }
  if (isPlaceholderSopName(english, code)) {
    english = isInvalidSopAssignmentCode(code) ? name : code;
  }
  const { text: codeColor } = getDeptCellColors(department);
  return (
    <div className="min-w-0">
      <p className="line-clamp-2 font-semibold text-gray-900 leading-tight text-xs" title={english}>{english}</p>
      {guj && hasGujaratiScript(guj) && guj !== english && (
        <p className="truncate text-[10px] font-medium text-indigo-700 leading-tight" title={guj}>{guj}</p>
      )}
      <p className={`truncate text-[10px] font-mono font-semibold ${codeColor}`}>{code}</p>
    </div>
  );
}

export function SopTrainingGrid({
  rows,
  loading,
  onDrill,
  emptyMessage = 'No SOPs found',
}: {
  rows: SopGridRow[];
  loading: boolean;
  onDrill: (drill: SopGridDrill) => void;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<SortState>({ key: 'sopName', dir: 'asc' });
  const [hideFutureMonths, setHideFutureMonths] = useState(true);
  const [visibleCount, setVisibleCount] = useState(ROW_BATCH);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  const onSort = useCallback((key: string) => {
    setSort((prev) => nextSort(prev, key, key === 'sopName' || key === 'sopCode' || key === 'department' ? 'asc' : 'desc'));
  }, []);

  const currentMonthIndex = new Date().getMonth();
  const visibleMonthIndices = useMemo(
    () => MONTHS.map((_, i) => i).filter((i) => !hideFutureMonths || i <= currentMonthIndex),
    [hideFutureMonths, currentMonthIndex],
  );
  const hiddenMonthCount = 12 - visibleMonthIndices.length;
  const cols = useMemo(
    () => sopGridColWidths(visibleMonthIndices.length),
    [visibleMonthIndices.length],
  );

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const valueOf = (r: SopGridRow): string | number => {
      switch (sort.key) {
        case 'sopName':       return r.sopName.toLowerCase();
        case 'sopCode':       return r.sopCode.toLowerCase();
        case 'department':    return r.department.toLowerCase();
        case 'assigned':      return r.assigned;
        case 'completed':     return r.completed;
        case 'notCompleted':  return r.notCompleted;
        case 'completionPct': return r.completionPct;
        default: {
          const monthSort = parseMonthSortKey(sort.key);
          if (monthSort) {
            return monthSortValue(r.monthlyBreakdown[monthSort.monthIndex], monthSort.sub);
          }
          return 0;
        }
      }
    };
    return [...rows].sort((a, b) => {
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.sopName.localeCompare(b.sopName);
    });
  }, [rows, sort]);

  useEffect(() => {
    setVisibleCount(ROW_BATCH);
  }, [rows.length, sort.key, sort.dir]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((c) => Math.min(c + ROW_BATCH, sorted.length));
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sorted.length, visibleCount]);

  const displayed = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;
  const lastVisibleMonth = visibleMonthIndices[visibleMonthIndices.length - 1];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-20">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white py-20">
        <p className="text-sm font-medium text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  const stickyHead = 'sticky top-0 z-20 bg-gray-50';
  const stickySopHead = 'sticky left-0 z-30 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]';
  const stickySopCell = 'sticky left-0 z-10 bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] group-hover:bg-gray-50';
  const tableColSpan = 5 + visibleMonthIndices.length * 2 + 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-2 text-[11px] text-gray-500">
        <span className="font-medium text-gray-600">Month columns:</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-green-50 px-1 text-[10px] font-bold text-green-700">✓</span> Completed</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-violet-50 px-1 text-[10px] font-bold text-violet-700">○</span> Not completed</span>
        <span className="text-gray-400">· click sub-headers to sort</span>
        <button
          type="button"
          onClick={() => setHideFutureMonths((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
          title={hideFutureMonths ? 'Show upcoming months' : 'Hide upcoming months'}
        >
          {hideFutureMonths ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {hideFutureMonths
            ? `Show future months${hiddenMonthCount > 0 ? ` (${hiddenMonthCount})` : ''}`
            : 'Hide future months'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col style={colPct(cols.primary)} />
            <col style={colPct(cols.dept)} />
            <col style={colPct(cols.stat)} />
            <col style={colPct(cols.stat)} />
            <col style={colPct(cols.stat)} />
            {visibleMonthIndices.flatMap((i) =>
              MONTH_STATUS_SUBS.map((sub) => (
                <col key={`${i}-${sub.suffix}`} style={colPct(cols.monthSub)} />
              )),
            )}
            <col style={colPct(cols.overall)} />
          </colgroup>
          <thead className={`border-b border-gray-200 ${stickyHead}`}>
            <tr>
              <SortHeader label="SOP" sortKey="sopName" sort={sort} onSort={onSort} cls="px-2 py-1.5 text-[10px]" stickyCls={stickySopHead} rowSpan={2} />
              <SortHeader label="Dept." sortKey="department" sort={sort} onSort={onSort} cls="px-2 py-1.5 text-[10px]" stickyCls={stickyHead} rowSpan={2} />
              <SortHeader label="Assign" sortKey="assigned" sort={sort} onSort={onSort} align="center" cls="px-0.5 py-1.5 text-[10px]" stickyCls={stickyHead} rowSpan={2} />
              <SortHeader label="Done" sortKey="completed" sort={sort} onSort={onSort} align="center" cls="px-0.5 py-1.5 text-[10px]" stickyCls={stickyHead} rowSpan={2} />
              <SortHeader label="Not" sortKey="notCompleted" sort={sort} onSort={onSort} align="center" cls="px-0.5 py-1.5 text-[10px]" stickyCls={stickyHead} rowSpan={2} />
              {visibleMonthIndices.map((i) => {
                const m = MONTHS[i];
                const isFuture = i > currentMonthIndex;
                const monthTotalActive = sort.key === `m${i}` || sort.key.startsWith(`m${i}_`);
                return (
                  <th
                    key={`${m}-group`}
                    colSpan={2}
                    className={`${stickyHead} border-l border-gray-200 px-0 py-0.5 text-center text-[9px] font-semibold uppercase tracking-tight ${isFuture ? 'bg-gray-100/90 text-gray-300' : monthTotalActive ? 'text-gray-700' : 'text-gray-500'}`}
                  >
                    {m.toUpperCase()}
                  </th>
                );
              })}
              <SortHeader label="Overall" sortKey="completionPct" sort={sort} onSort={onSort} cls="border-l border-gray-200 pl-3 pr-2 py-1.5 text-[10px]" stickyCls={stickyHead} rowSpan={2} />
            </tr>
            <tr>
              {visibleMonthIndices.map((i) => {
                const isFuture = i > currentMonthIndex;
                return MONTH_STATUS_SUBS.map(({ suffix, label, title, tone }, subIdx) => (
                  <MonthSortHeader
                    key={`m${i}-${suffix}`}
                    label={label}
                    title={title}
                    tone={tone}
                    sortKey={`m${i}_${suffix}`}
                    sort={sort}
                    onSort={onSort}
                    isFirst={subIdx === 0}
                    isFuture={isFuture}
                    subIdx={subIdx}
                  />
                ));
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayed.map((r) => (
              <tr key={r.sopKey} className="group hover:bg-gray-50">
                <td className={`${stickySopCell} px-2 py-1.5 align-top`}>
                  <SopNameCell name={r.sopName} gujarati={r.sopNameGujarati} code={r.sopCode} department={r.department} />
                </td>
                <DeptFieldCell value={r.department} department={r.department} />
                <td className="px-0.5 py-1.5 text-center font-semibold text-gray-700 text-xs">{r.assigned}</td>
                <td className="px-0.5 py-1.5 text-center">
                  <CountCell
                    count={r.completed}
                    tone="green"
                    onClick={() => r.completed > 0 && onDrill({ kind: 'status', row: r, status: 'completed' })}
                  />
                </td>
                <td className="px-0.5 py-1.5 text-center">
                  <CountCell
                    count={r.notCompleted}
                    tone="gray"
                    onClick={() => r.notCompleted > 0 && onDrill({ kind: 'status', row: r, status: 'not_completed' })}
                  />
                </td>
                {visibleMonthIndices.map((i) => {
                  const b = r.monthlyBreakdown[i];
                  return (
                    <Fragment key={i}>
                      <MonthStatusCell
                        count={b.completed}
                        monthIndex={i}
                        status="completed"
                        onDrill={(status) => onDrill({ kind: 'month', row: r, month: i + 1, status })}
                        subIdx={0}
                      />
                      <MonthStatusCell
                        count={b.notCompleted}
                        monthIndex={i}
                        status="not_completed"
                        onDrill={(status) => onDrill({ kind: 'month', row: r, month: i + 1, status })}
                        extraClass={i === lastVisibleMonth ? 'pr-2' : undefined}
                        subIdx={1}
                      />
                    </Fragment>
                  );
                })}
                <td className="overflow-hidden border-l border-gray-200 pl-3 pr-2 py-1.5">
                  {r.assigned === 0 ? (
                    <span className="text-[10px] text-violet-500 italic">No assignees</span>
                  ) : (
                    <OverallProgressCell pct={r.completionPct} complete={r.completionPct === 100} />
                  )}
                </td>
              </tr>
            ))}
            {hasMore && (
              <tr ref={sentinelRef}>
                <td colSpan={tableColSpan} className="px-4 py-4 text-center">
                  <span className="inline-flex items-center gap-2 text-xs text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading more rows… ({visibleCount} of {sorted.length})
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
