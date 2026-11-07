import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  interactive = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-3xl border border-white/90 bg-white/85 backdrop-blur-xl p-7 sm:p-8 shadow-card transition-all ${
        interactive ? 'hover:shadow-elevation hover:-translate-y-0.5 cursor-pointer' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
};

