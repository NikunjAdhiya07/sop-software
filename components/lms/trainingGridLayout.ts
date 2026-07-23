/** Percent widths for table-fixed training grids (must sum to 100%). */

export interface TrainingGridColWidths {
  primary: number;
  secondary: number;
  dept: number;
  stat: number;
  overall: number;
  monthSub: number;
  actions: number;
}

export function employeeGridColWidths(monthCount: number, showActions: boolean): TrainingGridColWidths {
  const monthSubs = monthCount * 2;
  // Actions needs room for progress + edit/toggle/delete icons (~4 buttons).
  const actions = showActions ? 9 : 0;
  const primary = 13;
  const secondary = 7;
  const dept = 6;
  const stat = 3.5;
  const overall = 12;
  const fixed = primary + secondary + dept + stat * 3 + overall + actions;
  const monthSub = monthSubs > 0 ? (100 - fixed) / monthSubs : 0;
  return { primary, secondary, dept, stat, overall, monthSub, actions };
}

export function sopGridColWidths(monthCount: number): TrainingGridColWidths {
  const monthSubs = monthCount * 2;
  const primary = 16;
  const secondary = 0;
  const dept = 6.5;
  const stat = 4;
  const overall = 10;
  const actions = 0;
  const fixed = primary + dept + stat * 3 + overall;
  const monthSub = monthSubs > 0 ? (100 - fixed) / monthSubs : 0;
  return { primary, secondary, dept, stat, overall, monthSub, actions };
}

export function colPct(pct: number): { width: string } {
  return { width: `${pct}%` };
}
