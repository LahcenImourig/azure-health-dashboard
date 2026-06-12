'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { AzureSubscription } from '@/types/azure';

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function SubscriptionFilter({ value, onChange }: Props) {
  const { data: subscriptions, isLoading } = useQuery<AzureSubscription[]>({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const res = await fetch('/api/azure/subscriptions');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    initialData: [],
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />;
  }

  if (!subscriptions || subscriptions.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground">Subscription:</span>
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => onChange('all')}
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
            value === 'all'
              ? 'bg-azure-500 text-white border-azure-500'
              : 'bg-card border-border text-muted-foreground hover:text-foreground'
          )}
        >
          All ({subscriptions.length})
        </button>
        {subscriptions.map(sub => (
          <button
            key={sub.id}
            onClick={() => onChange(sub.id)}
            title={sub.displayName}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors max-w-[180px] truncate',
              value === sub.id
                ? 'bg-azure-500 text-white border-azure-500'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {sub.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
