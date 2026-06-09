"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Pencil, Presentation, Video, X } from "lucide-react";
import type { EditSOPFormData, EditSOPPayload } from "@/lib/types";
import { useDashboardStore } from "@/lib/store/dashboard-store";
import { ExistingMediaList, MediaFilePicker } from "./MediaFilePicker";
import { Btn } from "./ui";

const DEPARTMENTS = [
  "QA",
  "QC",
  "Microbiology",
  "Production",
  "Store",
  "Engineering and Maintenance",
  "Personnel",
];

function toDateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function emptyForm(): EditSOPFormData {
  return {
    identifier: "",
    recordIds: [],
    name: "",
    department: "QA",
    version: "1.0",
    language: "ENG",
    files: { docx: {}, pdf: {} },
    videos: {},
    slides: {},
  };
}

interface EditSOPModalProps {
  open: boolean;
  identifier: string | null;
  departmentList: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function EditSOPModal({
  open,
  identifier,
  departmentList,
  onClose,
  onSuccess,
}: EditSOPModalProps) {
  const { showToast } = useDashboardStore();
  const [form, setForm] = useState<EditSOPFormData>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newVideos, setNewVideos] = useState<File[]>([]);
  const [newSlides, setNewSlides] = useState<File[]>([]);
  const [newThumbnail, setNewThumbnail] = useState<File[]>([]);

  const allDepts = [...new Set([...DEPARTMENTS, ...departmentList])];
  const existingVideos = useMemo(
    () => [...(form.videos.en ?? []), ...(form.videos.gu ?? [])],
    [form.videos],
  );
  const existingSlides = useMemo(
    () => [...(form.slides.en ?? []), ...(form.slides.gu ?? [])],
    [form.slides],
  );

