"use client";

import * as React from "react";
import { ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface TimePickerProps {
  value?: string; // "HH:MM"
  onChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export function TimePicker({ value, onChange, placeholder = "เลือกเวลา", className }: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const [selectedHour, selectedMinute] = React.useMemo(() => {
    if (!value) return [undefined, undefined];
    const [h, m] = value.split(":").map(Number);
    return [h, m];
  }, [value]);

  const handleHour = (h: number) => {
    const m = selectedMinute ?? 0;
    onChange?.(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  const handleMinute = (m: number) => {
    const h = selectedHour ?? 0;
    onChange?.(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-12",
            !value && "text-muted-foreground",
            className
          )}
        >
          <ClockIcon className="mr-2 h-4 w-4 shrink-0" />
          {value || <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex divide-x">
          <ScrollArea className="h-52 w-16">
            <div className="flex flex-col p-2 gap-1">
              {HOURS.map((h) => (
                <Button
                  key={h}
                  size="icon"
                  variant={selectedHour === h ? "default" : "ghost"}
                  className="w-full shrink-0 h-8 text-sm"
                  onClick={() => handleHour(h)}
                >
                  {String(h).padStart(2, "0")}
                </Button>
              ))}
            </div>
          </ScrollArea>
          <ScrollArea className="h-52 w-16">
            <div className="flex flex-col p-2 gap-1">
              {MINUTES.map((m) => (
                <Button
                  key={m}
                  size="icon"
                  variant={selectedMinute === m ? "default" : "ghost"}
                  className="w-full shrink-0 h-8 text-sm"
                  onClick={() => handleMinute(m)}
                >
                  {String(m).padStart(2, "0")}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
