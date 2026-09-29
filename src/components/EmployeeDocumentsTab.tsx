import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type DocRow = {
  id: string;
  category: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
};

type Category = {
  key: string;
  label: string;
  accept: string;
  maxMB: number;
  multiple: boolean;
};

const CATEGORIES: Category[] = [
  { key: "sop", label: "Upload SOP", accept: ".doc,.docx,.pdf,image/*", maxMB: 5, multiple: true },
  { key: "certificate", label: "Upload Certificates", accept: ".doc,.docx,.pdf,image/*", maxMB: 5, multiple: true },
  { key: "cv", label: "Upload CV", accept: ".doc,.docx,.pdf", maxMB: 5, multiple: false },
  { key: "nid", label: "Upload NID", accept: "image/*,.pdf", maxMB: 2, multiple: false },
  { key: "photo", label: "Upload Photo", accept: "image/*", maxMB: 2, multiple: false },
  { key: "nominee", label: "Upload Nominee Files", accept: ".doc,.docx,.pdf,image/*,.zip,.rar", maxMB: 100, multiple: true },
  { key: "bank", label: "Upload Bank Documents", accept: ".doc,.docx,.pdf,image/*,.zip,.rar", maxMB: 100, multiple: true },
];

const BUCKET = "employee-documents";

const humanSize = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface Props {
  userId: string;
  canManage: boolean;
}

export const EmployeeDocumentsTab = ({ userId, canManage }: Props) => {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("employee_documents")
      .select("id, category, file_path, file_name, file_size, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setDocs((data || []) as DocRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (cat: Category, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const maxBytes = cat.maxMB * 1024 * 1024;
    const oversized = picked.find((f) => f.size > maxBytes);
    if (oversized) {
      toast.error(`${oversized.name} exceeds the ${cat.maxMB}MB limit for ${cat.label}`);
      return;
    }
    setUploadingKey(cat.key);
    try {
      for (const file of picked) {
        const path = `${userId}/${cat.key}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
        if (upErr) { toast.error(upErr.message); continue; }
        const { error: insErr } = await supabase.from("employee_documents").insert({
          user_id: userId,
          category: cat.key,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
        });
        if (insErr) toast.error(insErr.message);
      }
      toast.success(`${cat.label.replace(/^Upload /, "")} uploaded`);
      fetchDocs();
    } finally {
      setUploadingKey(null);
      const input = inputRefs.current[cat.key];
      if (input) input.value = "";
    }
  };

  const handleDownload = async (doc: DocRow) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60);
    if (error || !data) { toast.error(error?.message || "Could not open this file"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (doc: DocRow) => {
    if (!window.confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return;
    await supabase.storage.from(BUCKET).remove([doc.file_path]);
    const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Document deleted");
    fetchDocs();
  };

  const docsFor = (key: string) => docs.filter((d) => d.category === key);

  return (
    <div className="space-y-4">
      {CATEGORIES.map((cat) => {
        const rows = docsFor(cat.key);
        return (
          <Card key={cat.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">{cat.label}</CardTitle>
                  <CardDescription>
                    {cat.multiple ? "Multiple files allowed" : "Single file"} · max {cat.maxMB}MB each
                  </CardDescription>
                </div>
                {canManage && (
                  <>
                    <input
                      ref={(el) => { inputRefs.current[cat.key] = el; }}
                      type="file"
                      accept={cat.accept}
                      multiple={cat.multiple}
                      className="hidden"
                      onChange={(e) => handleUpload(cat, e.target.files)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploadingKey === cat.key}
                      onClick={() => inputRefs.current[cat.key]?.click()}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {uploadingKey === cat.key ? "Uploading…" : "Upload"}
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No files uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {rows.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{doc.file_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {humanSize(doc.file_size)} · {format(new Date(doc.created_at), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" title="Download" onClick={() => handleDownload(doc)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <Button size="icon" variant="ghost" title="Delete" onClick={() => handleDelete(doc)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default EmployeeDocumentsTab;
