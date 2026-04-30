import { Button } from "@/components/ui/button";
import { Sparkles, Plus } from "lucide-react";

interface Props {
  onCreate: () => void;
}

export function KanbanEmptyState({ onCreate }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Decorative illustration with floating cards */}
      <div className="relative w-48 h-32 mb-6">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="absolute left-2 top-4 w-24 h-16 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/10 border border-border/60 backdrop-blur-sm rotate-[-8deg] shadow-lg" />
          <div className="absolute right-2 top-2 w-24 h-16 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-border/60 backdrop-blur-sm rotate-[6deg] shadow-lg" />
          <div className="relative w-28 h-20 rounded-xl bg-card border border-border shadow-xl flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-1">Your board is ready</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-5">
        Tasks will appear here as cards you can drag across columns. Capture work, set priorities, and ship faster.
      </p>
      <Button onClick={onCreate} className="gap-2">
        <Plus className="h-4 w-4" /> Create your first task
      </Button>
    </div>
  );
}
