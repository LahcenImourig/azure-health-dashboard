import { Suspense } from 'react';
import SignInContent from './signin-content';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <SignInContent />
      </Suspense>
    </div>
  );
}
