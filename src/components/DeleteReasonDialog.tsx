import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Wraps a delete trigger button so the actual delete only happens once the
 * admin both types a reason (shared with the employee) and types the word
 * "delete" as an explicit confirmation — matching the required-note
 * pattern already used for rejections, plus a stronger "are you sure"
 * gate since this now moves the row to Trash rather than just discarding
 * it with a plain window.confirm.
 */
export function DeleteReasonDialog({
  trigger,
  title,
  description,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmed = confirmText.trim().toLowerCase() === "delete";

  const confirm = async () => {
    if (!reason.trim() || !confirmed || busy) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setOpen(false);
      setReason("");
      setConfirmText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { setOpen(v); if (!v) { setReason(""); setConfirmText(""); } } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <div className="space-y-1">
          <Label className="text-xs">Reason for deleting <span className="text-destructive">*</span></Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — this is shared with the employee"
            rows={3}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">
            Type <span className="font-mono font-semibold">delete</span> to confirm <span className="text-destructive">*</span>
          </Label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="delete" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={confirm} disabled={!reason.trim() || !confirmed || busy}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteReasonDialog;
