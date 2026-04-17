/** Glassmorphism-themed skeleton shimmer components */

export function SkeletonPulse({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-xl ${className}`}
      style={{
        background: 'linear-gradient(90deg, var(--glass-bg) 25%, var(--glass-bg-strong) 50%, var(--glass-bg) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonPulse className="h-3 w-20" />
        <SkeletonPulse className="h-9 w-9 rounded-xl" />
      </div>
      <SkeletonPulse className="h-8 w-24" />
      <SkeletonPulse className="h-3 w-16" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <SkeletonPulse className="w-9 h-9 rounded-xl shrink-0" />
      <div className="flex-1 space-y-1.5">
        <SkeletonPulse className="h-3.5 w-28" />
        <SkeletonPulse className="h-2.5 w-40" />
      </div>
      <SkeletonPulse className="h-5 w-10 rounded-lg" />
      <SkeletonPulse className="h-3 w-12" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--glass-border)]">
        <SkeletonPulse className="h-4 w-32" />
      </div>
      <div className="divide-y divide-[var(--glass-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <SkeletonPulse className="h-4 w-36" />
        <SkeletonPulse className="h-6 w-20 rounded-lg" />
      </div>
      <div className="flex items-end gap-1.5 h-32">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonPulse
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${20 + Math.random() * 80}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
