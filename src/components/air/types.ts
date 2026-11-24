"use client";

import type { AirQualitySnapshot, SensitivityResult } from "@/lib/aqi";
import type { CategoryKey } from "@/lib/aqi";
import type { CommuteOption, Zone } from "@/lib/commute";

/** Family member as returned by /api/family (with computed sensitivity). */
export interface MemberDTO {
  id: string;
  name: string;
  ageGroup: string;
  conditions: string;
  createdAt: string;
  updatedAt: string;
  sensitivity: SensitivityResult;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RoutineDTO {
  id: string;
  city: string;
  aqi: number;
  aqiLabel: string;
  memberSummary: string;
  content: string;
  createdAt: string;
}

export interface IndoorPlanDTO {
  id: string;
  city: string;
  aqi: number;
  homeInfo: string;
  content: string;
  createdAt: string;
}

export type { AirQualitySnapshot };

/** Response shape of POST /api/commute. */
export interface CommuteResponse {
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

export const AGE_GROUP_LABELS: Record<string, string> = {
  child: "Child (0–12)",
  teen: "Teen (13–17)",
  adult: "Adult (18–59)",
  senior: "Senior (60+)",
};

export const CONDITION_LABELS: Record<string, string> = {
  asthma: "Asthma",
  heart: "Heart condition",
  copd: "COPD",
  pregnancy: "Pregnancy",
  diabetes: "Diabetes",
  smoker: "Smoker",
};
