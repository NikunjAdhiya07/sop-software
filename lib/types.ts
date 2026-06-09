export type ExpiryTier = "expired" | "high" | "medium" | "low" | "none";

export type LanguageCode = "ENG" | "GUJ" | "ENG-GUJ";

export interface FileLinks {
  en?: string;
  gu?: string;
}

export interface MediaFileLinks {
  en?: string[];
  gu?: string[];
}

export interface RegistrySOP {
  id: string;
  recordIds: string[];
  identifier: string;
  name: string;
  nameGujarati?: string;
  version: string;
  department: string;
  location?: string;
  language: LanguageCode;
  guidelineReference?: string;
  expiryDate?: string;
  effectiveDate?: string;
  uploadedAt: string;
  complianceStatus: string;
  complianceScore: number;
  pipelineStatus: string;
  isObsolete: boolean;
  isNew: boolean;
  files: {
    docx: FileLinks;
    pdf: FileLinks;
  };
  media: {
    videos: { en: number; gu: number };
    slides: { en: number; gu: number };
  };
  priorVersions: PriorVersion[];
  hasVersion: boolean;
  hasVersionDate: boolean;
  expiryTier: ExpiryTier;
  mcqCount: number;
}

export interface PriorVersion {
  version: string;
  language: string;
  docx?: string;
  pdf?: string;
  /** True when this version is expected (below the current version) but was never uploaded. */
  missing?: boolean;
}

export interface EditSOPFormData {
  identifier: string;
  recordIds: string[];
  name: string;
  nameGujarati?: string;
  department: string;
  location?: string;
  version: string;
  language: LanguageCode;
  owner?: string;
  effectiveDate?: string;
  expiryDate?: string;
  reviewDate?: string;
  processArea?: string;
  guidelineReference?: string;
  remarks?: string;
  files: {
    docx: FileLinks;
    pdf: FileLinks;
  };
  videos: MediaFileLinks;
  slides: MediaFileLinks;
  thumbnail?: string;
}

export interface EditSOPPayload {
  name: string;
  nameGujarati?: string;
  department: string;
  location?: string;
  identifier: string;
  version: string;
  owner?: string;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  reviewDate?: string | null;
  processArea?: string;
  guidelineReference?: string;
  remarks?: string;
  files: {
    docx: FileLinks;
    pdf: FileLinks;
  };
  videos: MediaFileLinks;
  slides: MediaFileLinks;
  thumbnail?: string;
}

export interface DepartmentCapsule {
  department: string;
  total: number;
  dualLanguage: number;
  withEn: number;
  withGu: number;
  expired: number;
  nearExpiry: number;
  active: number;
  noDate: number;
  docx: { found: number; missing: number; en: { found: number; missing: number }; gu: { found: number; missing: number } };
  pdf: { found: number; missing: number; en: { found: number; missing: number }; gu: { found: number; missing: number } };
  version: { found: number; missing: number };
  versionDate: {
    found: number;
    missing: number;
    en: { found: number; missing: number };
    gu: { found: number; missing: number };
  };
  videos: {
    available: number;
    required: number;
    missing: number;
    en: { available: number; missing: number };
    gu: { available: number; missing: number };
  };
  slides: {
    available: number;
    required: number;
    missing: number;
    en: { available: number; missing: number };
    gu: { available: number; missing: number };
  };
}

export interface DashboardStats {
  totalSops: number;
  expired: number;
  nearExpiry: number;
  mediumExpiry: number;
  lowExpiry: number;
  noDate: number;
  videosUploaded: number;
  slidesUploaded: number;
  guidelinesTotal: number;
  guidelinesAnalyzed: number;
  departments: DepartmentCapsule[];
  priorVersionCount: number;
}

export interface SOPFilters {
  search?: string;
  searchField?: string;
  department?: string;
  language?: string;
  fileType?: string;
  media?: string;
  expiry?: string;
  versionStatus?: string;
  versionDate?: string;
  dualLanguage?: boolean;
  absoluteSop?: boolean;
  obsoleteOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  locations?: string[];
  versions?: string[];
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface PipelineJob {
  id: string;
  identifier: string;
  language: string;
  stage: "mcq_generating" | "similarity_checking" | "compliance_fixing" | "updating_platform";
  status: "pending" | "running" | "done" | "failed";
  progress: number;
  error?: string;
  startedAt: number;
}
