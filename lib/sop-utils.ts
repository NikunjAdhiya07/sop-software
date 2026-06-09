import {
  differenceInDays,
  format,
  isAfter,
  isBefore,
  parseISO,
} from "date-fns";
import type { ISOP } from "@/models/SOP";
import type {
  DashboardStats,
  DepartmentCapsule,
  EditSOPFormData,
  EditSOPPayload,
  ExpiryTier,
  LanguageCode,
  RegistrySOP,
  SOPFilters,
} from "@/lib/types";

const NEAR_EXPIRY_DAYS = 90;
const MEDIUM_EXPIRY_DAYS = 180;

export function getExpiryTier(expiryDate?: Date | string | null): ExpiryTier {
  if (!expiryDate) return "none";
  const date = typeof expiryDate === "string" ? parseISO(expiryDate) : expiryDate;
  const days = differenceInDays(date, new Date());
  if (days < 0) return "expired";
  if (days <= NEAR_EXPIRY_DAYS) return "high";
  if (days <= MEDIUM_EXPIRY_DAYS) return "medium";
  // Any valid future date counts as "low" urgency — including far-future dates
  // beyond LOW_EXPIRY_DAYS. "none" is reserved for SOPs with no expiry date at all
  // (guarded above), so they aren't miscounted as "No Date".
  return "low";
}

export function formatExpiryLabel(expiryDate?: Date | string | null): string {
  if (!expiryDate) return "No Date";
  const date = typeof expiryDate === "string" ? parseISO(expiryDate) : expiryDate;
  const days = differenceInDays(date, new Date());
  if (days < 0) return `Expired - ${Math.abs(days)} days ago`;
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  return `${days} days (${months} months ${remDays} days)`;
}

export function complianceScoreFromStatus(status?: string): number {
  switch (status) {
    case "compliant":
      return 9;
    case "partial":
      return 6;
    case "non-compliant":
      return 3;
    default:
      return 0;
  }
}

function langKey(language?: string): "en" | "gu" {
  return language === "Gujarati" ? "gu" : "en";
}

function resolveLanguage(records: ISOP[]): LanguageCode {
  const langs = new Set(records.map((r) => r.language ?? "English"));
  if (langs.has("English") && langs.has("Gujarati")) return "ENG-GUJ";
  if (langs.has("Gujarati")) return "GUJ";
  return "ENG";
}

function versionNumber(version: string): number {
  return parseFloat(version) || 0;
}

function sopGroupKey(record: ISOP): string {
  // Always normalize through baseIdentifierFromIdentifier so records where sopBaseId was
  // mistakenly stored as the full versioned identifier (e.g. "PEGE01-05") still group correctly.
  const base = record.sopBaseId ?? record.identifier;
  return baseIdentifierFromIdentifier(base).toUpperCase();
}

function recordVersionNum(record: ISOP): number {
  // Always derive from recordVersion so the identifier-suffix override in recordVersion
  // takes effect. The stored versionNum DB field may have been saved with an old default
  // (e.g. 1 for records that had version="1.0") and would yield a wrong comparison.
  return versionNumber(recordVersion(record));
}

function recordVersion(record: ISOP): string {
  // When version is the schema default "1.0" (meaning it was never explicitly set), prefer the
  // version encoded in the identifier suffix (e.g. PEGE01-05 → "5") via resolveVersionForRecord.
  // For any other explicitly stored version, resolveVersionForRecord also handles tie-breaking.
  return resolveVersionForRecord(record.identifier, record.version);
}

export function maxVersionInGroup(group: ISOP[]): string {
  let bestNum = recordVersionNum(group[0]);
  let bestLabel = recordVersion(group[0]);
  for (const record of group) {
    const num = recordVersionNum(record);
    if (num > bestNum) {
      bestNum = num;
      bestLabel = recordVersion(record);
    }
  }
  return bestLabel;
}

export function recordsForVersion(group: ISOP[], version: string): ISOP[] {
  const target = versionNumber(version);
  return group.filter((record) => recordVersionNum(record) === target);
}

/** Each DB record represents one file — use fileUrl only to avoid cross-version pollution. */
function applyRecordFileLinks(
  record: ISOP,
  entry: { docx?: string; pdf?: string },
) {
  if (!record.fileUrl) return;
  if (record.fileType === "docx") entry.docx = record.fileUrl;
  if (record.fileType === "pdf") entry.pdf = record.fileUrl;
}

function collectVersionFiles(records: ISOP[]) {
  const docx: { en?: string; gu?: string } = {};
  const pdf: { en?: string; gu?: string } = {};

  for (const record of records) {
    if (!record.fileUrl) continue;
    const key = langKey(record.language);
    if (record.fileType === "docx") docx[key] = record.fileUrl;
    if (record.fileType === "pdf") pdf[key] = record.fileUrl;
  }

  return { docx, pdf };
}

function hasFile(links: { en?: string; gu?: string }, lang: "en" | "gu") {
  return Boolean(links[lang]);
}

