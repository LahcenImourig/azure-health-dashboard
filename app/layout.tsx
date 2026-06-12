'use client';

import './globals.css';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
  }));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Azure Health Dashboard</title>
        <meta name="description" content="Azure tenant health monitoring dashboard" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <SessionProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
