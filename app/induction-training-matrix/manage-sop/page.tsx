import { redirect } from 'next/navigation';

export default function InductionManageSopRedirect() {
  redirect('/training-matrix/manage-sop?returnTo=induction');
}