export function asMediaArray(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

function pushMediaUrl(bucket: { en: string[]; gu: string[] }, key: "en" | "gu", ...urls: string[]) {
  for (const url of urls) {
    if (!url || bucket[key].includes(url)) continue;
    bucket[key].push(url);
  }
}

function collectMediaUrls(records: ISOP[]) {
  const videos = { en: [] as string[], gu: [] as string[] };
  const slides = { en: [] as string[], gu: [] as string[] };
  let thumbnail: string | undefined;

  for (const record of records) {
    if (record.mediaLinks?.thumbnail) thumbnail = record.mediaLinks.thumbnail;
    pushMediaUrl(videos, "en", ...asMediaArray(record.mediaLinks?.videos?.en));
    pushMediaUrl(videos, "gu", ...asMediaArray(record.mediaLinks?.videos?.gu));
    pushMediaUrl(slides, "en", ...asMediaArray(record.mediaLinks?.slides?.en));
    pushMediaUrl(slides, "gu", ...asMediaArray(record.mediaLinks?.slides?.gu));

    for (const doc of record.sopDocuments ?? []) {
      const key = doc.language?.toLowerCase().startsWith("gu") ? "gu" : "en";
      const type = doc.fileType?.toLowerCase();
      if (type === "video" && doc.filePath) pushMediaUrl(videos, key, doc.filePath);
      if (type === "slide" && doc.filePath) pushMediaUrl(slides, key, doc.filePath);
    }
  }

  return {
    videos: {
      en: videos.en.length ? videos.en : undefined,
      gu: videos.gu.length ? videos.gu : undefined,
    },
    slides: {
      en: slides.en.length ? slides.en : undefined,
      gu: slides.gu.length ? slides.gu : undefined,
    },
    thumbnail,
  };
}

function collectMedia(records: ISOP[]) {
  const { videos, slides } = collectMediaUrls(records);
  return {
    videos: { en: videos.en?.length ?? 0, gu: videos.gu?.length ?? 0 },
    slides: { en: slides.en?.length ?? 0, gu: slides.gu?.length ?? 0 },
  };
}

export function buildEditFormData(group: ISOP[]): EditSOPFormData {
  const currentVersion = maxVersionInGroup(group);
  const currentRecords = recordsForVersion(group, currentVersion);
  const sorted = [...currentRecords].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const primary = sorted[0] ?? group[0];
  const english =
    currentRecords.find((r) => r.language !== "Gujarati") ??
    group.find((r) => r.language !== "Gujarati") ??
    primary;
  const gujarati =
    currentRecords.find((r) => r.language === "Gujarati") ??
    group.find((r) => r.language === "Gujarati");
  const files = collectVersionFiles(currentRecords);
  const media = collectMediaUrls(currentRecords);
  const language = resolveLanguage(currentRecords.length ? currentRecords : group);
  const expiryDate = primary.expiryDate ?? english.expiryDate ?? gujarati?.expiryDate;

  return {
    identifier: primary.identifier,
    recordIds: group.map((r) => r._id.toString()),
    name: english.name,
    nameGujarati: gujarati?.name !== english.name ? gujarati?.name : undefined,
    department: primary.department,
    location: primary.location,
    version: currentVersion,
    language,
    owner: primary.owner,
    effectiveDate: primary.effectiveDate?.toISOString(),
    expiryDate: expiryDate?.toISOString(),
    reviewDate: primary.reviewDate?.toISOString(),
    processArea: primary.processArea,
    guidelineReference: primary.guidelineReference,
    remarks: primary.remarks,
    files,
    videos: media.videos,
    slides: media.slides,
    thumbnail: media.thumbnail,
  };
}

function parseOptionalDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function langLabel(key: "en" | "gu"): "English" | "Gujarati" {
  return key === "gu" ? "Gujarati" : "English";
}

export async function applyRegistryUpdate(group: ISOP[], payload: EditSOPPayload) {
  const currentVersion = maxVersionInGroup(group);
  const currentRecords = recordsForVersion(group, currentVersion);
  const currentIds = new Set(currentRecords.map((r) => r._id.toString()));
  const sopBaseId = baseIdentifierFromIdentifier(payload.identifier);
  const resolvedVersion = resolveVersionForRecord(payload.identifier, payload.version);
  const versionNum = versionNumber(resolvedVersion);

  const mediaLinks = {
    videos: {
      en: payload.videos.en?.length ? payload.videos.en : undefined,
      gu: payload.videos.gu?.length ? payload.videos.gu : undefined,
    },
    slides: {
      en: payload.slides.en?.length ? payload.slides.en : undefined,
      gu: payload.slides.gu?.length ? payload.slides.gu : undefined,
    },
    thumbnail: payload.thumbnail?.trim() || undefined,
  };

  for (const record of group) {
    const isGujarati = record.language === "Gujarati";
    const recordName =
      isGujarati && payload.nameGujarati?.trim()
        ? payload.nameGujarati.trim()
        : payload.name;
    const isCurrent = currentIds.has(record._id.toString());

    if (isCurrent) {
      const fileKey = langKey(record.language);
      const fileUrl =
        record.fileType === "docx"
          ? payload.files.docx[fileKey]?.trim()
          : record.fileType === "pdf"
            ? payload.files.pdf[fileKey]?.trim()
            : undefined;

      const lang = langLabel(fileKey);
      const fileDocs = buildFileDocuments(payload).filter(
        (doc) => doc.language === lang && doc.fileType === record.fileType,
      );
      const mediaDocs = buildMediaDocuments(payload);
      const preservedDocs = (record.sopDocuments ?? []).filter((doc) => {
        const type = doc.fileType?.toLowerCase();
        return type !== "docx" && type !== "pdf";
      });
      const sopDocuments = [...preservedDocs, ...fileDocs, ...mediaDocs];

      await record.updateOne({
        name: recordName,
        identifier: payload.identifier.trim(),
        department: payload.department,
        location: payload.location?.trim() || undefined,
        version: resolvedVersion,
        sopBaseId,
        versionNum,
        owner: payload.owner?.trim() || undefined,
        effectiveDate: parseOptionalDate(payload.effectiveDate),
        expiryDate: parseOptionalDate(payload.expiryDate),
        reviewDate: parseOptionalDate(payload.reviewDate),
        processArea: payload.processArea?.trim() || undefined,
        guidelineReference: payload.guidelineReference?.trim() || undefined,
        remarks: payload.remarks?.trim() || undefined,
        mediaLinks,
        ...(fileUrl ? { fileUrl } : {}),
        sopDocuments,
      });
    } else {
      await record.updateOne({
        name: recordName,
        department: payload.department,
        location: payload.location?.trim() || undefined,
        guidelineReference: payload.guidelineReference?.trim() || undefined,
      });
    }
  }
}

function buildFileDocuments(payload: EditSOPPayload) {
  const docs: NonNullable<ISOP["sopDocuments"]> = [];
  (["en", "gu"] as const).forEach((key) => {
    const lang = langLabel(key);
    const docx = payload.files.docx[key]?.trim();
    const pdf = payload.files.pdf[key]?.trim();
    if (docx) {
      docs.push({ filePath: docx, fileType: "docx", language: lang, fileName: `${payload.identifier}.docx` });
    }
    if (pdf) {
      docs.push({ filePath: pdf, fileType: "pdf", language: lang, fileName: `${payload.identifier}.pdf` });
    }
  });
  return docs;
}

function buildMediaDocuments(payload: EditSOPPayload) {
  const docs: NonNullable<ISOP["sopDocuments"]> = [];
  (["en", "gu"] as const).forEach((key) => {
    const lang = langLabel(key);
    for (const [index, video] of (payload.videos[key] ?? []).entries()) {
      const url = video.trim();
      if (!url) continue;
      docs.push({
        filePath: url,
        fileType: "video",
        language: lang,
        fileName: `${payload.identifier}-video-${index + 1}`,
      });
    }
    for (const [index, slide] of (payload.slides[key] ?? []).entries()) {
      const url = slide.trim();
      if (!url) continue;
      docs.push({
        filePath: url,
        fileType: "slide",
        language: lang,
        fileName: `${payload.identifier}-slide-${index + 1}`,
      });
    }
  });
  return docs;
}

function mergeSopDocuments(
  existing: NonNullable<ISOP["sopDocuments"]>,
  updated: NonNullable<ISOP["sopDocuments"]>,
) {
  const preserved = existing.filter((doc) => {
    const type = doc.fileType?.toLowerCase();
    return type !== "docx" && type !== "pdf" && type !== "video" && type !== "slide";
  });
  return [...preserved, ...updated];
}

export async function markRegistryObsolete(group: ISOP[], reason = "Moved to Obsolete SOPs") {
  const now = new Date();
  await Promise.all(
    group.map((record) =>
      record.updateOne({
        isObsolete: true,
        obsoleteAt: now,
        obsoleteReason: reason,
      }),
    ),
  );
}

export function groupSOPRecords(records: ISOP[]): RegistrySOP[] {
  const grouped = new Map<string, ISOP[]>();

  for (const record of records) {
    const key = sopGroupKey(record);
    const existing = grouped.get(key) ?? [];
    existing.push(record);
    grouped.set(key, existing);
  }

  const result: RegistrySOP[] = [];

  for (const [, group] of grouped) {
    const currentVersion = maxVersionInGroup(group);
    const currentRecords = recordsForVersion(group, currentVersion);
    const sorted = [...currentRecords].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const primary = sorted[0] ?? group[0];
    const english =
      currentRecords.find((r) => r.language !== "Gujarati") ??
      group.find((r) => r.language !== "Gujarati") ??
      primary;
    const gujarati =
      currentRecords.find((r) => r.language === "Gujarati") ??
      group.find((r) => r.language === "Gujarati");
    const files = collectVersionFiles(currentRecords);
    const language = resolveLanguage(currentRecords.length ? currentRecords : group);
    const expiryDate = primary.expiryDate ?? english.expiryDate ?? gujarati?.expiryDate;
    const uploadedAt = currentRecords.reduce(
      (latest, r) =>
        new Date(r.uploadedAt) > new Date(latest) ? r.uploadedAt.toISOString() : latest,
      primary.uploadedAt.toISOString(),
    );

    const hasVersion = group.some((r) => r.version || versionFromIdentifier(r.identifier));
    const hasVersionDate = currentRecords.some((r) => r.effectiveDate);
    const priorVersions = buildPriorVersions(group, currentVersion);

    const displayIdentifier =
      currentRecords.find((r) => {
        const fromId = versionFromIdentifier(r.identifier);
        return fromId && versionNumber(fromId) === versionNumber(currentVersion);
      })?.identifier ?? primary.identifier;

    result.push({
      id: primary._id.toString(),
      recordIds: group.map((r) => r._id.toString()),
      identifier: displayIdentifier,
      name: english.name,
      nameGujarati: gujarati?.name !== english.name ? gujarati?.name : undefined,
      version: currentVersion,
      department: primary.department,
      location: primary.location,
      language,
      guidelineReference: primary.guidelineReference,
      expiryDate: expiryDate?.toISOString(),
      effectiveDate: primary.effectiveDate?.toISOString(),
      uploadedAt,
      complianceStatus: primary.complianceStatus ?? "pending",
      complianceScore: complianceScoreFromStatus(primary.complianceStatus),
      pipelineStatus: primary.pipelineStatus ?? "idle",
      isObsolete: group.every((r) => r.isObsolete),
      isNew: differenceInDays(new Date(), new Date(primary.createdAt)) <= 14,
      files,
      media: collectMedia(currentRecords),
      priorVersions,
      hasVersion,
      hasVersionDate,
      expiryTier: getExpiryTier(expiryDate),
      mcqCount: currentRecords.reduce((sum, r) => sum + (r.mcqCount ?? 0), 0),
    });
  }

  return result;
}

function buildPriorVersions(group: ISOP[], currentVersion: string) {
  const currentNum = versionNumber(currentVersion);

  // Map uploaded prior-version files by "<versionNumber>-<lang>".
  const uploaded = new Map<string, { docx?: string; pdf?: string }>();
  for (const record of group) {
    const num = recordVersionNum(record);
    if (num >= currentNum) continue;
    const lang = record.language === "Gujarati" ? "GUJ" : "ENG";
    const key = `${num}-${lang}`;
    const entry = uploaded.get(key) ?? {};
    applyRecordFileLinks(record, entry);
    uploaded.set(key, entry);
  }

  // Always surface the two versions immediately below the current one (e.g. v5 → v4, v3),
  // per language the SOP family uses. Uploaded versions get file links; the rest are flagged
  // as missing so the table can show "not found". This updates automatically as new versions
  // are uploaded (the previous current version drops in here with its files).
  const familyLang = resolveLanguage(group);
  const familyLangs = familyLang === "ENG-GUJ" ? ["ENG", "GUJ"] : [familyLang];
  const top = Math.floor(currentNum) - 1;
  const bottom = Math.max(1, top - 1);

  const result: Array<{
    version: string;
    language: string;
    docx?: string;
    pdf?: string;
    missing?: boolean;
  }> = [];

  for (const lang of familyLangs) {
    for (let v = top; v >= bottom; v--) {
      const files = uploaded.get(`${v}-${lang}`);
      if (files && (files.docx || files.pdf)) {
        result.push({ version: String(v), language: lang, docx: files.docx, pdf: files.pdf });
      } else {
        result.push({ version: String(v), language: lang, missing: true });
      }
    }
  }

  // Newest first.
  return result.sort((a, b) => versionNumber(b.version) - versionNumber(a.version));
}

export function applyFilters(items: RegistrySOP[], filters: SOPFilters): RegistrySOP[] {
  let result = [...items];

  if (filters.obsoleteOnly) {
    result = result.filter((s) => s.isObsolete);
  } else {
    result = result.filter((s) => !s.isObsolete);
  }

  if (filters.department && filters.department !== "All" && filters.department !== "Total") {
    result = result.filter((s) => s.department === filters.department);
  }

  if (filters.language && filters.language !== "All") {
    result = result.filter((s) => {
      if (filters.language === "ENG-GUJ") return s.language === "ENG-GUJ";
      if (filters.language === "ENG")
        return s.language === "ENG" || s.language === "ENG-GUJ";
      if (filters.language === "GUJ")
        return s.language === "GUJ" || s.language === "ENG-GUJ";
      return true;
    });
  }

  if (filters.dualLanguage) {
    result = result.filter((s) => s.language === "ENG-GUJ");
  }

  if (filters.expiry && filters.expiry !== "All") {
    result = result.filter((s) => {
      if (filters.expiry === "Expired") return s.expiryTier === "expired";
      if (filters.expiry === "Near") return s.expiryTier === "high";
      if (filters.expiry === "Medium") return s.expiryTier === "medium";
      if (filters.expiry === "Low") return s.expiryTier === "low";
      if (filters.expiry === "No Date") return s.expiryTier === "none";
      return true;
    });
  }

  if (filters.fileType) {
    result = result.filter((s) => matchFileType(s, filters.fileType!));
  }

  if (filters.media) {
    result = result.filter((s) => matchMedia(s, filters.media!));
  }

  if (filters.versionStatus === "found") {
    result = result.filter((s) => s.hasVersion);
  } else if (filters.versionStatus === "missing") {
    result = result.filter((s) => !s.hasVersion);
  }

  if (filters.versionDate === "found") {
    result = result.filter((s) => s.hasVersionDate);
  } else if (filters.versionDate === "missing") {
    result = result.filter((s) => !s.hasVersionDate);
  }

  if (filters.absoluteSop) {
    result = result.filter(
      (s) =>
        hasFile(s.files.docx, "en") &&
        hasFile(s.files.pdf, "en") &&
        s.hasVersion &&
        s.hasVersionDate &&
        s.expiryTier !== "none",
    );
  }

  if (filters.dateFrom) {
    const from = parseISO(filters.dateFrom);
    result = result.filter((s) => !isBefore(parseISO(s.uploadedAt), from));
  }

  if (filters.dateTo) {
    const to = parseISO(filters.dateTo);
    result = result.filter((s) => !isAfter(parseISO(s.uploadedAt), to));
  }

  if (filters.locations?.length) {
    result = result.filter((s) => s.location && filters.locations!.includes(s.location));
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const field = filters.searchField ?? "All";
    result = result.filter((s) => {
      const targets: Record<string, string> = {
        All: `${s.identifier} ${s.name} ${s.nameGujarati ?? ""} ${s.department} ${s.location ?? ""}`,
        "SOP No": s.identifier,
        Name: `${s.name} ${s.nameGujarati ?? ""}`,
        Department: s.department,
        Location: s.location ?? "",
      };
      return (targets[field] ?? targets.All).toLowerCase().includes(q);
    });
  }

  return sortRegistry(result, filters.sortBy, filters.sortDir);
}

function matchFileType(s: RegistrySOP, fileType: string): boolean {
  switch (fileType) {
    case "DOCX":
      return Boolean(s.files.docx.en || s.files.docx.gu);
    case "No DOCX":
      return !s.files.docx.en && !s.files.docx.gu;
    case "PDF":
      return Boolean(s.files.pdf.en || s.files.pdf.gu);
    case "No PDF":
      return !s.files.pdf.en && !s.files.pdf.gu;
    default:
      return true;
  }
}

function matchMedia(s: RegistrySOP, media: string): boolean {
  const videoCount = s.media.videos.en + s.media.videos.gu;
  const slideCount = s.media.slides.en + s.media.slides.gu;
  switch (media) {
    case "Video":
      return videoCount > 0;
    case "No Video":
      return videoCount === 0;
    case "Slides":
      return slideCount > 0;
    case "No Slides":
      return slideCount === 0;
    case "No Media":
      return videoCount === 0 && slideCount === 0;
    default:
      return true;
  }
}

function sortRegistry(
  items: RegistrySOP[],
  sortBy = "identifier",
  sortDir: "asc" | "desc" = "asc",
): RegistrySOP[] {
  const dir = sortDir === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const compare = (x: string | number, y: string | number) =>
      x < y ? -1 * dir : x > y ? 1 * dir : 0;

    switch (sortBy) {
      case "name":
        return compare(a.name.toLowerCase(), b.name.toLowerCase());
      case "department":
        return compare(a.department, b.department);
      case "location":
        return compare(a.location ?? "", b.location ?? "");
      case "version":
        return compare(parseFloat(a.version) || 0, parseFloat(b.version) || 0);
      case "expiryDate":
        return compare(a.expiryDate ?? "", b.expiryDate ?? "");
      case "language":
        return compare(a.language, b.language);
      case "complianceScore":
        return compare(a.complianceScore, b.complianceScore);
      case "uploadedAt":
        return compare(a.uploadedAt, b.uploadedAt);
      default:
        return compare(a.identifier, b.identifier);
    }
  });
}

