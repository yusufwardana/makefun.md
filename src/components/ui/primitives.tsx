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
      'bg-[#3B82F6] text-white hover:bg-[#2563EB] border border-transparent shadow-sm disabled:opacity-50',
    secondary:
      'bg-[#14181E] text-[#F3F4F6] hover:bg-[#1C212A] border border-white/[0.1] disabled:opacity-50',
    ghost:
      'bg-transparent text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-white/[0.05] border border-transparent disabled:opacity-50',
    danger:
      'bg-[#EF4444]/15 text-[#FCA5A5] hover:bg-[#EF4444]/25 border border-[#EF4444]/30 disabled:opacity-50',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090B0E] disabled:cursor-not-allowed',
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
      'h-9 w-full rounded-md bg-[#0D1015] border border-white/[0.1] px-3 text-sm text-[#F3F4F6] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/60 focus:border-[#3B82F6] transition-colors',
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
      'w-full rounded-md bg-[#0D1015] border border-white/[0.1] p-3 text-sm text-[#F3F4F6] placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/60 focus:border-[#3B82F6] transition-colors leading-relaxed',
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
      'h-9 rounded-md bg-[#0D1015] border border-white/[0.1] px-3 text-sm text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/60 focus:border-[#3B82F6] transition-colors',
      className
    )}
    {...props}
  />
);

export const Panel: React.FC<React.ComponentPropsWithRef<'div'>> = ({ children, className, ...props }) => (
  <div
    {...props}
    className={cn(
      'rounded-lg bg-[#0F1216] border border-white/[0.08]',
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
      'flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.07]',
      className
    )}
  >
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-[#F3F4F6] tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-[#9CA3AF] mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const SyncStateIndicator: React.FC<{ state: SyncState }> = ({ state }) => {
  const config: Record<
    SyncState,
    { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    LIVE: {
      label: 'LIVE',
      colorClass: 'text-[#10B981]',
      Icon: CheckCircle2,
    },
    STALE: {
      label: 'STALE',
      colorClass: 'text-[#F59E0B]',
      Icon: AlertTriangle,
    },
    OFFLINE: {
      label: 'OFFLINE',
      colorClass: 'text-[#EF4444]',
      Icon: WifiOff,
    },
    UNVERIFIED: {
      label: 'UNVERIFIED',
      colorClass: 'text-[#9CA3AF]',
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
    <p className="text-sm font-medium text-[#F3F4F6]">{title}</p>
    <p className="text-xs text-[#9CA3AF] mt-1.5 max-w-md leading-relaxed">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);
