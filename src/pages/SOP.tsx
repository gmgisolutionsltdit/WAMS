import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, Upload, Download, MessageSquareText } from "lucide-react";
import { format } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { notifyAllUsers } from "@/lib/notifications";

type SopDocument = {
  id: string;
  title: string;
  version_label: string;
  file_path: string;
  file_name: string;
  is_current: boolean;
  uploaded_by: string | null;
  created_at: string;
};

type SopUpdate = {
  id: string;
  title: string;
  content: string;
  created_by: string | null;
  created_at: string;
};

const SOP = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<SopDocument[]>([]);
  const [updates, setUpdates] = useState<SopUpdate[]>([]);
  const [namesByUser, setNamesByUser] = useState<Record<string, string>>({});

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: "", version_label: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ title: "", content: "" });
  const [postingRule, setPostingRule] = useState(false);

  const fetchDocuments = useCallback(async () => {
    const { data } = await supabase.from("sop_documents").select("*").order("created_at", { ascending: false });
    setDocuments((data || []) as SopDocument[]);
  }, []);

  const fetchUpdates = useCallback(async () => {
    const { data } = await supabase.from("sop_updates").select("*").order("created_at", { ascending: false });
    setUpdates((data || []) as SopUpdate[]);
  }, []);

  useEffect(() => { fetchDocuments(); fetchUpdates(); }, [fetchDocuments, fetchUpdates]);
  useRealtimeSubscription("sop_documents", fetchDocuments, "sop-documents");
  useRealtimeSubscription("sop_updates", fetchUpdates, "sop-updates");

  useEffect(() => {
    const ids = Array.from(new Set([
      ...documents.map((d) => d.uploaded_by),
      ...updates.map((u) => u.created_by),
    ].filter(Boolean))) as string[];
    if (!ids.length) return;
    supabase.from("profiles").select("id, full_name, email").in("id", ids).then(({ data }) => {
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || "Unknown"; });
      setNamesByUser(map);
    });
  }, [documents, updates]);

  const openDocument = (doc: SopDocument) => {
    const { data } = supabase.storage.from("sop-documents").getPublicUrl(doc.file_path);
    window.open(data.publicUrl, "_blank", "noopener,noreferrer");
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadForm.title.trim() || !uploadForm.version_label.trim() || !user) {
      toast.error("Title, version label and a PDF file are required");
      return;
    }
    setUploading(true);
    try {
      const path = `sop/${Date.now()}-${uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("sop-documents").upload(path, uploadFile);
      if (upErr) { toast.error(upErr.message); return; }

      await supabase.from("sop_documents").update({ is_current: false }).eq("is_current", true);
      const { error: insErr } = await supabase.from("sop_documents").insert({
        title: uploadForm.title,
        version_label: uploadForm.version_label,
        file_path: path,
        file_name: uploadFile.name,
        is_current: true,
        uploaded_by: user.id,
      });
      if (insErr) { toast.error(insErr.message); return; }

      await notifyAllUsers(
        "New SOP Published",
        `${uploadForm.title} (${uploadForm.version_label}) is now available.`,
        undefined,
        { route: "/sop", type: "sop_update" }
      );
      toast.success("New SOP version published");
      setUploadOpen(false);
      setUploadForm({ title: "", version_label: "" });
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchDocuments();
    } finally {
      setUploading(false);
    }
  };

  const handlePostRule = async () => {
    if (!ruleForm.title.trim() || !ruleForm.content.trim() || !user) {
      toast.error("Title and content are required");
      return;
    }
    setPostingRule(true);
    try {
      const { error } = await supabase.from("sop_updates").insert({
        title: ruleForm.title,
        content: ruleForm.content,
        created_by: user.id,
      });
      if (error) { toast.error(error.message); return; }
      await notifyAllUsers(
        "SOP Rule Update",
        ruleForm.title,
        undefined,
        { route: "/sop", type: "sop_update" }
      );
      toast.success("Rule update posted");
      setRuleOpen(false);
      setRuleForm({ title: "", content: "" });
      fetchUpdates();
    } finally {
      setPostingRule(false);
    }
  };

  const current = documents.filter((d) => d.is_current);
  const history = documents.filter((d) => !d.is_current);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Standard Operating Procedures</h1>
          <p className="text-sm text-muted-foreground">Official SOP documents and rule updates, for everyone.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><MessageSquareText className="h-4 w-4 mr-1" /> Post Rule Update</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Post a Rule Update</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Title</Label><Input value={ruleForm.title} onChange={(e) => setRuleForm((f) => ({ ...f, title: e.target.value }))} /></div>
                  <div><Label>Details</Label><Textarea rows={6} value={ruleForm.content} onChange={(e) => setRuleForm((f) => ({ ...f, content: e.target.value }))} /></div>
                </div>
                <DialogFooter><Button onClick={handlePostRule} disabled={postingRule}>{postingRule ? "Posting..." : "Post & Notify Everyone"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button><Upload className="h-4 w-4 mr-1" /> Upload New Version</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Upload New SOP Version</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Title</Label><Input placeholder="SOP for the supply of services" value={uploadForm.title} onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))} /></div>
                  <div><Label>Version Label</Label><Input placeholder="Version 4 - 21 September 2026" value={uploadForm.version_label} onChange={(e) => setUploadForm((f) => ({ ...f, version_label: e.target.value }))} /></div>
                  <div>
                    <Label>PDF File</Label>
                    <Input ref={fileInputRef} type="file" accept="application/pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                  </div>
                </div>
                <DialogFooter><Button onClick={handleUpload} disabled={uploading}>{uploading ? "Uploading..." : "Publish & Notify Everyone"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Current SOP</CardTitle>
          <CardDescription>The active Standard Operating Procedure document(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {current.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No SOP has been published yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {current.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => openDocument(doc)}
                  className="flex items-center justify-between gap-3 rounded-lg border p-4 text-left hover:bg-accent transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {doc.title} <Badge>{doc.version_label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Published {format(new Date(doc.created_at), "MMM d, yyyy")}
                      {doc.uploaded_by && ` by ${namesByUser[doc.uploaded_by] || "—"}`}
                    </div>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version History</CardTitle>
            <CardDescription>Previously published SOP versions, kept for reference.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((doc) => (
              <button
                key={doc.id}
                onClick={() => openDocument(doc)}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 w-full text-left hover:bg-accent transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {doc.title} <Badge variant="outline">{doc.version_label}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(doc.created_at), "MMM d, yyyy")}
                    {doc.uploaded_by && ` · ${namesByUser[doc.uploaded_by] || "—"}`}
                  </div>
                </div>
                <Download className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><MessageSquareText className="h-4 w-4" /> Rule Updates</CardTitle>
          <CardDescription>In-between changes shared as text, until the next SOP publication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No rule updates posted.</p>
          ) : updates.map((u) => (
            <div key={u.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{u.title}</div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(u.created_at), "MMM d, yyyy")}
                  {u.created_by && ` · ${namesByUser[u.created_by] || "—"}`}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap mt-2">{u.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default SOP;