export function paginate<T>(items: T[], page = 1, limit = 50): { items: T[]; total: number } {
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), total: items.length };
}

function emptyLangPair() {
  return { found: 0, missing: 0, en: { found: 0, missing: 0 }, gu: { found: 0, missing: 0 } };
}

function buildCapsule(department: string, sops: RegistrySOP[]): DepartmentCapsule {
  const needsEn = (s: RegistrySOP) => s.language === "ENG" || s.language === "ENG-GUJ";
  const needsGu = (s: RegistrySOP) => s.language === "GUJ" || s.language === "ENG-GUJ";

  const capsule: DepartmentCapsule = {
    department,
    total: sops.length,
    dualLanguage: sops.filter((s) => s.language === "ENG-GUJ").length,
    withEn: sops.filter(needsEn).length,
    withGu: sops.filter(needsGu).length,
    expired: sops.filter((s) => s.expiryTier === "expired").length,
    nearExpiry: sops.filter((s) => s.expiryTier === "high").length,
    active: sops.filter((s) => s.expiryTier !== "expired" && s.expiryTier !== "none").length,
    noDate: sops.filter((s) => s.expiryTier === "none").length,
    docx: emptyLangPair(),
    pdf: emptyLangPair(),
    version: { found: 0, missing: 0 },
    versionDate: {
      found: 0,
      missing: 0,
      en: { found: 0, missing: 0 },
      gu: { found: 0, missing: 0 },
    },
    videos: {
      available: 0,
      required: sops.length,
      missing: 0,
      en: { available: 0, missing: 0 },
      gu: { available: 0, missing: 0 },
    },
    slides: {
      available: 0,
      required: sops.length,
      missing: 0,
      en: { available: 0, missing: 0 },
      gu: { available: 0, missing: 0 },
    },
  };

  for (const sop of sops) {
    for (const [type, files] of [
      ["docx", sop.files.docx],
      ["pdf", sop.files.pdf],
    ] as const) {
      const bucket = type === "docx" ? capsule.docx : capsule.pdf;
      for (const lang of ["en", "gu"] as const) {
        if (hasFile(files, lang)) {
          bucket.found++;
          bucket[lang].found++;
        } else if (
          sop.language === "ENG-GUJ" ||
          (lang === "en" && sop.language === "ENG") ||
          (lang === "gu" && sop.language === "GUJ")
        ) {
          bucket.missing++;
          bucket[lang].missing++;
        }
      }
    }

    if (sop.hasVersion) capsule.version.found++;
    else capsule.version.missing++;

    if (sop.hasVersionDate) {
      capsule.versionDate.found++;
      if (needsEn(sop)) capsule.versionDate.en.found++;
      if (needsGu(sop)) capsule.versionDate.gu.found++;
    } else {
      capsule.versionDate.missing++;
      if (needsEn(sop)) capsule.versionDate.en.missing++;
      if (needsGu(sop)) capsule.versionDate.gu.missing++;
    }

    const totalVideos = sop.media.videos.en + sop.media.videos.gu;
    const totalSlides = sop.media.slides.en + sop.media.slides.gu;

    capsule.videos.available += totalVideos;
    capsule.videos.missing += Math.max(0, 1 - totalVideos);
    capsule.videos.en.available += sop.media.videos.en;
    capsule.videos.en.missing += needsEn(sop) && sop.media.videos.en === 0 ? 1 : 0;
    capsule.videos.gu.available += sop.media.videos.gu;
    capsule.videos.gu.missing += needsGu(sop) && sop.media.videos.gu === 0 ? 1 : 0;

    capsule.slides.available += totalSlides;
    capsule.slides.missing += Math.max(0, 1 - totalSlides);
    capsule.slides.en.available += sop.media.slides.en;
    capsule.slides.en.missing += needsEn(sop) && sop.media.slides.en === 0 ? 1 : 0;
    capsule.slides.gu.available += sop.media.slides.gu;
    capsule.slides.gu.missing += needsGu(sop) && sop.media.slides.gu === 0 ? 1 : 0;
  }

  return capsule;
}

