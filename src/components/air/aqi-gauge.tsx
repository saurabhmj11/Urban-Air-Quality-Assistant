"use client";

import { useCountUp } from "@/hooks/use-count-up";
import { CATEGORY_INFO, CategoryKey } from "@/lib/aqi";

/**
 * Semicircular AQI gauge (0–500, CPCB National AQI scale).
 * Dimmed category segments + tick marks + a full-opacity value arc and
 * needle. The needle, arc and number sweep in together via a rAF count-up.
 */
export function AqiGauge({
  aqi,
  category,
  size = 260,
}: {
  aqi: number;
  category: CategoryKey;
  size?: number;
}) {
  const W = 200;
  const H = 118;
  const cx = 100;
  const cy = 100;
  const r = 78;

  const display = useCountUp(aqi, 1100);

  const angleOf = (v: number) => 180 - (Math.min(500, Math.max(0, v)) / 500) * 180;

  const polar = (angleDeg: number, radius: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)] as const;
  };

  const arc = (a0: number, a1: number, radius: number) => {
    const [x0, y0] = polar(a0, radius);
    const [x1, y1] = polar(a1, radius);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const sweep = a0 > a1 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  const boundaries: { key: CategoryKey; from: number; to: number }[] = [
    { key: "good", from: 0, to: 50 },
    { key: "satisfactory", from: 50, to: 100 },
    { key: "moderate", from: 100, to: 200 },
    { key: "poor", from: 200, to: 300 },
    { key: "very-poor", from: 300, to: 400 },
    { key: "severe", from: 400, to: 500 },
  ];

  const catColor = CATEGORY_INFO[category].color;
  const needleAngle = angleOf(display);
  const info = CATEGORY_INFO[category];

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={size}
        height={(size * H) / W}
        role="img"
        aria-label={`Air quality index ${aqi}, ${info.label}`}
      >
        {/* Category segments (dimmed, brighter in dark mode) */}
        {boundaries.map((b) => (
          <path
            key={b.key}
            d={arc(angleOf(b.from) - 1.2, angleOf(b.to) + 1.2, r)}
            stroke={CATEGORY_INFO[b.key].color}
            strokeWidth={11}
            strokeLinecap="round"
            fill="none"
            className={b.key === category ? "opacity-55 dark:opacity-65" : "opacity-20 dark:opacity-32"}
          />
        ))}
        {/* Boundary tick marks */}
        {boundaries.map((b) => {
          const a = angleOf(b.from);
          const [x0, y0] = polar(a, r + 6.5);
          const [x1, y1] = polar(a, r + 11);
          return (
            <line
              key={`tick-${b.key}`}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="text-foreground/25"
            />
          );
        })}
        {/* Value arc (sweeps with the count-up) */}
        {display > 0 && (
          <path
            d={arc(180, needleAngle, r)}
            stroke={catColor}
            strokeWidth={11}
            strokeLinecap="round"
            fill="none"
            style={{ filter: `drop-shadow(0 0 4px ${catColor}55)` }}
          />
        )}
        {/* Needle (driven by the same count-up) */}
        <g
          style={{
            transform: `rotate(${90 - needleAngle}deg)`,
            transformOrigin: `${cx}px ${cy}px`,
          }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - r + 22}
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            className="text-foreground/70"
          />
        </g>
        {/* Hub with soft glow */}
        <circle cx={cx} cy={cy} r={9} fill={catColor} opacity={0.18} />
        <circle cx={cx} cy={cy} r={4.5} fill="currentColor" className="text-foreground/70" />
        {/* Scale labels */}
        <text x={polar(180, r + 12)[0]} y={polar(180, r + 12)[1] + 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
          0
        </text>
        <text x={polar(0, r + 12)[0]} y={polar(0, r + 12)[1] + 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
          500
        </text>
      </svg>
      <div className="-mt-5 flex flex-col items-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">
          AQI
        </span>
        <span className="text-5xl font-bold tabular-nums leading-none" style={{ color: catColor }}>
          {display}
        </span>
        <span
          className="mt-2 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: `${catColor}22`, color: catColor }}
        >
          {info.label}
        </span>
      </div>
    </div>
  );
}
