import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple';
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'gray',
  dot = false,
  className = '',
}) => {
  const variantStyles = {
    green: 'bg-near-light text-near-dark border-near-green/30 font-bold',
    amber: 'bg-amber-50 text-amber-900 border-amber-300 font-bold',
    red: 'bg-rose-50 text-rose-900 border-rose-300 font-bold',
    blue: 'bg-blue-50 text-blue-900 border-blue-200 font-bold',
    purple: 'bg-purple-50 text-purple-900 border-purple-200 font-bold',
    gray: 'bg-ivory-warm text-charcoal-700 border-border font-medium',
  }[variant];

  const dotStyles = {
    green: 'bg-near-green',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
    blue: 'bg-blue-600',
    purple: 'bg-purple-600',
    gray: 'bg-charcoal-400',
  }[variant];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotStyles}`} />}
      {children}
    </span>
  );
};