export function buildDashboardStats(registry: RegistrySOP[]): DashboardStats {
  const active = registry.filter((s) => !s.isObsolete);
  const departments = [...new Set(active.map((s) => s.department))].sort();
  const deptCapsules = departments.map((d) =>
    buildCapsule(d, active.filter((s) => s.department === d)),
  );

  return {
    totalSops: active.length,
    expired: active.filter((s) => s.expiryTier === "expired").length,
    nearExpiry: active.filter((s) => s.expiryTier === "high").length,
    mediumExpiry: active.filter((s) => s.expiryTier === "medium").length,
    lowExpiry: active.filter((s) => s.expiryTier === "low").length,
    noDate: active.filter((s) => s.expiryTier === "none").length,
    videosUploaded: active.reduce((s, r) => s + r.media.videos.en + r.media.videos.gu, 0),
    slidesUploaded: active.reduce((s, r) => s + r.media.slides.en + r.media.slides.gu, 0),
    guidelinesTotal: active.filter((s) => s.guidelineReference).length,
    guidelinesAnalyzed: active.filter((s) => s.complianceStatus !== "pending").length,
    departments: [buildCapsule("Total", active), ...deptCapsules],
    priorVersionCount: active.reduce(
      (s, r) => s + r.priorVersions.filter((pv) => !pv.missing).length,
      0,
    ),
  };
}

