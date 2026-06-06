"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value?: string; // "HH:MM"
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
}

// Native time input — allows typing any HH:MM (every minute, not 5-min steps)
// and opens the OS time picker on mobile.
export function TimePicker({ value, onChange, className }: TimePickerProps) {
  return (
    <div className="relative w-full">
      <ClockIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "flex h-12 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
    </div>
  );
}
