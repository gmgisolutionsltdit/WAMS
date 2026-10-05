import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  label: string;
  hours: string;
  minutes: string;
  onHoursChange: (v: string) => void;
  onMinutesChange: (v: string) => void;
}

/** A labeled pair of Hour / Minute number inputs, used anywhere a duration is entered as hh:mm instead of a single decimal. */
export const HourMinuteInput = ({ label, hours, minutes, onHoursChange, onMinutesChange }: Props) => (
  <div>
    <Label>{label}</Label>
    <div className="grid grid-cols-2 gap-2 mt-1">
      <div>
        <Label className="text-xs text-muted-foreground">Hour</Label>
        <Input type="number" step="1" min="0" value={hours} onChange={(e) => onHoursChange(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Minute</Label>
        <Input type="number" step="1" min="0" max="59" value={minutes} onChange={(e) => onMinutesChange(e.target.value)} />
      </div>
    </div>
  </div>
);

export default HourMinuteInput;