export function formatUploaded(dateStr: string) {
  return format(parseISO(dateStr), "dd MMM yyyy HH:mm");
}

export function parseFiltersFromSearchParams(params: URLSearchParams): SOPFilters {
  return {
    search: params.get("search") ?? undefined,
    searchField: params.get("searchField") ?? "All",
    department: params.get("department") ?? undefined,
    language: params.get("language") ?? undefined,
    fileType: params.get("fileType") ?? undefined,
    media: params.get("media") ?? undefined,
    expiry: params.get("expiry") ?? undefined,
    versionStatus: params.get("versionStatus") ?? undefined,
    versionDate: params.get("versionDate") ?? undefined,
    dualLanguage: params.get("dualLanguage") === "true",
    absoluteSop: params.get("absoluteSop") === "true",
    obsoleteOnly: params.get("obsoleteOnly") === "true",
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    locations: params.getAll("location"),
    sortBy: params.get("sortBy") ?? "identifier",
    sortDir: (params.get("sortDir") as "asc" | "desc") ?? "asc",
    page: parseInt(params.get("page") ?? "1", 10),
    limit: parseInt(params.get("limit") ?? "50", 10),
  };
}

export function defaultExpiryDate(months = 24): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
}

/** Base SOP code without the version suffix (e.g. PEGE11-11 → PEGE11, QA-DP-01 → QA-DP). */
export function baseIdentifierFromIdentifier(identifier: string): string {
  const code = identifier.trim().toUpperCase().replace(/_/g, "-");
  if (!code) return code;

  const hyphenated = code.match(/^([A-Z]{2,}[A-Z0-9]*)-\d+$/);
  if (hyphenated) return hyphenated[1];

  const segmented = code.match(/^([A-Z]{2,}-[A-Z]{2,})-\d+$/);
  if (segmented) return segmented[1];

  return code;
}

