"use client";

/**
 * Indoor plan tab — describes the home (rooms, purifier, AC, cooking fuel,
 * budget) and generates a room-by-room indoor air protection plan, plus a
 * curated library of instant offline DIY hacks.
 */

import { useState } from "react";
import {
  CookingPot,
  DoorClosed,
  Droplets,
  Fan,
  Loader2,
  Monitor,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { RadioCard } from "@/components/ui/radio-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AiMarkdown } from "@/components/air/markdown";
import { postJson, userMessage } from "@/lib/client";
import { IndoorPlanDTO } from "@/components/air/types";

// ---------------------------------------------------------------------------
// Curated hack library — instant, offline value
// ---------------------------------------------------------------------------

interface Hack {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cost: "Free" | "₹" | "₹₹";
}

const HACKS: Hack[] = [
  {
    icon: Wind,
    title: "Ventilate only at the dip",
    body: "Winter smog peaks overnight and at dawn. Open windows for cross-ventilation in the afternoon dip (roughly 12–4 PM), then seal up before sunset.",
    cost: "Free",
  },
  {
    icon: Fan,
    title: "DIY clean-air-zone (CAZ) box",
    body: "Tape four MERV-13 filters to a 20-inch box fan in a cube. A ₹2,000 build clears a bedroom's PM2.5 as well as entry-level purifiers.",
    cost: "₹",
  },
  {
    icon: CookingPot,
    title: "Kitchen exhaust discipline",
    body: "Always run the exhaust while cooking, keep the kitchen door shut, and wait 10 minutes after cooking before opening up. Frying adds 100+ µg/m³ indoors.",
    cost: "Free",
  },
  {
    icon: Droplets,
    title: "Wet-mop, never dry-sweep",
    body: "Settled PM re-enters the air when you dry-sweep or dust. Damp-mop floors and wipe surfaces with a wet cloth on smog days.",
    cost: "Free",
  },
  {
    icon: DoorClosed,
    title: "Seal the leaks",
    body: "Weather-strip or stuff cloth strips under doors and around window frames. One well-sealed bedroom protects better than a leaky whole flat.",
    cost: "₹",
  },
  {
    icon: Monitor,
    title: "Watch indoor PM too",
    body: "A budget laser PM2.5 monitor (~₹2.5k) shows exactly when cooking or outdoor seepage spikes your indoor air, so you can act in minutes.",
    cost: "₹₹",
  },
];

const BUDGETS = [
  { value: "zero", label: "₹0", hint: "Behaviour only" },
  { value: "low", label: "Under ₹2k", hint: "DIY gear" },
  { value: "mid", label: "Under ₹15k", hint: "Budget HEPA" },
  { value: "high", label: "Under ₹50k", hint: "Full setup" },
];

const COOKING = [
  { value: "gas", label: "LPG / piped gas" },
  { value: "electric", label: "Electric coil" },
  { value: "induction", label: "Induction" },
  { value: "wood-or-biomass", label: "Wood / chulha" },
];

export function IndoorTab({ cityId }: { cityId: string }) {
  const [rooms, setRooms] = useState(2);
  const [hasPurifier, setHasPurifier] = useState(false);
  const [hasAC, setHasAC] = useState(false);
  const [budget, setBudget] = useState("low");
  const [cooking, setCooking] = useState("gas");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<IndoorPlanDTO | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<IndoorPlanDTO>("/api/indoor-plan", {
        city: cityId,
        rooms,
        hasPurifier,
        hasAC,
        budget,
        cooking,
        notes,
      });
      setPlan(data);
    } catch (e) {
      setError(userMessage(e, "Could not generate plan. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Curated hacks */}
      <section aria-label="Indoor air hacks">
        <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Proven indoor hacks — start these today
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HACKS.map((h) => (
            <div
              key={h.title}
              className="group rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary transition-transform group-hover:scale-110">
                  <h.icon className="h-4.5 w-4.5" />
                </span>
                <Badge
                  variant="outline"
                  className={
                    h.cost === "Free"
                      ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
                      : "border-border text-muted-foreground"
                  }
                >
                  {h.cost}
                </Badge>
              </div>
              <h4 className="mt-2.5 text-sm font-semibold">{h.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AI plan generator */}
      <Card id="indoor-plan">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Your custom indoor action plan
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Tell the coach about your home — it builds a room-by-room plan around today&apos;s AQI
            forecast and your budget.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2.5">
              <Label className="flex justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rooms <span className="font-bold tabular-nums text-foreground">{rooms}</span>
              </Label>
              <Slider
                value={[rooms]}
                min={1}
                max={8}
                step={1}
                onValueChange={(v) => setRooms(v[0])}
                aria-label="Number of rooms"
              />
            </div>
            <div className="space-y-2.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cooking fuel
              </Label>
              <Select value={cooking} onValueChange={setCooking}>
                <SelectTrigger aria-label="Cooking fuel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COOKING.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Switch checked={hasPurifier} onCheckedChange={setHasPurifier} aria-label="Owns an air purifier" />
              Already own a purifier
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Switch checked={hasAC} onCheckedChange={setHasAC} aria-label="Has air conditioning" />
              Have AC
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Budget
            </Label>
            <RadioGroup value={budget} onValueChange={setBudget} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BUDGETS.map((b) => (
                <RadioCard
                  key={b.value}
                  id={`budget-${b.value}`}
                  value={b.value}
                  hideIndicator
                  className="flex-col"
                >
                  <span className="text-sm font-medium">{b.label}</span>
                  <span className="text-xs text-muted-foreground">{b.hint}</span>
                </RadioCard>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="indoor-notes" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <NotebookPen className="h-3.5 w-3.5" /> Anything special? (optional)
            </Label>
            <Input
              id="indoor-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={300}
              placeholder="e.g. baby's room faces a main road; husband has asthma"
            />
          </div>

          <Button onClick={generate} disabled={busy} size="lg" aria-label="Generate indoor plan">
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Designing your plan…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Generate my indoor plan
              </>
            )}
          </Button>

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Indoor plan — {plan.city} · AQI {plan.aqi}
              <Badge variant="outline" className="ml-auto font-normal text-muted-foreground">
                {plan.homeInfo}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AiMarkdown>{plan.content}</AiMarkdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
