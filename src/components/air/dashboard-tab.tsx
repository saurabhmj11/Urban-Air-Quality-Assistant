"use client";

/**
 * Dashboard tab — the city's live air story: AQI gauge hero with best
 * outdoor windows and per-member risk verdicts, the pollutant breakdown
 * cards, and the past-24h / next-24h PM2.5 AQI chart with a "now" marker.
 */

import { Cloud, RefreshCw, Sun, TrendingUp, UserRoundPlus, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AqiGauge } from "@/components/air/aqi-gauge";
import { PollutantCard } from "@/components/air/pollutant-card";
import { TrendChart } from "@/components/air/trend-chart";
import { AirQualitySnapshot, MemberDTO } from "@/components/air/types";
import {
  CATEGORY_INFO,
  POLLUTANT_META,
  SENSITIVITY_BAND_META,
  memberRiskVerdict,
} from "@/lib/aqi";

export function DashboardTab({
  snapshot,
  family,
  loading,
  onRefresh,
  onGoToFamily,
}: {
  snapshot: AirQualitySnapshot | null;
  family: MemberDTO[];
  loading: boolean;
  onRefresh: () => void;
  onGoToFamily: () => void;
}) {
  const cat = snapshot ? CATEGORY_INFO[snapshot.current.category] : CATEGORY_INFO.moderate;

  if (loading && !snapshot) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <Cloud className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Could not load air quality data</p>
          <Button onClick={onRefresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Hero */}
      <Card className="animate-rise overflow-hidden border-border/70 shadow-sm">
        <div
          className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-stretch sm:gap-8 sm:p-8"
          style={{
            background: `linear-gradient(135deg, ${cat.color}1a, transparent 60%), radial-gradient(85% 130% at 100% 0%, ${cat.color}17, transparent 55%)`,
          }}
        >
          <div className="flex shrink-0 flex-col items-center justify-center">
            <AqiGauge aqi={snapshot.current.aqi} category={snapshot.current.category} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold sm:text-xl">
                  {snapshot.city.name}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    · {snapshot.city.state}
                  </span>
                </h2>
                <Badge
                  variant="outline"
                  className="gap-1.5 border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
                >
                  <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                  Live · {snapshot.source === "open-meteo" ? "Open-Meteo" : "Simulated"}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                Dominant pollutant:{" "}
                <strong>{POLLUTANT_META[snapshot.current.dominant].name}</strong> — {cat.advice}
              </p>
            </div>

            {/* Best windows */}
            <div
              className="animate-rise rounded-xl border bg-card/70 p-3.5 backdrop-blur-sm"
              style={{ animationDelay: "120ms" }}
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sun className="h-3.5 w-3.5" /> Best outdoor windows (next 24h)
              </p>
              {snapshot.bestWindows.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {snapshot.bestWindows.map((w, i) => (
                    <span
                      key={i}
                      className="aqi-chip rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums"
                      style={{
                        backgroundColor: `${CATEGORY_INFO[
                          w.avgAqi <= 100 ? "satisfactory" : w.avgAqi <= 200 ? "moderate" : "poor"
                        ].color}1f`,
                        color: CATEGORY_INFO[
                          w.avgAqi <= 100 ? "satisfactory" : w.avgAqi <= 200 ? "moderate" : "poor"
                        ].color,
                      }}
                    >
                      {w.label} · ~{w.avgAqi}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Air stays poor all day — keep outdoor time minimal and mask up (N95).
                </p>
              )}
            </div>

            {/* Family risk strip */}
            {family.length > 0 ? (
              <div
                className="animate-rise rounded-xl border bg-card/70 p-3.5 backdrop-blur-sm"
                style={{ animationDelay: "200ms" }}
              >
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Your family today
                </p>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {family.map((m) => {
                    const band = SENSITIVITY_BAND_META[m.sensitivity.band];
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: band.color }}
                            aria-hidden
                          />
                          <span className="truncate font-medium">{m.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {memberRiskVerdict(m.sensitivity.band, snapshot.current.category)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <button
                onClick={onGoToFamily}
                className="animate-rise group flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/10"
                style={{ animationDelay: "200ms" }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition-transform group-hover:scale-110">
                  <UserRoundPlus className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">
                    Make it personal — add your family
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Kids, seniors and asthma sufferers get tailored risk verdicts and routines
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Pollutants */}
      <section aria-label="Pollutant breakdown">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Pollutant breakdown
        </h3>
        <p className="mb-4 text-xs text-muted-foreground/80">
          Overall AQI is driven by PM2.5 / PM10 / NO₂ / SO₂
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {snapshot.current.pollutants.map((p, i) => (
            <PollutantCard
              key={p.key}
              index={i}
              name={p.name}
              full={POLLUTANT_META[p.key].full}
              value={p.value}
              unit={p.unit}
              subIndex={p.subIndex}
              color={CATEGORY_INFO[p.category].color}
              isDominant={p.key === snapshot.current.dominant}
              infoOnly={!p.inOverall}
            />
          ))}
        </div>
      </section>

      {/* Trend chart */}
      <TrendChart hourly={snapshot.hourly} updatedAt={snapshot.updatedAt} color={cat.color} />
    </div>
  );
}