/** Match all identifier variants for the same SOP family (e.g. PEGE11, PEGE11-09, PEGE11-11). */
export function sopFamilyIdentifierRegex(identifier: string): RegExp {
  const base = baseIdentifierFromIdentifier(identifier);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(`^${escaped}(-\\d+)?$`, "i");
}

/** SOP codes like QAGE01-11 encode the version in the suffix after the final hyphen segment. */
export function versionFromIdentifier(identifier: string): string | null {
  const code = identifier.trim().toUpperCase().replace(/_/g, "-");
  if (!code) return null;

  const hyphenated = code.match(/^[A-Z]{2,}[A-Z0-9]*-(\d+)$/);
  if (hyphenated) return hyphenated[1];

  const segmented = code.match(/^[A-Z]{2,}-[A-Z]{2,}-(\d+)$/);
  if (segmented) return segmented[1];

  return null;
}

export function resolveSopVersion(identifier: string, storedVersion?: string | null): string {
  return resolveVersionForRecord(identifier, storedVersion);
}

/** Extract SOP code from a folder/filename segment (e.g. "PEGE01-10 - Title" → PEGE01-10). */
export function extractSopCodeFromSegment(segment: string): string | null {
  const trimmed = segment.trim();
  const hyphenated = trimmed.match(/^([A-Z]{2,}[A-Z0-9]*-\d+)/i);
  if (hyphenated) return hyphenated[1].toUpperCase().replace(/_/g, "-");
  const segmented = trimmed.match(/^([A-Z]{2,}-[A-Z]{2,}-\d+)/i);
  if (segmented) return segmented[1].toUpperCase().replace(/_/g, "-");
  return null;
}

