'use client';

import { signOut, useSession } from 'next-auth/react';
import { Moon, Sun, LogOut, RefreshCw, Send } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Navbar({ onRefresh, onSendReport }: { onRefresh: () => void; onSendReport: () => void }) {
  const { data: session } = useSession();
  const [dark, setDark] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  async function handleSendReport() {
    setSending(true);
    try {
      const res = await fetch('/api/report/generate', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      alert('Report sent to Teams successfully!');
    } catch {
      alert('Failed to send report. Check console.');
    } finally {
      setSending(false);
    }
    onSendReport();
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
      <div className="mx-auto max-w-screen-2xl flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-azure-500">
            <span className="text-white font-bold text-sm">Az</span>
          </div>
          <div>
            <span className="font-semibold text-foreground">Azure Health</span>
            <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">Tenant Dashboard</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh all data"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={handleSendReport}
            disabled={sending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-azure-500 hover:bg-azure-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Sending…' : 'Send Report'}
          </button>

          <button
            onClick={() => setDark(d => !d)}
            className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {session?.user && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-medium text-foreground leading-tight">{session.user.name}</p>
                <p className="text-xs text-muted-foreground leading-tight">{session.user.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
