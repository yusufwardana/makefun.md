import React from 'react';
import { CheckCircle2, AlertTriangle, WifiOff, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SyncState } from '../../types/command-center';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}) => {
  const variants = {
    primary:
      'bg-accent text-accent-ink hover:bg-accent-hover border border-transparent disabled:opacity-50',
    secondary:
      'bg-surface text-ink hover:bg-hover border border-control disabled:opacity-50',
    ghost:
      'bg-transparent text-muted hover:text-ink hover:bg-hover border border-transparent disabled:opacity-50',
    danger:
      'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30 disabled:opacity-50',
  };

  const sizes = {
    sm: 'min-h-11 sm:min-h-9 px-3 text-xs gap-1.5',
    md: 'min-h-11 px-4 text-sm gap-2',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition duration-180 active:translate-y-px whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    className={cn(
      'min-h-11 w-full rounded-lg bg-field border border-control px-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors',
      className
    )}
    {...props}
  />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...props
}) => (
  <textarea
    className={cn(
      'w-full rounded-lg bg-field border border-control p-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors leading-relaxed',
      className
    )}
    {...props}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...props
}) => (
  <select
    className={cn(
      'min-h-11 rounded-lg bg-field border border-control px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent transition-colors',
      className
    )}
    {...props}
  />
);

export const Panel: React.FC<React.ComponentPropsWithRef<'div'>> = ({ children, className, ...props }) => (
  <div
    {...props}
    className={cn(
      'rounded-xl bg-surface border border-line',
      className
    )}
  >
    {children}
  </div>
);

export const PanelHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, actions, className }) => (
  <div
    className={cn(
      'flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-line',
      className
    )}
  >
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-ink tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const SyncStateIndicator: React.FC<{ state: SyncState }> = ({ state }) => {
  const config: Record<
    SyncState,
    { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    LIVE: {
      label: 'LIVE',
      colorClass: 'text-success',
      Icon: CheckCircle2,
    },
    STALE: {
      label: 'STALE',
      colorClass: 'text-warning',
      Icon: AlertTriangle,
    },
    OFFLINE: {
      label: 'OFFLINE',
      colorClass: 'text-danger',
      Icon: WifiOff,
    },
    UNVERIFIED: {
      label: 'UNVERIFIED',
      colorClass: 'text-muted',
      Icon: HelpCircle,
    },
  };

  const { label, colorClass, Icon } = config[state] || config.UNVERIFIED;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs font-medium whitespace-nowrap', colorClass)}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
    <p className="text-sm font-medium text-ink">{title}</p>
    <p className="text-xs text-muted mt-1.5 max-w-md leading-relaxed">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
