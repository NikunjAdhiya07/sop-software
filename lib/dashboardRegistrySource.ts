import { connectDB } from '@/lib/mongodb';
import SOP from '@/models/SOP';
import { groupSOPRecords } from '@/lib/sop-utils';
import { getServerGroupedCache, setServerGroupedCache } from '@/lib/cache';
import { getDashboardSopsCache, setDashboardSopsCache } from '@/lib/dashboardSopsCache';
import type { RegistrySOP } from '@/lib/types';

type DashboardPayload = {
  success: boolean;
  data?: Array<{
    sopNo: string;
    identifier: string;
    englishName: string;
    gujaratiName?: string;
    department: string;
    name: string;
  }>;
};

function registryToDashboardRows(items: RegistrySOP[]): DashboardPayload['data'] {
  return items.map((row) => ({
    sopNo: row.identifier,
    identifier: row.identifier,
    englishName: row.name,
    gujaratiName: row.nameGujarati,
    department: row.department,
    name: row.name,
  }));
}

async function loadGroupedRegistry(): Promise<RegistrySOP[]> {
  const cached = getServerGroupedCache();
  if (cached) return cached;

  await connectDB();
  const records = await SOP.find({}).sort({ updatedAt: -1 }).lean();
  const grouped = groupSOPRecords(records as never[]);
  setServerGroupedCache(grouped);
  return grouped;
}

/** Dashboard SOP registry payload — same universe as the Dashboard /api/sops route. */
export async function getDashboardRegistryPayload(): Promise<DashboardPayload> {
  const cached = await getDashboardSopsCache();
  if (cached?.payload) return cached.payload as DashboardPayload;

  const grouped = await loadGroupedRegistry();
  const payload: DashboardPayload = { success: true, data: registryToDashboardRows(grouped) };
  await setDashboardSopsCache(payload);
  return payload;
}

/** Grouped registry rows for server routes that need full RegistrySOP objects. */
export async function getGroupedRegistryRows(): Promise<RegistrySOP[]> {
  return loadGroupedRegistry();
}
