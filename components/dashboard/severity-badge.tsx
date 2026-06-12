import { cn } from '@/lib/utils';
import type { Severity } from '@/types/azure';

const styles: Record<Severity, string> = {
  Critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-200 dark:border-red-800',
  Error: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border border-orange-200 dark:border-orange-800',
  Warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800',
  Informational: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800',
};

const dots: Record<Severity, string> = {
  Critical: 'bg-red-500',
  Error: 'bg-orange-500',
  Warning: 'bg-yellow-500',
  Informational: 'bg-blue-500',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium', styles[severity])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[severity])} />
      {severity}
    </span>
  );
}
