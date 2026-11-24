"use client";

/**
 * Routines tab — generates a personalised daily smog routine (workday /
 * weekend / school day, three focus modes) with the live AQI and family
 * profile as context, and shows the last 8 saved plans as history.
 */

import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Leaf, Loader2, Shield, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { RadioCard } from "@/components/ui/radio-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AiMarkdown } from "@/components/air/markdown";
import { RoutineDTO } from "@/components/air/types";
import { CATEGORY_INFO, CategoryKey } from "@/lib/aqi";
import { getJson, postJson, userMessage } from "@/lib/client";

const DAY_TYPES = [
  { value: "workday", label: "Workday", hint: "Office + school runs" },
  { value: "weekend", label: "Weekend", hint: "Chores, outings, exercise" },
  { value: "school-day", label: "Exam / school day", hint: "Focus on the kids" },
];

const MODES = [
  {
    value: "protective",
    label: "Protect my family",
    hint: "Minimise exposure",
    icon: Shield,
  },
  {
    value: "low-emission",
    label: "Cut our emissions",
    hint: "Greenest routine",
    icon: Leaf,
  },
  {
    value: "balanced",
    label: "Balance both",
    hint: "Recommended",
    icon: Sparkles,
  },
];

export function RoutinesTab({
  cityId,
  aqi,
  aqiLabel,
  familyCount,
}: {
  cityId: string;
  aqi: number | null;
  aqiLabel: string | null;
  familyCount: number;
}) {
  const [dayType, setDayType] = useState("workday");
  const [mode, setMode] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<RoutineDTO | null>(null);
  const [history, setHistory] = useState<RoutineDTO[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load the routine history once (best-effort — latest plan is shown first).
  useEffect(() => {
    let cancelled = false;
    getJson<RoutineDTO[]>("/api/routine")
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setHistory(data);
          if (data.length > 0) setCurrent(data[0]);
        }
      })
      .catch(() => {
        /* history is best-effort */
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<RoutineDTO>("/api/routine", { city: cityId, dayType, mode });
      setCurrent(data);
      setHistory((h) => [data, ...h].slice(0, 8));
    } catch (e) {
      setError(userMessage(e, "Could not generate routine. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      {/* Settings */}
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-primary" /> Routine settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Day type
            </Label>
            <RadioGroup value={dayType} onValueChange={setDayType} className="gap-2">
              {DAY_TYPES.map((d) => (
                <RadioCard
                  key={d.value}
                  id={`day-${d.value}`}
                  value={d.value}
                  className="items-center justify-between"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="text-xs text-muted-foreground">{d.hint}</span>
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Focus
            </Label>
            <RadioGroup value={mode} onValueChange={setMode} className="gap-2">
              {MODES.map((m) => (
                <RadioCard
                  key={m.value}
                  id={`mode-${m.value}`}
                  value={m.value}
                  className="items-center gap-2.5"
                >
                  <m.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-xs text-muted-foreground">{m.hint}</span>
                  </span>
                </RadioCard>
              ))}
            </RadioGroup>
          </div>

          <Button
            onClick={generate}
            disabled={busy}
            className="w-full"
            size="lg"
            aria-label="Generate personalised routine"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Coaching…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Generate today&apos;s routine
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Uses live AQI{aqi != null ? ` (${aqi} · ${aqiLabel})` : ""} and your{" "}
            {familyCount > 0 ? `${familyCount}-member` : "saved"} family profile
          </p>
        </CardContent>
      </Card>

      {/* Routine display */}
      <div className="min-w-0 space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {busy && !current && <Skeleton className="h-96 w-full rounded-2xl" />}

        {current && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-primary" />
                Latest routine — {current.city}
                <Badge
                  variant="outline"
                  className="ml-auto"
                  style={{
                    color: CATEGORY_INFO[(current.aqiLabel ?? "").toLowerCase().replace(" ", "-") as CategoryKey]?.color,
                  }}
                >
                  AQI {current.aqi} · {current.aqiLabel}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {current.memberSummary} · generated{" "}
                {new Date(current.createdAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </CardHeader>
            <CardContent className={busy ? "animate-pulse opacity-50" : ""}>
              <AiMarkdown>{current.content}</AiMarkdown>
            </CardContent>
          </Card>
        )}

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              History ({history.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingHistory ? (
              <Skeleton className="h-20 w-full" />
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No routines yet — generate your first one!
              </p>
            ) : (
              history.map((r) => (
                <Collapsible key={r.id}>
                  <CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/50">
                    <span
                      className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                      style={{
                        backgroundColor: `${
                          CATEGORY_INFO[
                            (r.aqiLabel ?? "").toLowerCase().replace(" ", "-") as CategoryKey
                          ]?.color ?? "#888"
                        }22`,
                        color:
                          CATEGORY_INFO[
                            (r.aqiLabel ?? "").toLowerCase().replace(" ", "-") as CategoryKey
                          ]?.color ?? "#888",
                      }}
                    >
                      {r.aqi}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.city} · {r.aqiLabel} · {r.memberSummary}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-x border-b px-4 py-3">
                      <AiMarkdown>{r.content}</AiMarkdown>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
