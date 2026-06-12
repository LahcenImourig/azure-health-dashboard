'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

export default function SignInPage() {
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm space-y-8 p-8 rounded-2xl border bg-white dark:bg-gray-900 shadow-lg">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-azure-500">
            <span className="text-white font-bold text-xl">Az</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Azure Health Dashboard</h1>
          <p className="text-sm text-muted-foreground">Sign in with your Microsoft account to continue</p>
        </div>

        {/* Sign in button */}
        <button
          onClick={() => signIn('azure-ad', { callbackUrl })}
          className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#0078d4] hover:bg-[#106ebe] text-white font-medium py-3 px-4 transition-colors"
        >
          <svg viewBox="0 0 23 23" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="10" height="10" fill="#f25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
            <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
            <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Access is restricted to your organization&apos;s Azure AD tenant.
        </p>
      </div>
    </div>
  );
}