export function titleFromFolderSegment(segment: string, sopCode: string): string | null {
  const codePattern = sopCode.replace(/[-]/g, String.raw`[\s_-]`);
  const stripped = segment
    .trim()
    .replace(new RegExp(`^${codePattern}[\\s_\\-–]+`, "i"), "")
    .trim();
  return stripped || null;
}

export function extractIdentifierFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  const fromSegment = extractSopCodeFromSegment(base);
  if (fromSegment) return fromSegment;
  const embedded = base.match(/([A-Z]{2,}[A-Z0-9]*-\d+)/i);
  if (embedded) return embedded[1].toUpperCase().replace(/_/g, "-");
  const segmented = base.match(/([A-Z]{2,}-[A-Z]{2,}-\d+)/i);
  if (segmented) return segmented[1].toUpperCase().replace(/_/g, "-");
  return base.slice(0, 20).toUpperCase();
}

const FOLDER_DEPARTMENT_ALIASES: Record<string, string> = {
  qa: "QA",
  "quality assurance": "QA",
  qc: "QC",
  "quality control": "QC",
  microbiology: "Microbiology",
  micro: "Microbiology",
  production: "Production",
  prod: "Production",
  store: "Store",
  stores: "Store",
  engineering: "Engineering and Maintenance",
  maintenance: "Engineering and Maintenance",
  "engineering and maintenance": "Engineering and Maintenance",
  "e&m": "Engineering and Maintenance",
  personnel: "Personnel",
  hr: "Personnel",
  general: "General",
};

const IDENTIFIER_DEPARTMENT_RULES: { pattern: RegExp; department: string }[] = [
  { pattern: /^QA[A-Z0-9]/i, department: "QA" },
  { pattern: /^QC[A-Z0-9]/i, department: "QC" },
  { pattern: /^MIC[A-Z0-9]/i, department: "Microbiology" },
  { pattern: /^MI[A-Z0-9]/i, department: "Microbiology" },
  { pattern: /^(PROD|PRD|PD)[A-Z0-9]/i, department: "Production" },
  { pattern: /^(STR|STOR|BS)[A-Z0-9]/i, department: "Store" },
  { pattern: /^(ENG|EM)[A-Z0-9]/i, department: "Engineering and Maintenance" },
  { pattern: /^(PER|PE)[A-Z0-9]/i, department: "Personnel" },
];

function normalizeFolderDepartment(segment: string): string | null {
  const cleaned = segment.trim().replace(/[_]+/g, " ");
  const key = cleaned.toLowerCase();
  if (FOLDER_DEPARTMENT_ALIASES[key]) return FOLDER_DEPARTMENT_ALIASES[key];

  for (const [alias, department] of Object.entries(FOLDER_DEPARTMENT_ALIASES)) {
    if (key === alias || key.startsWith(`${alias} `) || key.endsWith(` ${alias}`)) {
      return department;
    }
  }

  return null;
}

export function departmentFromIdentifier(identifier: string): string | null {
  const code = identifier.trim().toUpperCase().replace(/_/g, "-");
  if (!code) return null;

  for (const rule of IDENTIFIER_DEPARTMENT_RULES) {
    if (rule.pattern.test(code)) return rule.department;
  }

  return null;
}

export function departmentFromRelativePath(relativePath: string): string | null {
  const segments = relativePath.split(/[/\\]/).filter(Boolean);
  for (const segment of segments) {
    const direct = normalizeFolderDepartment(segment);
    if (direct && direct !== "General") return direct;

    const folderLabel = segment.split(/\s*[-–]\s*/)[0]?.trim() ?? segment;
    const fromCode = departmentFromIdentifier(folderLabel);
    if (fromCode) return fromCode;

    if (/^qa\b/i.test(segment)) return "QA";
    if (/^qc\b/i.test(segment)) return "QC";
    if (/microbiology/i.test(segment)) return "Microbiology";
    if (/production/i.test(segment)) return "Production";
    if (/\bstore\b/i.test(segment)) return "Store";
    if (/engineering|maintenance/i.test(segment)) return "Engineering and Maintenance";
    if (/personnel/i.test(segment)) return "Personnel";
  }

  return null;
}

export function resolveDepartmentFromUpload(opts: {
  relativePath?: string;
  identifier?: string;
  batchOverride?: string;
}): string {
  if (opts.batchOverride?.trim()) {
    const override = opts.batchOverride.trim();
    return FOLDER_DEPARTMENT_ALIASES[override.toLowerCase()] ?? override;
  }

  if (opts.relativePath) {
    const fromPath = departmentFromRelativePath(opts.relativePath);
    if (fromPath) return fromPath;
  }

  if (opts.identifier) {
    const fromId = departmentFromIdentifier(opts.identifier);
    if (fromId) return fromId;
  }

  return "General";
}

