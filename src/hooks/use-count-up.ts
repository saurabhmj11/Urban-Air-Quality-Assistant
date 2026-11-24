"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Pure progress math for the count-up animation (exported for tests).
 *
 * Returns the value that should be shown `elapsedMs` into a `duration`-ms
 * ease-out-cubic interpolation from `from` to `target`. A duration of 0
 * (or any non-positive value, which is what reduced-motion mode uses)
 * snaps straight to the target.
 */
export function countUpValue(
  from: number,
  target: number,
  elapsedMs: number,
  duration: number
): number {
  if (duration <= 0 || elapsedMs >= duration) return target;
  const p = Math.max(0, elapsedMs) / duration; // progress in [0, 1)
  const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
  return Math.round(from + (target - from) * eased);
}

/**
 * Smoothly animates a number from its previous value to `target`
 * (ease-out cubic). Re-animates relative to the last shown value when the
 * target changes (e.g. a data refresh), and snaps instantly when the user
 * prefers reduced motion. All state updates happen inside the rAF callback.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return; // already showing the target

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 0 : duration;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const v = countUpValue(from, target, now - start, dur);
      fromRef.current = v;
      setValue(v);
      if (v !== target) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setValue(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
