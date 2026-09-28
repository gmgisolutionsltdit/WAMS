import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Paperclip, X } from "lucide-react";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
}

/** Multi-image picker with thumbnail previews, used on request submission forms. */
export const AttachmentsInput = ({ files, onChange }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <Label>Attach Images <span className="text-xs text-muted-foreground">(optional, multiple allowed)</span></Label>
      <div className="flex items-center gap-2 mt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Paperclip className="h-4 w-4 mr-1" /> Choose Images
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            if (picked.length) onChange([...files, ...picked]);
            e.target.value = "";
          }}
        />
        {files.length > 0 && <span className="text-xs text-muted-foreground">{files.length} selected</span>}
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img src={URL.createObjectURL(f)} alt={f.name} className="h-14 w-14 object-cover rounded border" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttachmentsInput;