export function fileUrlToRelativePath(fileUrl?: string): string | undefined {
  if (!fileUrl?.trim()) return undefined;
  try {
    const raw = fileUrl.trim();
    const path = raw.startsWith("http://") || raw.startsWith("https://")
      ? new URL(raw).pathname
      : raw;
    return path.replace(/^\/?uploads\/?/i, "").replace(/^\//, "");
  } catch {
    return fileUrl;
  }
}

/** Re-resolve department for records already in the database (identifier takes priority). */
export function resolveDepartmentForExistingSop(sop: {
  identifier: string;
  folderPath?: string;
  fileUrl?: string;
  originalFileName?: string;
  deptManualOverride?: boolean;
}): string | null {
  if (sop.deptManualOverride) return null;

  const fromId = departmentFromIdentifier(sop.identifier);
  if (fromId) return fromId;

  const pathCandidates = [
    sop.folderPath,
    fileUrlToRelativePath(sop.fileUrl),
    sop.originalFileName,
  ].filter(Boolean) as string[];

  for (const candidate of pathCandidates) {
    const fromPath = departmentFromRelativePath(candidate);
    if (fromPath && fromPath !== "General") return fromPath;
  }

  return null;
}

export function parseUploadPathMetadata(relativePath: string) {
  const segments = relativePath.split(/[/\\]/).filter(Boolean);
  const fileName = segments.at(-1) ?? relativePath;
  const folderPath = segments.length > 1 ? segments.slice(0, -1).join("/") : undefined;
  const parentFolder = segments.length > 2 ? segments.at(-2) : undefined;
  const folderSegments = segments.slice(0, -1);

  const vFolderIndex = folderSegments.findIndex((s) => /^v\d+(\.\d+)?$/i.test(s.trim()));
  const versionFromVFolder =
    vFolderIndex >= 0 ? folderSegments[vFolderIndex].trim().replace(/^v/i, "") : undefined;

  let identifierFromPath: string | undefined;
  let titleFromPath: string | undefined;

  if (versionFromVFolder && vFolderIndex > 0) {
    for (let i = vFolderIndex - 1; i >= 0; i--) {
      const code = extractSopCodeFromSegment(folderSegments[i]);
      if (code) {
        identifierFromPath = code;
        titleFromPath = titleFromFolderSegment(folderSegments[i], code) ?? undefined;
        break;
      }
    }
  }

  if (!identifierFromPath) {
    for (let i = folderSegments.length - 1; i >= 0; i--) {
      const code = extractSopCodeFromSegment(folderSegments[i]);
      if (code) {
        identifierFromPath = code;
        titleFromPath = titleFromFolderSegment(folderSegments[i], code) ?? undefined;
        break;
      }
    }
  }

  const versionFromFolder = identifierFromPath
    ? versionFromIdentifier(identifierFromPath) ?? undefined
    : undefined;

  return {
    fileName,
    folderPath,
    parentFolder,
    identifierFromPath,
    titleFromPath,
    versionFromPath: versionFromVFolder ?? versionFromFolder,
  };
}

/** Resolve the canonical version label for a record. */
export function resolveVersionForRecord(
  identifier: string,
  storedVersion?: string | null,
  pathVersion?: string | null,
): string {
  const fromPath = pathVersion?.trim();
  if (fromPath) return fromPath;

  const rawFromId = versionFromIdentifier(identifier);
  // Normalise to remove leading zeros (e.g. "05" → "5") so display matches expectations.
  const fromId = rawFromId != null ? String(parseInt(rawFromId, 10)) : null;
  const stored = storedVersion?.trim();
  if (fromId) {
    if (!stored || stored === "1.0" || versionNumber(stored) === versionNumber(fromId)) {
      return fromId;
    }
    return stored;
  }

  return stored ?? "1.0";
}

export function sopVersionFields(identifier: string, storedVersion?: string | null, pathVersion?: string | null) {
  const version = resolveVersionForRecord(identifier, storedVersion, pathVersion);
  return {
    version,
    sopBaseId: baseIdentifierFromIdentifier(identifier),
    versionNum: versionNumber(version),
  };
}

// Lines that are never the SOP title — skip them when scanning document text.
const TITLE_SKIP = /^(standard\s+operating\s+procedure|document\s+(no|number|title)|sop\s+(no|number|title)|revision|version\s+no|date\s+of|effective\s+date|approved\s+by|prepared\s+by|reviewed\s+by|page\s+\d|confidential|internal\s+use|copy\s+no)/i;

/**
 * Extract the SOP title from the first meaningful lines of extracted document text.
 * Returns null when no reliable title is found.
 */
export function extractTitleFromContent(content: string, identifier: string): string | null {
  if (!content || content.startsWith("[")) return null;

  const sopBase = baseIdentifierFromIdentifier(identifier).toUpperCase();
  // Regex to detect lines that are just the SOP code or version reference
  const codeLineRe = new RegExp(`^[A-Z]{2,}[A-Z0-9]*[-]\\d+`, "i");

  const lines = content
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 30)) {
    if (line.length < 4 || line.length > 160) continue;
    if (codeLineRe.test(line)) continue;           // skip lines starting with SOP code
    if (line.toUpperCase().includes(sopBase)) continue; // skip lines containing base code
    if (TITLE_SKIP.test(line)) continue;           // skip boilerplate headers
    if (/^\d+[\s.]/.test(line)) continue;          // skip numbered section headings
    if (!/[a-zA-Z]{3}/.test(line)) continue;       // must contain at least 3 letters

    // Normalize ALL_CAPS to Title Case
    if (line === line.toUpperCase() && /[A-Z]{2}/.test(line)) {
      return line
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return line;
  }

  return null;
}

