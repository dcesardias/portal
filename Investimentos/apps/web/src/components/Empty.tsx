import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Empty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-body text-center py-16">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="text-base font-medium text-ink">{title}</h3>
        {description && <p className="text-sm text-ink-soft mt-1 max-w-md mx-auto">{description}</p>}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
