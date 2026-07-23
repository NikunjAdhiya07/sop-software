"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Settings2,
  Users,
} from "lucide-react";
import {
  ExamSettingsForm,
  ExamSettingsSaveButton,
  useExamSettings,
} from "@/components/lms/ExamSettingsPanel";

export default function LmsGlobalSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { settings, set, patch, loading, saving, saved, error, save } =
    useExamSettings();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/lms/admin"
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> SOP Exam Settings
            </Link>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-purple-600" />
              <h1 className="text-sm font-bold tracking-tight">Global Defaults</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/lms/admin"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Settings2 className="h-3.5 w-3.5" /> SOP Settings
            </Link>
            <Link
              href="/employees"
              className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-100"
            >
              <Users className="h-3.5 w-3.5" /> Employees Page
            </Link>
            <ExamSettingsSaveButton
              saving={saving}
              saved={saved}
              onSave={save}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
        <ExamSettingsForm settings={settings} set={set} patch={patch} error={error} />
      </main>
    </div>
  );
}
