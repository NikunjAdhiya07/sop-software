import { redirect } from 'next/navigation';

/** SOP settings now live at /lms/admin — keep old URL working. */
export default function SopSettingsRedirect() {
  redirect('/lms/admin');
}
