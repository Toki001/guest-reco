/** Animated empty state illustrations */

function FloatingDots() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="opacity-30">
      <circle cx="60" cy="60" r="3" fill="var(--accent)" opacity="0.6">
        <animate attributeName="cy" values="60;50;60" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="70" r="2" fill="var(--accent)" opacity="0.4">
        <animate attributeName="cy" values="70;62;70" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="80" cy="65" r="2.5" fill="var(--accent)" opacity="0.5">
        <animate attributeName="cy" values="65;55;65" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="50" r="1.5" fill="var(--accent)" opacity="0.3">
        <animate attributeName="cy" values="50;44;50" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="75" cy="80" r="2" fill="var(--accent)" opacity="0.35">
        <animate attributeName="cy" values="80;72;80" dur="2.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="relative mb-2">
        <FloatingDots />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-[var(--accent)] opacity-50">{icon}</span>
        </div>
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      {description && <p className="text-xs text-[var(--text-muted)] max-w-[240px]">{description}</p>}
    </div>
  );
}
