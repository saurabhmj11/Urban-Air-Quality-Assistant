"use client";

/**
 * Commute planner tab — pick origin/destination areas, then every travel
 * mode is ranked by the deterministic engine (src/lib/commute.ts) on
 * inhaled PM2.5 dose, CO2 and trip time; the GenAI layer narrates the
 * trade-offs but never computes the numbers.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bike,
  Bus,
  CarFront,
  CarTaxiFront,
  Footprints,
  Leaf,
  Loader2,
  MapPin,
  MoveRight,
  Route as RouteIcon,
  Shield,
  Sparkles,
  Timer,
  TrainFront,
  UsersRound,
  Wind,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AiMarkdown } from "@/components/air/markdown";
import {
  getZones,
  fmtDuration,
  type CommuteOption,
  type CommutePreference,
  type Zone,
} from "@/lib/commute";
import { CATEGORY_INFO, type CategoryKey } from "@/lib/aqi";
import { postJson, userMessage } from "@/lib/client";

interface CommuteResponse {
  origin: Zone;
  destination: Zone;
  straightKm: number;
  pm25: number;
  pm25IsForecast: boolean;
  bestWindow: { time: string; pm25: number } | null;
  aqi: number;
  aqiCategory: CategoryKey;
  sensitiveMembers: string[];
  options: CommuteOption[];
  narration: string | null;
}

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

const PREFERENCES: {
  value: CommutePreference;
  label: string;
  hint: string;
  icon: typeof Shield;
}[] = [
  { value: "protect", label: "Protect us", hint: "Least smoke inhaled", icon: Shield },
  { value: "low-emission", label: "Cut emissions", hint: "Greenest trip", icon: Leaf },
  { value: "balanced", label: "Balance both", hint: "Recommended", icon: Wind },
];

function OptionCard({
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
            style={{ color: option.score >= 66 ? "#16a34a" : option.score >= 33 ? "#f97316" : "#ef4444" }}
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

export function CommuteTab({
  cityId,
  cityName,
  familyCount,
}: {
  cityId: string;
  cityName: string;
  familyCount: number;
}) {
  const zones = useMemo(() => getZones(cityId), [cityId]);
  const [originId, setOriginId] = useState(zones[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(zones[1]?.id ?? "");
  const [departure, setDeparture] = useState<"now" | "best">("best");
  const [preference, setPreference] = useState<CommutePreference>("balanced");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommuteResponse | null>(null);

  // Reset the trip when the city changes (zone ids are city-specific).
  useEffect(() => {
    setOriginId(zones[0]?.id ?? "");
    setDestinationId(zones[1]?.id ?? "");
    setResult(null);
    setError(null);
  }, [zones]);

  const cat = result ? CATEGORY_INFO[result.aqiCategory] : null;
  const sameZone = originId === destinationId;

  async function plan() {
    if (sameZone) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<CommuteResponse>("/api/commute", {
        city: cityId,
        origin: originId,
        destination: destinationId,
        departure,
        preference,
      });
      setResult(data);
    } catch (e) {
      setError(userMessage(e, "Could not plan this trip. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      {/* Trip settings */}
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RouteIcon className="h-4 w-4 text-primary" /> Plan a low-smoke trip
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Compare every way to get across {cityName} — ranked by what your
            family breathes and emits.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="commute-origin"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              From
            </Label>
            <Select value={originId} onValueChange={setOriginId}>
              <SelectTrigger id="commute-origin" className="w-full" aria-label="Origin area">
                <SelectValue placeholder="Origin" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="commute-destination"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              To
            </Label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger
                id="commute-destination"
                className="w-full"
                aria-label="Destination area"
              >
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sameZone && (
              <p className="text-xs text-destructive">Pick two different areas.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Departure
            </Label>
            <RadioGroup
              value={departure}
              onValueChange={(v) => setDeparture(v as "now" | "best")}
              className="grid grid-cols-2 gap-2"
            >
              {[
                { value: "now", label: "Leave now" },
                { value: "best", label: "Best window" },
              ].map((d) => (
                <Label
                  key={d.value}
                  htmlFor={`dep-${d.value}`}
                  className="flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
                >
                  {d.label}
                  <RadioGroupItem id={`dep-${d.value}`} value={d.value} className="sr-only" />
                </Label>
              ))}
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">
              &ldquo;Best window&rdquo; times the trip for the lowest forecast PM2.5 in
              the next 8 hours.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What matters most
            </Label>
            <RadioGroup
              value={preference}
              onValueChange={(v) => setPreference(v as CommutePreference)}
              className="gap-2"
            >
              {PREFERENCES.map((p) => (
                <Label
                  key={p.value}
                  htmlFor={`pref-${p.value}`}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
                >
                  <p.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.hint}</span>
                  </span>
                  <RadioGroupItem id={`pref-${p.value}`} value={p.value} />
                </Label>
              ))}
            </RadioGroup>
          </div>

          <Button
            onClick={plan}
            disabled={busy || sameZone || !originId || !destinationId}
            className="w-full"
            size="lg"
            aria-label="Compare travel options for this trip"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Comparing routes…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Compare travel options
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {familyCount > 0
              ? `Checks your ${familyCount}-member family profile for sensitive travellers`
              : "Add family members to personalise warnings"}
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="min-w-0 space-y-4" aria-live="polite" aria-busy={busy}>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {busy && !result && <Skeleton className="h-96 w-full rounded-2xl" />}

        {!busy && !result && !error && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted" aria-hidden="true">
                <MapPin className="h-7 w-7 text-primary" />
              </span>
              <div>
                <h3 className="font-semibold">No trip planned yet</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  Choose two areas and we&apos;ll rank every travel mode by the smoke
                  your family would inhale and the CO2 it emits — then the AI coach
                  explains the trade-offs.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            {/* Trip header */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate">{result.origin.name}</span>
                  <MoveRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{result.destination.name}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2.5 py-1 font-semibold tabular-nums">
                    {result.straightKm} km
                  </span>
                  {cat && (
                    <span
                      className="rounded-full px-2.5 py-1 font-bold tabular-nums"
                      style={{ backgroundColor: `${cat.color}1f`, color: cat.color }}
                    >
                      AQI {result.aqi} · {cat.label}
                    </span>
                  )}
                  <span
                    className="rounded-full bg-muted px-2.5 py-1 font-semibold tabular-nums"
                    title={
                      result.pm25IsForecast
                        ? `Forecast PM2.5 at the best departure (${result.bestWindow?.time.slice(11, 16)})`
                        : "Current PM2.5"
                    }
                  >
                    Travelling at {Math.round(result.pm25)} µg/m³ PM2.5
                    {result.pm25IsForecast ? " (best window)" : ""}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* AI narration */}
            {result.narration && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" /> Coach&apos;s take
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AiMarkdown>{result.narration}</AiMarkdown>
                </CardContent>
              </Card>
            )}

            {/* Options */}
            <div className="grid gap-3 sm:grid-cols-2">
              {result.options.map((o, i) => (
                <OptionCard key={o.mode} option={o} rank={i} />
              ))}
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Exposure = ambient PM2.5 × mode ventilation &amp; cabin factor × trip
              duration (adult breathing rates). CO2 uses typical Indian per-passenger-km
              factors. Estimates for comparison, not medical dosimetry.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
