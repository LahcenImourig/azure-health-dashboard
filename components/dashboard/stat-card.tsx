'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  status?: 'good' | 'warning' | 'critical' | 'neutral';
  className?: string;
}

const statusStyles = {
  good: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950',
  warning: 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950',
  critical: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
  neutral: 'border-border bg-card',
};

const iconStyles = {
  good: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  critical: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
};

const valueStyles = {
  good: 'text-green-700 dark:text-green-300',
  warning: 'text-yellow-700 dark:text-yellow-300',
  critical: 'text-red-700 dark:text-red-300',
  neutral: 'text-foreground',
};

export function StatCard({ title, value, subtitle, icon: Icon, status = 'neutral', className }: StatCardProps) {
  return (
    <div className={cn(
      'rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md',
      statusStyles[status],
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn('text-3xl font-bold tabular-nums', valueStyles[status])}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn('rounded-lg p-2.5 bg-white/60 dark:bg-black/20', iconStyles[status])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
