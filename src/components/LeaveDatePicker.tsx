import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (iso: string) => void;
  /** Earliest selectable date (yyyy-MM-dd), e.g. the 48h retro lock. */
  min?: string;
  /** Dates to mark as a company holiday. Marked only — still selectable. */
  holidays?: Set<string>;
  /** Weekday numbers treated as the weekend (0 = Sunday). Marked, not blocked. */
  weekendDays?: number[];
  placeholder?: string;
}

/**
 * Date picker for leave start/end dates.
 *
 * Weekends and holidays are *highlighted* so the employee can see what a range
 * covers, but every day stays selectable: leave routinely spans a weekend or a
 * holiday, and whether such a day is actually charged is decided later by the
 * leave type's bridging and sandwich rules, not by blocking the date here.
 * The only dates genuinely disabled are those outside the retro-entry window.
 */
export const LeaveDatePicker = ({
  value,
  onChange,
  min,
  holidays,
  weekendDays = [],
  placeholder = "Pick a date",
}: Props) => {
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const minDate = min ? new Date(`${min}T00:00:00`) : undefined;

  const isHoliday = (d: Date) => !!holidays?.has(format(d, "yyyy-MM-dd"));
  const isWeekend = (d: Date) => weekendDays.includes(d.getDay());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected ? format(selected, "EEE, MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          disabled={minDate ? { before: minDate } : undefined}
          modifiers={{ holiday: isHoliday, weekend: isWeekend }}
          modifiersClassNames={{
            holiday: "bg-warning/20 text-warning font-semibold rounded-md",
            weekend: "text-muted-foreground",
          }}
        />
        <div className="flex gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded bg-warning/40" /> Holiday
          </span>
          <span>Weekends and holidays can still be selected.</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LeaveDatePicker;
