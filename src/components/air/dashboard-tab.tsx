"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Clock, Cloud, RefreshCw, ShieldAlert, Sun, TrendingUp, UserRoundPlus, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AqiGauge } from "@/components/air/aqi-gauge";
import { AirQualitySnapshot, MemberDTO } from "@/components/air/types";
import {
  CATEGORY_INFO,
  POLLUTANT_META,
  SENSITIVITY_BAND_META,
  memberRiskVerdict,
} from "@/lib/aqi";

function PollutantCard({
  name,
  full,
  value,
  unit,
  subIndex,
  color,
  isDominant,
  infoOnly,
}: {
  name: string;
  full: string;
  value: number;
  unit: string;
  subIndex: number;
  color: string;
  isDominant: boolean;
  infoOnly: boolean;
}) {
  return (
    <div
      className="relative rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-md"
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
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, (subIndex / 500) * 100)}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground" title={full}>
        Sub-AQI {subIndex} · {full}
      </p>
    </div>
  );
}

interface ChartDatum {
  label: string;
  aqi: number;
  pm25: number;
  category: keyof typeof CATEGORY_INFO;
  past: number | null;
  forecast: number | null;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const cat = d.category;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold">{d.label}</p>
      <p className="mt-1">
        AQI{" "}
        <span className="font-bold" style={{ color: CATEGORY_INFO[cat].color }}>
          {d.aqi}
        </span>{" "}
        <span style={{ color: CATEGORY_INFO[cat].color }}>({CATEGORY_INFO[cat].label})</span>
      </p>
      <p className="text-muted-foreground">PM2.5 {d.pm25} µg/m³</p>
    </div>
  );
}

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

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!snapshot) return [];
    return snapshot.hourly.map((h) => ({
      label: h.time.slice(11, 16),
      aqi: h.aqi,
      pm25: h.pm25,
      category: h.category,
      past: h.future ? null : h.aqi,
      forecast: h.future ? h.aqi : null,
    }));
  }, [snapshot]);

  const nowLabel = snapshot?.hourly.find((h) => h.future)?.label;

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
      <Card className="overflow-hidden border-border/70">
        <div
          className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-stretch sm:gap-8 sm:p-8"
          style={{
            background: `linear-gradient(135deg, ${cat.color}14, transparent 55%)`,
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
            <div className="rounded-xl border bg-card/70 p-3.5">
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
              <div className="rounded-xl border bg-card/70 p-3.5">
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
                className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3.5 text-left transition-colors hover:bg-primary/10"
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
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Pollutant breakdown
          <span className="ml-1 text-xs font-normal">
            (overall AQI driven by PM2.5 / PM10 / NO₂ / SO₂)
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {snapshot.current.pollutants.map((p) => (
            <PollutantCard
              key={p.key}
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
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Clock className="h-4 w-4 text-primary" />
            PM2.5 AQI — last 24h &amp; next 24h
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="pastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cat.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={cat.color} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="futureFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cat.color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={cat.color} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  interval={5}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 500]}
                  ticks={[0, 100, 200, 300, 400, 500]}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine y={100} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine y={200} stroke="#f97316" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine y={300} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                {nowLabel && (
                  <ReferenceLine
                    x={nowLabel}
                    stroke="currentColor"
                    className="text-foreground/40"
                    strokeDasharray="2 3"
                    label={{
                      value: "now",
                      position: "insideTopLeft",
                      fontSize: 10,
                      fill: "currentColor",
                    }}
                  />
                )}
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="past"
                  stroke={cat.color}
                  strokeWidth={2}
                  fill="url(#pastFill)"
                  connectNulls={false}
                  name="Past 24h"
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  stroke={cat.color}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  fill="url(#futureFill)"
                  connectNulls={false}
                  name="Next 24h"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded bg-foreground/60" /> past
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 rounded bg-foreground/60 opacity-50" style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 9px)" }} /> forecast
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5" /> Updated{" "}
              {new Date(snapshot.updatedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
