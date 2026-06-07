"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface TimePickerProps {
  value?: string; // "HH:MM"
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

const CONTAINER_HEIGHT = 220;
const ITEM_HEIGHT = 44;
// Number of items visible above/below center
const PADDING_ITEMS = Math.floor(CONTAINER_HEIGHT / ITEM_HEIGHT / 2);

function WheelColumn({
  items,
  selected,
  onSelect,
}: {
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Scroll to selected item on mount
  React.useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0 && containerRef.current) {
      containerRef.current.scrollTop = idx * ITEM_HEIGHT;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect which item is in the center after scroll stops
  const handleScroll = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const idx = Math.round(containerRef.current.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      // Snap to exact position
      containerRef.current.scrollTo({
        top: clamped * ITEM_HEIGHT,
        behavior: "smooth",
      });
      if (items[clamped] !== selected) {
        onSelect(items[clamped]);
      }
    }, 80);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-[220px] w-full overflow-x-hidden overflow-y-auto scrollbar-hide touch-pan-y"
      style={{
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorX: "none",
      }}
    >
      {/* top spacer — push first item to center */}
      <div style={{ height: ITEM_HEIGHT * PADDING_ITEMS }} />
      {items.map((item) => (
        <div
          key={item}
          className={cn(
            "flex items-center justify-center w-full text-lg transition-all select-none",
            item === selected
              ? "text-foreground font-bold scale-110"
              : "text-muted-foreground/50",
          )}
          style={{ height: ITEM_HEIGHT }}
        >
          {item}
        </div>
      ))}
      {/* bottom spacer — push last item to center */}
      <div style={{ height: ITEM_HEIGHT * PADDING_ITEMS }} />
    </div>
  );
}

export function TimePicker({
  value,
  onChange,
  placeholder = "เลือกเวลา",
  className,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [hour, setHour] = React.useState("00");
  const [minute, setMinute] = React.useState("00");

  // Sync internal state when dialog opens
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && value) {
      const parts = value.split(":");
      if (parts.length === 2) {
        setHour(parts[0]);
        setMinute(parts[1]);
      }
    }
    setOpen(isOpen);
  };

  const handleConfirm = () => {
    onChange?.(`${hour}:${minute}`);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpen(true)}
        className={cn(
          "flex h-12 w-full items-center rounded-md border border-input bg-background pl-9 pr-3 py-2 text-base md:text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 relative",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <ClockIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 shrink-0 text-muted-foreground" />
        {value || placeholder}
      </button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-[300px] rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-center">เลือกเวลา</DialogTitle>
            <DialogDescription className="sr-only">
              เลือกชั่วโมงและนาที
            </DialogDescription>
          </DialogHeader>

          <div className="relative flex items-center justify-center gap-0">
            {/* Selection highlight bar */}
            <div className="pointer-events-none absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[44px] rounded-lg bg-muted/60" />

            <div className="flex-1 relative">
              <WheelColumn
                items={HOURS}
                selected={hour}
                onSelect={setHour}
              />
            </div>

            <span className="text-2xl font-bold text-foreground z-10">:</span>

            <div className="flex-1 relative">
              <WheelColumn
                items={MINUTES}
                selected={minute}
                onSelect={setMinute}
              />
            </div>
          </div>

          <Button onClick={handleConfirm} className="w-full h-12 text-base">
            ยืนยัน
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
