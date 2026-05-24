import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/**
 * 12-hour time input with a clean AM/PM dropdown below the hour/minute
 * fields. Emits a 24-hour `HH:MM` string via `onChange` so existing
 * consumers (which already expect 24h format) keep working unchanged.
 *
 * The AM/PM dropdown lives at the bottom of the input area, per spec.
 * Changing AM/PM recalculates the 24h value immediately, which lets the
 * parent recompute totals in real time without a refresh.
 */
interface TimeWithMeridiemProps {
  label?: string;
  /** 24-hour HH:MM value (e.g. "14:30"). Empty string = unset. */
  value: string;
  onChange: (value24h: string) => void;
  required?: boolean;
  id?: string;
}

const to12h = (value24: string): { h: string; m: string; mer: "AM" | "PM" } => {
  if (!value24 || !/^\d{1,2}:\d{2}$/.test(value24)) {
    return { h: "", m: "", mer: "AM" };
  }
  const [hStr, mStr] = value24.split(":");
  const h24 = parseInt(hStr, 10);
  const mer: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h: String(h12).padStart(2, "0"), m: mStr.padStart(2, "0"), mer };
};

const to24h = (h12: string, m: string, mer: "AM" | "PM"): string => {
  const h = parseInt(h12, 10);
  const min = parseInt(m, 10);
  if (isNaN(h) || isNaN(min)) return "";
  if (h < 1 || h > 12 || min < 0 || min > 59) return "";
  let h24 = h % 12;
  if (mer === "PM") h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

export const TimeWithMeridiem = ({
  label,
  value,
  onChange,
  required,
  id,
}: TimeWithMeridiemProps) => {
  const initial = useMemo(() => to12h(value), [value]);
  const [h, setH] = useState(initial.h);
  const [m, setM] = useState(initial.m);
  const [mer, setMer] = useState<"AM" | "PM">(initial.mer);

  // Keep local state synced if parent updates value externally.
  useEffect(() => {
    const next = to12h(value);
    setH(next.h);
    setM(next.m);
    setMer(next.mer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const push = (nh: string, nm: string, nmer: "AM" | "PM") => {
    const v24 = to24h(nh || "12", nm || "00", nmer);
    onChange(v24);
  };

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="space-y-2 rounded-md border bg-card p-3">
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            placeholder="HH"
            className="w-20 text-center"
            value={h}
            required={required}
            onChange={(e) => {
              const v = e.target.value;
              setH(v);
              push(v, m, mer);
            }}
          />
          <span className="text-lg font-semibold text-muted-foreground">:</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            placeholder="MM"
            className="w-20 text-center"
            value={m}
            required={required}
            onChange={(e) => {
              const v = e.target.value;
              setM(v);
              push(h, v, mer);
            }}
          />
          <span className="ml-auto text-xs text-muted-foreground">12-hour</span>
        </div>
        <Select
          value={mer}
          onValueChange={(v) => {
            const next = v as "AM" | "PM";
            setMer(next);
            push(h, m, next);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default TimeWithMeridiem;
