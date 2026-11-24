"use client";

/**
 * Shared selectable card for RadioGroup options.
 *
 * Six call sites across the tabs used to hand-roll the same markup: a Label
 * styled as a bordered card whose `has-[[data-state=checked]]` variant
 * highlights when its RadioGroupItem is selected. Variants cover the three
 * layouts in use: horizontal with visible indicator, icon + two-line text,
 * and compact column (indicator visually hidden — keyboard users still
 * reach it via the label).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";

export function RadioCard({
  id,
  value,
  className,
  hideIndicator = false,
  children,
}: {
  /** Matches the RadioGroupItem id; the label wraps focus onto it. */
  id: string;
  value: string;
  className?: string;
  /** Visually hide the radio dot (compact / column layouts). */
  hideIndicator?: boolean;
  children: ReactNode;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer rounded-lg border px-3 py-2.5 font-normal transition-colors",
        "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10",
        className
      )}
    >
      {children}
      <RadioGroupItem id={id} value={value} className={hideIndicator ? "sr-only" : undefined} />
    </Label>
  );
}
