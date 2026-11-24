"use client";

/**
 * Past-24h / next-24h PM2.5 AQI trend chart for the dashboard: two areas
 * (solid past, dashed forecast) split by a "now" ReferenceLine, threshold
 * guides at the CPCB band boundaries, and a custom tooltip.
 *
 * `buildChartData` is the pure mapping from HourlyPoint[] to chart rows —
 * exported for unit tests.
 */

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
import { Clock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_INFO, type CategoryKey, type HourlyPoint } from "@/lib/aqi";

export interface ChartDatum {
  label: string;
  aqi: number;
  pm25: number;
  category: CategoryKey;
  past: number | null;
  forecast: number | null;
}

/**
 * Map hourly points to chart rows. Chart x-values use the full ISO hour so
 * every category is UNIQUE — recharts categorical ReferenceLine lookups
 * (the "now" marker) and cursor/tooltip matching break when HH:mm labels
 * repeat across the past-24h / next-24h window. Ticks display HH:mm via
 * tickFormatter.
 */
export function buildChartData(hourly: HourlyPoint[]): ChartDatum[] {
  return hourly.map((h) => ({
    label: h.time,
    aqi: h.aqi,
    pm25: h.pm25,
    category: h.category,
    past: h.future ? null : h.aqi,
    forecast: h.future ? h.aqi : null,
  }));
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
      <p className="font-semibold">{d.label.slice(11, 16)}</p>
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

export function TrendChart({
  hourly,
  updatedAt,
  color,
}: {
  hourly: HourlyPoint[];
  updatedAt: string;
  /** Current-category colour for the series. */
  color: string;
}) {
  const chartData = buildChartData(hourly);
  // First forecast hour = "now" boundary on the unique-label x axis.
  const nowLabel = hourly.find((h) => h.future)?.time;

  return (
    <Card className="animate-rise" style={{ animationDelay: "260ms" }}>
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
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="futureFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="label"
                tickFormatter={(v: string) => v.slice(11, 16)}
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
                stroke={color}
                strokeWidth={2}
                fill="url(#pastFill)"
                connectNulls={false}
                name="Past 24h"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="forecast"
                stroke={color}
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
            {new Date(updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
