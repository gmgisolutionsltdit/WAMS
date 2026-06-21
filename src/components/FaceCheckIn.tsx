import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

interface Props {
  onVerified: (descriptor: number[]) => void;
  enrolledDescriptor?: number[] | null;
  buttonLabel?: string;
}

const FaceCheckIn = ({ onVerified, enrolledDescriptor, buttonLabel = "Capture & Verify" }: Props) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "no-face" | "mismatch">("idle");
  const [distance, setDistance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (mounted) setModelsLoaded(true);
      } catch (e) {
        console.error("face-api model load failed", e);
      }
    })();
    return () => { mounted = false; stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
      }
    } catch (e) {
      console.error(e);
      setStatus("no-face");
    }
  };

  const stopStream = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  };

  const capture = async () => {
    if (!videoRef.current || !modelsLoaded) return;
    setLoading(true);
    setStatus("idle");
    try {
      const det = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!det) {
        setStatus("no-face");
        setLoading(false);
        return;
      }
      const descriptor = Array.from(det.descriptor);
      if (enrolledDescriptor && enrolledDescriptor.length === 128) {
        const a = new Float32Array(enrolledDescriptor);
        const b = new Float32Array(descriptor);
        const dist = faceapi.euclideanDistance(a, b);
        setDistance(dist);
        if (dist > 0.6) {
          setStatus("mismatch");
          setLoading(false);
          return;
        }
      }
      setStatus("ok");
      onVerified(descriptor);
      stopStream();
    } catch (e) {
      console.error(e);
      setStatus("no-face");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-muted border" style={{aspectRatio: "4/3"}}>
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        {!streaming && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <div className="text-center">
              <Camera className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">{modelsLoaded ? "Camera off" : "Loading face models…"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!streaming ? (
          <Button size="sm" onClick={startStream} disabled={!modelsLoaded}><Camera className="h-4 w-4 mr-1" />Start Camera</Button>
        ) : (
          <>
            <Button size="sm" onClick={capture} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
              {buttonLabel}
            </Button>
            <Button size="sm" variant="outline" onClick={stopStream}>Stop</Button>
          </>
        )}
        {status === "ok" && <Badge className="bg-success text-white"><CheckCircle2 className="h-3 w-3 mr-1" />Verified{distance !== null && ` (${distance.toFixed(2)})`}</Badge>}
        {status === "no-face" && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />No face detected</Badge>}
        {status === "mismatch" && <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Face does not match enrolled photo ({distance?.toFixed(2)})</Badge>}
      </div>
    </div>
  );
};

export default FaceCheckIn;
