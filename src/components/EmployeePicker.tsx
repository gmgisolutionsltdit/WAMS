import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useVisibleEmployees, VisibleEmployee } from "@/hooks/useVisibleEmployees";

interface EmployeePickerProps {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowUnassigned?: boolean;
  /** Restrict shown employees to this allow-list (e.g. project members) */
  restrictToIds?: string[];
  className?: string;
  disabled?: boolean;
}

export const EmployeePicker = ({
  value,
  onChange,
  placeholder = "Select employee",
  allowUnassigned = true,
  restrictToIds,
  className,
  disabled,
}: EmployeePickerProps) => {
  const [open, setOpen] = useState(false);
  const { groups, flat } = useVisibleEmployees();

  const allowSet = useMemo(
    () => (restrictToIds ? new Set(restrictToIds) : null),
    [restrictToIds],
  );

  const visibleGroups = useMemo(() => {
    if (!allowSet) return groups;
    return groups
      .map((g) => ({ ...g, employees: g.employees.filter((e) => allowSet.has(e.id)) }))
      .filter((g) => g.employees.length > 0);
  }, [groups, allowSet]);

  const selected: VisibleEmployee | undefined = flat.find((e) => e.id === value);

  const initials = (name?: string | null, email?: string | null) =>
    (name || email || "?").slice(0, 2).toUpperCase();

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="flex items-center gap-2 min-w-0">
              <Avatar className="h-5 w-5">
                <AvatarImage src={selected.photo_url || undefined} />
                <AvatarFallback className="text-[10px]">
                  {initials(selected.full_name, selected.email)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{selected.full_name || selected.email}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, email, dept…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No employees found.</CommandEmpty>
            {allowUnassigned && (
              <CommandGroup>
                <CommandItem
                  value="__unassigned"
                  onSelect={() => { onChange(null); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">Unassigned</span>
                </CommandItem>
              </CommandGroup>
            )}
            {visibleGroups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.employees.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={`${e.full_name || ""} ${e.email || ""} ${e.department || ""} ${e.designation || ""}`}
                    onSelect={() => { onChange(e.id); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === e.id ? "opacity-100" : "opacity-0")} />
                    <Avatar className="h-6 w-6 mr-2">
                      <AvatarImage src={e.photo_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {initials(e.full_name, e.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{e.full_name || e.email}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[e.designation, e.department, e.company_wing].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default EmployeePicker;
