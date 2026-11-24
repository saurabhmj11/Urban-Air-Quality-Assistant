"use client";

/**
 * Application shell — city picker, live-AQI ambient background, tab
 * navigation across the six features, and data loading for the whole
 * app (air snapshot + family profile via src/lib/client.ts).
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Activity,
  BotMessageSquare,
  CalendarCheck2,
  House,
  LayoutDashboard,
  Moon,
  RefreshCw,
  Route,
  Sun,
  UsersRound,
  Wind,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardTab } from "@/components/air/dashboard-tab";
import { ChatTab } from "@/components/air/chat-tab";
import { RoutinesTab } from "@/components/air/routines-tab";
import { IndoorTab } from "@/components/air/indoor-tab";
import { FamilyTab } from "@/components/air/family-tab";
import { CommuteTab } from "@/components/air/commute-tab";
import { AirQualitySnapshot, MemberDTO } from "@/components/air/types";
import { CITIES, CATEGORY_INFO, getCity } from "@/lib/aqi";
import { getJson } from "@/lib/client";

const CITY_KEY = "breatheasy.city";

export function BreathEasyApp() {
  const [cityId, setCityId] = useState("delhi");
  const [snapshot, setSnapshot] = useState<AirQualitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [family, setFamily] = useState<MemberDTO[]>([]);
  const [tab, setTab] = useState("dashboard");
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Restore last-selected city
  useEffect(() => {
    setMounted(true);
    const saved = typeof window !== "undefined" ? localStorage.getItem(CITY_KEY) : null;
    if (saved && CITIES.some((c) => c.id === saved)) setCityId(saved);
  }, []);

  const loadFamily = useCallback(async () => {
    try {
      setFamily(await getJson<MemberDTO[]>("/api/family"));
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadAir = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const snap = await getJson<AirQualitySnapshot>(`/api/air-quality?city=${cityId}`);
      setSnapshot(snap);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cityId]);

  // Initial + on city change
  useEffect(() => {
    setLoading(true);
    loadAir();
    localStorage.setItem(CITY_KEY, cityId);
  }, [cityId, loadAir]);

  // Family + periodic refresh
  useEffect(() => {
    loadFamily();
    const t = setInterval(() => loadAir(), 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [loadAir, loadFamily]);

  const cat = snapshot ? CATEGORY_INFO[snapshot.current.category] : null;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ "--aqi-accent": cat?.color ?? "#14b8a6" } as CSSProperties}
    >
      {/* Ambient AQI-reactive backdrop (decorative, behind all content) */}
      <div className="ambient-bg" aria-hidden />

      {/* Header */}
      <header className="header-hairline sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <a href="#" className="group flex items-center gap-2" aria-label="BreathEasy home">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30 ring-1 ring-white/25 transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
              <Wind className="h-4.5 w-4.5" />
            </span>
            <span className="hidden text-lg font-bold tracking-tight sm:block">
              Breath<span className="text-gradient-brand">Easy</span>
            </span>
          </a>

          {/* Live AQI chip */}
          {cat && snapshot ? (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums transition-shadow duration-500"
              style={{
                backgroundColor: `${cat.color}1f`,
                color: cat.color,
                boxShadow: `0 0 0 1px ${cat.color}38, 0 4px 16px -4px ${cat.color}59`,
              }}
              title={`AQI ${snapshot.current.aqi} (${cat.label}) in ${snapshot.city.name}`}
            >
              <span className="live-dot h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
              {snapshot.current.aqi}
              <span className="hidden font-medium sm:inline">· {cat.label}</span>
            </span>
          ) : (
            mounted && <Skeleton className="h-7 w-16 rounded-full" />
          )}

          <div className="ml-auto flex items-center gap-2">
            <Select value={cityId} onValueChange={setCityId}>
              <SelectTrigger
                className="h-9 w-[8.5rem] sm:w-40"
                aria-label="Select city"
              >
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {CITIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => loadAir(true)}
              disabled={refreshing}
              aria-label="Refresh air quality"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle dark mode"
            >
              {mounted && resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="custom-scroll mb-4 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:justify-center">
            {(
              [
                { value: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
                { value: "coach", label: "AI Coach", Icon: BotMessageSquare },
                { value: "routines", label: "Routines", Icon: CalendarCheck2 },
                { value: "commute", label: "Commute", Icon: Route },
                { value: "indoor", label: "Indoor Hacks", Icon: House },
                { value: "family", label: "Family", Icon: UsersRound },
              ] as const
            ).map(({ value, label, Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="group gap-1.5 px-3 py-2 text-xs transition-all sm:text-sm data-[state=active]:bg-gradient-to-br data-[state=active]:from-emerald-500 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-emerald-500/30"
              >
                <Icon className="h-4 w-4" /> {label}
                {value === "family" && family.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold leading-4 text-primary group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white">
                    {family.length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard" className="data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
            <DashboardTab
              snapshot={snapshot}
              family={family}
              loading={loading}
              onRefresh={() => loadAir(true)}
              onGoToFamily={() => setTab("family")}
            />
          </TabsContent>

          <TabsContent value="coach" className="data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
            <ChatTab
              cityId={cityId}
              cityName={snapshot?.city.name ?? getCity(cityId).name}
              aqi={snapshot?.current.aqi ?? null}
              aqiLabel={cat?.label ?? null}
            />
          </TabsContent>

          <TabsContent value="routines" className="data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
            <RoutinesTab
              cityId={cityId}
              aqi={snapshot?.current.aqi ?? null}
              aqiLabel={cat?.label ?? null}
              familyCount={family.length}
            />
          </TabsContent>

          <TabsContent value="commute" className="data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
            <CommuteTab
              cityId={cityId}
              cityName={snapshot?.city.name ?? getCity(cityId).name}
              familyCount={family.length}
            />
          </TabsContent>

          <TabsContent value="indoor" className="data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
            <IndoorTab cityId={cityId} />
          </TabsContent>

          <TabsContent value="family" className="data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
            <FamilyTab
              family={family}
              category={snapshot?.current.category ?? null}
              onChanged={loadFamily}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1.5 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
          <p className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" />
            BreathEasy · GenAI hackathon build · live data from Open-Meteo, CPCB NAQI scale
          </p>
          <p>
            Guidance is informational — not a substitute for medical advice. In an emergency,
            call local services.
          </p>
        </div>
      </footer>
    </div>
  );
}
