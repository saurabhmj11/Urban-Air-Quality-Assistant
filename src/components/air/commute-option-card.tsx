"use client";

/**
 * Ranked travel-mode card for the commute tab: mode icon, Best-pick ring,
 * the three-metric strip (inhaled PM2.5 dose, CO2, door-to-door time) and
 * badges/warning. Purely presentational — every number is computed by the
 * deterministic engine (src/lib/commute.ts) and displayed as-is.
 */

import {
  AlertTriangle,
  Bike,
  Bus,
  CarFront,
  CarTaxiFront,
  Footprints,
  Leaf,
  Route as RouteIcon,
  Timer,
  TrainFront,
  UsersRound,
  Wind,
  Zap,
} from "lucide-react";
import { fmtDuration, type CommuteOption } from "@/lib/commute";

const MODE_ICONS: Record<string, typeof Footprints> = {
  walk: Footprints,
  cycle: Bike,
  metro: TrainFront,
  bus: Bus,
  auto: CarTaxiFront,
  scooter: Zap,
  car: CarFront,
  carpool: UsersRound,
};

/** Trip-score colour: green ≥66, amber ≥33, red below. */
function scoreColor(score: number): string {
  if (score >= 66) return "#16a34a";
  if (score >= 33) return "#f97316";
  return "#ef4444";
}

export function CommuteOptionCard({
  option,
  rank,
}: {
  option: CommuteOption;
  rank: number;
}) {
  const Icon = MODE_ICONS[option.mode] ?? RouteIcon;
  const isTop = rank === 0;
  return (
    <article
      className={`rounded-xl border bg-card p-4 transition-shadow hover:shadow-md ${
        isTop ? "ring-2 ring-primary/60" : ""
      }`}
      aria-label={`${option.label}: ${fmtDuration(option.minutes)}, ${option.distanceKm} kilometres, ${option.co2Grams} grams CO2, trip score ${option.score} out of 100`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isTop ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          }`}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-2 text-sm font-bold">
            {option.label}
            {isTop && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                Best pick
              </span>
            )}
          </h4>
          <p className="text-xs text-muted-foreground">
            {fmtDuration(option.minutes)} door-to-door · {option.distanceKm} km route
          </p>
        </div>
        {/* Score dial */}
        <div
          className="flex flex-col items-center"
          title={`Trip score ${option.score}/100 for your preference`}
        >
          <span
            className="text-lg font-black tabular-nums"
            style={{ color: scoreColor(option.score) }}
          >
            {option.score}
          </span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            score
          </span>
        </div>
      </div>

      {/* Metric strip */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/60 px-1.5 py-2">
          <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Wind className="h-3 w-3" aria-hidden="true" /> Inhaled
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {Math.round(option.doseMicrograms)}
            <span className="text-[10px] font-medium text-muted-foreground"> µg</span>
          </p>
          <p className="text-[9px] text-muted-foreground">PM2.5 on this trip</p>
        </div>
        <div className="rounded-lg bg-muted/60 px-1.5 py-2">
          <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Leaf className="h-3 w-3" aria-hidden="true" /> CO2
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {option.co2Grams}
            <span className="text-[10px] font-medium text-muted-foreground"> g</span>
          </p>
          <p className="text-[9px] text-muted-foreground">
            {option.co2Grams === 0 ? "zero-emission" : "per person"}
          </p>
        </div>
        <div className="rounded-lg bg-muted/60 px-1.5 py-2">
          <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Timer className="h-3 w-3" aria-hidden="true" /> Time
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">{fmtDuration(option.minutes)}</p>
          <p className="text-[9px] text-muted-foreground">door-to-door</p>
        </div>
      </div>

      {/* Badges */}
      {option.badges.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {option.badges.map((b) => (
            <span
              key={b}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                b === "Lowest emission"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : b === "Cleanest air"
                    ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              }`}
            >
              {b}
            </span>
          ))}
        </div>
      )}

      {option.warning && (
        <p
          role="note"
          className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {option.warning}
        </p>
      )}
    </article>
  );
}
