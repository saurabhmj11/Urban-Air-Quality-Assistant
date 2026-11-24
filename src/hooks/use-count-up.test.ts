/**
 * Tests for the count-up animation math (src/hooks/use-count-up.ts).
 * The pure `countUpValue` function carries the whole contract: endpoints,
 * ease-out-cubic shaping, rounding and the reduced-motion snap.
 */
import { describe, expect, it } from "bun:test";
import { countUpValue } from "@/hooks/use-count-up";

describe("countUpValue", () => {
  it("starts at the origin value", () => {
    expect(countUpValue(50, 200, 0, 900)).toBe(50);
  });

  it("reaches the target exactly at full duration", () => {
    expect(countUpValue(50, 200, 900, 900)).toBe(200);
    expect(countUpValue(50, 200, 5000, 900)).toBe(200);
  });

  it("shapes progress with ease-out cubic (fast first, slow last)", () => {
    // Halfway in time covers 87.5% of the distance: 50 + 0.875*150 = 181.25 → 181.
    expect(countUpValue(50, 200, 450, 900)).toBe(181);
    // First quarter covers 57.8% of the distance: 50 + 0.578125*150 = 136.7 → 137.
    expect(countUpValue(50, 200, 225, 900)).toBe(137);
  });

  it("snaps straight to the target for zero duration (reduced motion)", () => {
    expect(countUpValue(0, 342, 0, 0)).toBe(342);
  });

  it("snaps for any non-positive duration", () => {
    expect(countUpValue(10, 90, 0, -5)).toBe(90);
  });

  it("never overshoots even with negative elapsed time", () => {
    expect(countUpValue(50, 200, -100, 900)).toBe(50);
  });

  it("animates downward as cleanly as upward", () => {
    expect(countUpValue(200, 50, 450, 900)).toBe(69); // 200 - 0.875*150 = 68.75 → 69
    expect(countUpValue(200, 50, 900, 900)).toBe(50);
  });

  it("handles a target equal to the origin without moving", () => {
    expect(countUpValue(120, 120, 450, 900)).toBe(120);
  });
});
