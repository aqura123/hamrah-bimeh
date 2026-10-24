import React from 'react';
import { Link } from 'react-router-dom';

interface BrandLogoProps {
  showTagline?: boolean;
  to?: string;
  compact?: boolean;
}

export function LogoMark({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="نشان سپر و تأیید همراه بیمه"
      className={className}
    >
      <path
        d="M24 4L8 10.5V22.5C8 33.1 14.8 42.6 24 45.5C33.2 42.6 40 33.1 40 22.5V10.5L24 4Z"
        style={{ fill: 'var(--color-brand-navy)' }}
      />
      <path
        d="M24 8.2L11.8 13.1V22.5C11.8 31.1 17.1 38.9 24 41.5C30.9 38.9 36.2 31.1 36.2 22.5V13.1L24 8.2Z"
        style={{ stroke: 'var(--color-brand-blue)', strokeWidth: 1.5 }}
      />
      <path
        d="M17.5 24.5L22 29L31 19.5"
        style={{
          stroke: 'var(--color-brand-turquoise)',
          strokeWidth: 3.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
    </svg>
  );
}

export function BrandLogo({ showTagline = true, to = '/', compact = false }: BrandLogoProps) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-3 group rounded-control focus-visible:outline-2"
    >
      <LogoMark className={compact ? 'w-9 h-9 shrink-0' : 'w-11 h-11 shrink-0'} />
      <div className="flex flex-col text-right">
        <span
          className={`font-bold tracking-tight text-brand-navy ${compact ? 'text-base' : 'text-lg sm:text-xl'}`}
        >
          همراه بیمه
        </span>
        {showTagline && (
          <span className="text-xs text-brand-muted leading-tight">
            خدمات بیمه‌ای، ساده‌تر و مطمئن‌تر
          </span>
        )}
      </div>
    </Link>
  );
}
