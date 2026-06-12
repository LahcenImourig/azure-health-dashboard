'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

const FROM_HREF: Record<string, string> = {
  'ai-insights': '/dashboard/ai-insights',
};

function BackLinkInner() {
  const params = useSearchParams();
  const from = params.get('from');
  const href = (from && FROM_HREF[from]) || '/dashboard';
  return (
    <Link href={href} className="text-muted-foreground hover:text-foreground" aria-label="Retour">
      <ArrowLeft className="h-5 w-5" />
    </Link>
  );
}

// Wrapped in Suspense: useSearchParams requires it for static rendering.
export function BackLink() {
  return (
    <Suspense fallback={<ArrowLeft className="h-5 w-5 text-muted-foreground" />}>
      <BackLinkInner />
    </Suspense>
  );
}