  useEffect(() => {
    if (!open || !identifier) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/sops/registry/${encodeURIComponent(identifier)}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to load SOP");
        }
        return res.json() as Promise<EditSOPFormData>;
      })
      .then((data) => {
        if (!cancelled) {
          setForm(data);
          setNewVideos([]);
          setNewSlides([]);
          setNewThumbnail([]);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : "Failed to load SOP");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, identifier, onClose, showToast]);

  const updateField = <K extends keyof EditSOPFormData>(key: K, value: EditSOPFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!identifier) return;
    setSaving(true);
    try {
      let mediaForm = form;

      if (newVideos.length || newSlides.length || newThumbnail.length) {
        const uploadData = new FormData();
        uploadData.append("identifier", form.identifier.trim());
        newVideos.forEach((file) => uploadData.append("videos", file));
        newSlides.forEach((file) => uploadData.append("slides", file));
        if (newThumbnail[0]) uploadData.append("thumbnail", newThumbnail[0]);

        const uploadRes = await fetch("/api/sop/media-upload", {
          method: "POST",
          body: uploadData,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadJson.error ?? "Failed to upload media files");
        }

        const failed = (uploadJson.results ?? []).filter((r: { success: boolean }) => !r.success);
        if (failed.length) {
          throw new Error(failed[0]?.error ?? "Some media files failed to upload");
        }

        const freshRes = await fetch(`/api/sops/registry/${encodeURIComponent(identifier)}`);
        if (freshRes.ok) {
          mediaForm = (await freshRes.json()) as EditSOPFormData;
        }
      }

      const payload: EditSOPPayload = {
        name: form.name.trim(),
        nameGujarati: form.nameGujarati?.trim(),
        department: form.department,
        location: form.location?.trim(),
        identifier: form.identifier.trim(),
        version: form.version.trim() || "1.0",
        owner: form.owner?.trim(),
        effectiveDate: form.effectiveDate || null,
        expiryDate: form.expiryDate || null,
        reviewDate: form.reviewDate || null,
        processArea: form.processArea?.trim(),
        guidelineReference: form.guidelineReference?.trim(),
        remarks: form.remarks?.trim(),
        files: form.files,
        videos: mediaForm.videos,
        slides: mediaForm.slides,
        thumbnail: mediaForm.thumbnail,
      };

      const res = await fetch(`/api/sops/registry/${encodeURIComponent(identifier)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to save changes");
      }
      showToast(`SOP ${form.identifier} updated successfully`);
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass =
    "mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-400";
  const labelClass = "text-[10px] font-medium text-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="shrink-0 bg-violet-600 px-4 py-3 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">Edit SOP Details</h2>
              <p className="mt-0.5 text-[11px] text-violet-100">{form.identifier || identifier}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-violet-100 hover:bg-violet-500 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-violet-600" />
              Loading SOP details…
            </div>
          ) : (
            <div className="space-y-4">
              <label className={`block ${labelClass}`}>
                SOP Name
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  Department
                  <select
                    className={inputClass}
                    value={form.department}
                    onChange={(e) => updateField("department", e.target.value)}
                  >
                    {allDepts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Location
                  <input
                    className={inputClass}
                    value={form.location ?? ""}
                    onChange={(e) => updateField("location", e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  SOP Number
                  <input
                    className={inputClass}
                    value={form.identifier}
                    onChange={(e) => updateField("identifier", e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Version
                  <input
                    className={inputClass}
                    value={form.version}
                    onChange={(e) => updateField("version", e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Language
                  <input className={`${inputClass} bg-slate-50`} value={form.language} readOnly />
                </label>
                <label className={labelClass}>
                  Owner
                  <input
                    className={inputClass}
                    value={form.owner ?? ""}
                    onChange={(e) => updateField("owner", e.target.value)}
                    placeholder="e.g. John Doe"
                  />
                </label>
                <label className={labelClass}>
                  Effective Date
                  <input
                    type="date"
                    className={inputClass}
                    value={toDateInput(form.effectiveDate)}
                    onChange={(e) =>
                      updateField("effectiveDate", e.target.value ? new Date(e.target.value).toISOString() : undefined)
                    }
                  />
                </label>
                <label className={labelClass}>
                  Review / Expiry Date
                  <input
                    type="date"
                    className={inputClass}
                    value={toDateInput(form.expiryDate)}
                    onChange={(e) =>
                      updateField("expiryDate", e.target.value ? new Date(e.target.value).toISOString() : undefined)
                    }
                  />
                </label>
              </div>

              {form.language === "ENG-GUJ" && (
                <label className={`block ${labelClass}`}>
                  Gujarati SOP Name
                  <input
                    className={inputClass}
                    value={form.nameGujarati ?? ""}
                    onChange={(e) => updateField("nameGujarati", e.target.value)}
                  />
                </label>
              )}

              <label className={`block ${labelClass}`}>
                Process Area
                <input
                  className={inputClass}
                  value={form.processArea ?? ""}
                  onChange={(e) => updateField("processArea", e.target.value)}
                  placeholder="e.g. Quality Control"
                />
              </label>

              <label className={`block ${labelClass}`}>
                Guideline Reference
                <input
                  className={inputClass}
                  value={form.guidelineReference ?? ""}
                  onChange={(e) => updateField("guidelineReference", e.target.value)}
                  placeholder="e.g. ICH Q7, FDA 21 CFR Part 211"
                />
              </label>

              <label className={`block ${labelClass}`}>
                Remarks
                <textarea
                  className={`${inputClass} min-h-[72px] resize-y`}
                  value={form.remarks ?? ""}
                  onChange={(e) => updateField("remarks", e.target.value)}
                  placeholder="Add any notes or remarks about this SOP..."
                />
              </label>

              <div className="border-t border-slate-200 pt-3">
                <h3 className="mb-2 text-[11px] font-bold text-slate-700">Document Links</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>
                    English DOCX Link
                    <input
                      className={inputClass}
                      value={form.files.docx.en ?? ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          files: { ...prev.files, docx: { ...prev.files.docx, en: e.target.value } },
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                  <label className={labelClass}>
                    English PDF Link
                    <input
                      className={inputClass}
                      value={form.files.pdf.en ?? ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          files: { ...prev.files, pdf: { ...prev.files.pdf, en: e.target.value } },
                        }))
                      }
                      placeholder="https://..."
                    />
                  </label>
                  {(form.language === "GUJ" || form.language === "ENG-GUJ") && (
                    <>
                      <label className={labelClass}>
                        Gujarati DOCX Link
                        <input
                          className={inputClass}
                          value={form.files.docx.gu ?? ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              files: { ...prev.files, docx: { ...prev.files.docx, gu: e.target.value } },
                            }))
                          }
                          placeholder="https://..."
                        />
                      </label>
                      <label className={labelClass}>
                        Gujarati PDF Link
                        <input
                          className={inputClass}
                          value={form.files.pdf.gu ?? ""}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              files: { ...prev.files, pdf: { ...prev.files.pdf, gu: e.target.value } },
                            }))
                          }
                          placeholder="https://..."
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t border-slate-200 pt-3">
                <h3 className="text-[11px] font-bold text-slate-700">Training Videos &amp; Slides</h3>

                {existingVideos.length > 0 ? (
                  <ExistingMediaList title="Current videos" items={existingVideos} />
                ) : null}
                {existingSlides.length > 0 ? (
                  <ExistingMediaList title="Current slides" items={existingSlides} />
                ) : null}
                {form.thumbnail ? (
                  <ExistingMediaList title="Current thumbnail" items={[form.thumbnail]} />
                ) : null}

                <MediaFilePicker
                  label="Video files"
                  hint="MP4 / MOV / WEBM — select multiple, e.g. Brief + Explainer"
                  buttonLabel="Choose videos"
                  icon={Video}
                  files={newVideos}
                  onFilesChange={setNewVideos}
                  accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                  emptyLabel="No videos selected"
                  disabled={saving}
                />

                <MediaFilePicker
                  label="Slide files"
                  hint="PDF — select multiple"
                  buttonLabel="Choose slides"
                  icon={Presentation}
                  files={newSlides}
                  onFilesChange={setNewSlides}
                  accept=".pdf,application/pdf"
                  emptyLabel="No slides selected"
                  disabled={saving}
                />

                <MediaFilePicker
                  label="Video thumbnail image"
                  hint="Optional — shared across all videos in this batch"
                  buttonLabel="Choose image"
                  icon={ImageIcon}
                  files={newThumbnail}
                  onFilesChange={setNewThumbnail}
                  accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
                  multiple={false}
                  emptyLabel="No thumbnail"
                  disabled={saving}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <Btn variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn
            className="border-violet-600 bg-violet-600 text-white hover:bg-violet-700"
            onClick={handleSave}
            disabled={loading || saving || !form.name.trim()}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Pencil className="h-3 w-3" />
            )}
            Save Changes
          </Btn>
        </div>
      </div>
    </div>
  );
}
