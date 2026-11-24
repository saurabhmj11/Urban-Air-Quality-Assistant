"use client";

/**
 * Commute planner tab — pick origin/destination areas, then every travel
 * mode is ranked by the deterministic engine (src/lib/commute.ts) on
 * inhaled PM2.5 dose, CO2 and trip time; the GenAI layer narrates the
 * trade-offs but never computes the numbers.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Leaf,
  Loader2,
  MapPin,
  MoveRight,
  Route as RouteIcon,
  Shield,
  Sparkles,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { RadioCard } from "@/components/ui/radio-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AiMarkdown } from "@/components/air/markdown";
import { CommuteOptionCard } from "@/components/air/commute-option-card";
import { CommuteResponse } from "@/components/air/types";
import {
  getZones,
  type CommutePreference,
} from "@/lib/commute";
import { CATEGORY_INFO } from "@/lib/aqi";
import { postJson, userMessage } from "@/lib/client";

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
                <RadioCard
                  key={d.value}
                  id={`dep-${d.value}`}
                  value={d.value}
                  hideIndicator
                  className="items-center justify-center py-2 text-center text-sm"
                >
                  {d.label}
                </RadioCard>
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
                <RadioCard
                  key={p.value}
                  id={`pref-${p.value}`}
                  value={p.value}
                  className="items-center gap-2.5"
                >
                  <p.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.hint}</span>
                  </span>
                </RadioCard>
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
                <CommuteOptionCard key={o.mode} option={o} rank={i} />
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
