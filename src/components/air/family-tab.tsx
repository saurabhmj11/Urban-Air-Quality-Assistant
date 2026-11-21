"use client";

import { useState } from "react";
import { HeartPulse, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/hooks/use-toast";
import { AGE_GROUP_LABELS, CONDITION_LABELS, MemberDTO } from "@/components/air/types";
import { SENSITIVITY_BAND_META, memberRiskVerdict } from "@/lib/aqi";
import type { CategoryKey } from "@/lib/aqi";

export function FamilyTab({
  family,
  category,
  onChanged,
}: {
  family: MemberDTO[];
  category: CategoryKey | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("adult");
  const [conditions, setConditions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleCondition(key: string, pressed: boolean) {
    setConditions((prev) =>
      pressed ? [...new Set([...prev, key])] : prev.filter((c) => c !== key)
    );
  }

  async function addMember() {
    if (!name.trim()) {
      toast({ title: "Please enter a name", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), ageGroup, conditions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setName("");
      setConditions([]);
      setAgeGroup("adult");
      onChanged();
      toast({ title: `${data.name} added to your family circle` });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Failed to add member",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(id: string, memberName: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/family/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      onChanged();
      toast({ title: `${memberName} removed` });
    } catch {
      toast({ title: "Could not remove member", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      {/* Add member */}
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" /> Add a family member
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Routines and the coach tailor advice to each person&apos;s sensitivity.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aarav, Mom, Dad…"
              maxLength={40}
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Age group
            </Label>
            <RadioGroup value={ageGroup} onValueChange={setAgeGroup} className="grid grid-cols-2 gap-2">
              {Object.entries(AGE_GROUP_LABELS).map(([value, label]) => (
                <Label
                  key={value}
                  htmlFor={`age-${value}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-normal transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10"
                >
                  <RadioGroupItem id={`age-${value}`} value={value} className="sr-only" />
                  {label}
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Health conditions (optional)
            </Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                <Toggle
                  key={key}
                  size="sm"
                  pressed={conditions.includes(key)}
                  onPressedChange={(p) => toggleCondition(key, p)}
                  className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  aria-label={label}
                >
                  {label}
                </Toggle>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Stays on this device&apos;s database only — no accounts, no cloud.
            </p>
          </div>

          <Button onClick={addMember} disabled={busy} className="w-full" size="lg">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add member
          </Button>
        </CardContent>
      </Card>

      {/* Member list */}
      <div className="space-y-3">
        {family.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <UserRound className="h-6 w-6" />
              </span>
              <p className="font-semibold">No family members yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add the people you want to protect — kids, grandparents, anyone with asthma or a
                heart condition — and every routine becomes personal.
              </p>
            </CardContent>
          </Card>
        ) : (
          family.map((m) => {
            const band = SENSITIVITY_BAND_META[m.sensitivity.band];
            return (
              <Card key={m.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex flex-wrap items-center gap-4 p-4 sm:flex-nowrap">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ backgroundColor: band.color }}
                    aria-hidden
                  >
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-semibold">{m.name}</h4>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: `${band.color}1f`, color: band.color }}
                      >
                        {band.label} · {m.sensitivity.score}/100
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {AGE_GROUP_LABELS[m.ageGroup] ?? m.ageGroup}
                      {m.conditions &&
                        ` · ${m.conditions
                          .split(",")
                          .map((c) => CONDITION_LABELS[c] ?? c)
                          .join(", ")}`}
                    </p>
                    {/* sensitivity meter */}
                    <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${m.sensitivity.score}%`, backgroundColor: band.color }}
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {category && (
                      <span className="hidden max-w-[10rem] items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                        <HeartPulse className="h-3.5 w-3.5 shrink-0" style={{ color: band.color }} />
                        {memberRiskVerdict(m.sensitivity.band, category)}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMember(m.id, m.name)}
                      disabled={deletingId === m.id}
                      aria-label={`Remove ${m.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deletingId === m.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
