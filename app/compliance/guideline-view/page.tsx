'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const GuidelinePdfModal = dynamic(() => import('@/components/compliance/GuidelinePdfModal'), { ssr: false });

function GuidelineViewInner() {
  const searchParams = useSearchParams();
  const guidelineId = searchParams.get('guidelineId') ?? '';
  const search = searchParams.get('search') ?? '';
  const title = searchParams.get('title') ?? undefined;

  if (!guidelineId) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-600">
        Missing guideline ID
      </div>
    );
  }

  return (
    <GuidelinePdfModal
      isOpen
      fullPage
      onClose={() => window.close()}
      guidelineId={guidelineId}
      searchPhrase={search}
      title={title}
    />
  );
}

export default function GuidelineViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-sm text-gray-600">Loading guideline…</div>
      }
    >
      <GuidelineViewInner />
    </Suspense>
  );
}
