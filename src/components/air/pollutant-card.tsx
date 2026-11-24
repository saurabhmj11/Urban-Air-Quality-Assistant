"use client";

/**
 * Single pollutant tile for the dashboard breakdown grid: value with
 * category colour, info-only marker, sub-AQI progress bar (bar-grow,
 * staggered by grid index) and the dominant-pollutant ribbon.
 */

export function PollutantCard({
  name,
  full,
  value,
  unit,
  subIndex,
  color,
  isDominant,
  infoOnly,
  index = 0,
}: {
  name: string;
  full: string;
  value: number;
  unit: string;
  subIndex: number;
  color: string;
  isDominant: boolean;
  infoOnly: boolean;
  index?: number;
}) {
  const delay = `${index * 70}ms`;
  return (
    <div
      className="animate-rise relative rounded-xl border bg-card p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40"
      style={{ animationDelay: delay }}
      aria-label={`${name} ${value} ${unit}`}
    >
      {isDominant && (
        <span className="absolute -top-2 right-3 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
          Dominant
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">{name}</span>
        {infoOnly && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            info
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="bar-grow h-full rounded-full"
          style={{
            width: `${Math.min(100, (subIndex / 500) * 100)}%`,
            backgroundColor: color,
            animationDelay: delay,
          }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground" title={full}>
        Sub-AQI {subIndex} · {full}
      </p>
    </div>
  );
}
