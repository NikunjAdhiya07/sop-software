import { redirect } from 'next/navigation';

/** Global defaults moved to /lms/admin/global. */
export default function ExamSettingsPage() {
  redirect('/lms/admin/global');
}
