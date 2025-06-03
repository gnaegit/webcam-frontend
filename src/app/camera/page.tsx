"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CameraStream() {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isStoringImages, setIsStoringImages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setIntervalValue] = useState(5);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ReadyState>(ReadyState.CLOSED);
  const [cameraType, setCameraType] = useState<string | null>(null);
  const [cameraIndex, setCameraIndex] = useState<number | null>(null);
  const [cameraStatus, setCameraStatus] = useState<{ picamera: boolean; cameraids: boolean }>({
    picamera: false,
    cameraids: false,
  });
  const [cameras, setCameras] = useState<
    Array<{ type: string; index: number; display_name: string; model: string; serial: string; label: string }>
  >([]);
  const [warning, setWarning] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const pathname = usePathname();
  const imagesPath = `${pathname}/images`;

  const { lastMessage, readyState } = useWebSocket("/py/ws", {
    shouldReconnect: () => true,
    onOpen: () => {
      setConnectionStatus(ReadyState.OPEN);
    },
    onClose: () => {
      setConnectionStatus(ReadyState.CLOSED);
      setIsPreviewing(false);
    },
    onError: () => setConnectionStatus(ReadyState.CLOSED),
    onMessage: (message) => handleWebSocketMessage(message),
  });

  const handleWebSocketMessage = (message: MessageEvent) => {
    if (message.data instanceof Blob) {
      const url = URL.createObjectURL(message.data);
      if (imgRef.current) {
        imgRef.current.src = url;
        setIsPreviewing(true);
      }
    } else {
      try {
        const status = JSON.parse(message.data);
        setIsStoringImages(status.storage_status === "running");
        setIntervalValue(status.save_interval || 5);
        setIsPreviewing(status.preview_status === "running");
        setCameraType(status.camera_type || null);
        setCameraIndex(status.camera_index !== undefined ? status.camera_index : null);
        setCameraStatus(status.camera_status || { picamera: false, cameraids: false });
        if (status.stop_reason) {
          setWarning(status.stop_reason);
        } else if (status.storage_status === "running") {
          setWarning(null);
        }
        console.log("WebSocket update:", status);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    }
  };

  const fetchInitialStatus = async () => {
    try {
      const response = await fetch("/py/get_stream_status");
      const data = await response.json();
      if (response.ok) {
        setIsStoringImages(data.storage_status === "running");
        setIntervalValue(data.save_interval || 5);
        setIsPreviewing(data.preview_status === "running");
        setCameraType(data.camera_type || null);
        setCameraIndex(data.camera_index !== undefined ? data.camera_index : null);
        setCameraStatus(data.camera_status || { picamera: false, cameraids: false });
        if (data.stop_reason) {
          setWarning(data.stop_reason);
        } else if (data.storage_status === "running") {
          setWarning(null);
        }
      } else {
        throw new Error(data.detail || "Failed to fetch status");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  };

  const fetchCameras = async () => {
    try {
      const response = await fetch("/py/cameras");
      const data = await response.json();
      if (response.ok) {
        setCameras(data);
      } else {
        throw new Error(data.detail || "Failed to fetch cameras");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch camera list.");
    }
  };

  useEffect(() => {
    fetchInitialStatus();
    fetchCameras();
  }, []);

  useEffect(() => {
    if (!cameraType && (cameraStatus.picamera || cameraStatus.cameraids)) {
      setError("No camera selected. Please select an available camera.");
    } else {
      setError(null);
    }
    console.log("Camera type updated:", cameraType, "Camera index:", cameraIndex);
  }, [cameraType, cameraIndex, cameraStatus]);

  const startPreview = useCallback(async () => {
    try {
      const response = await fetch("/py/start_preview", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to start preview");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  }, []);

  const stopPreview = useCallback(async () => {
    try {
      const response = await fetch("/py/stop_preview", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to stop preview");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  }, []);

  const startStorage = useCallback(async () => {
    try {
      const response = await fetch("/py/start_storage", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to start storage");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  }, []);

  const stopStorage = useCallback(async () => {
    try {
      const response = await fetch("/py/stop_storage", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to stop storage");
      setError(null);
      setWarning(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  }, []);

  const handleSetInterval = async () => {
    try {
      const response = await fetch("/py/set_interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: Number(interval) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to set interval");
      setFeedback(`Interval set to ${interval} seconds.`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
      setFeedback(null);
    }
  };

  const handleSelectCamera = async (value: string) => {
    try {
      const [type, index] = value.split(":");
      const response = await fetch("/py/select_camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_type: type, index: Number(index) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to select camera");
      const camera = cameras.find((cam) => cam.type === type && cam.index === Number(index));
      setFeedback(`Switched to ${camera?.display_name || type} camera${type === "cameraids" ? ` (Index ${index})` : ""}.`);
      setError(null);
      setWarning(null);
      await startPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
      setFeedback(null);
    }
  };

  const connectionStatusText = ReadyState[connectionStatus];

  const getCurrentCameraLabel = () => {
    if (!cameraType) return "None";
    const camera = cameras.find((cam) => cam.type === cameraType && cam.index === (cameraIndex ?? 0));
    if (camera) {
      return camera.type === "picamera" ? camera.display_name : `${camera.display_name} (Index ${camera.index})`;
    }
    return cameraType === "picamera" ? "Classic Camera" : "Near-Infrared Camera";
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Camera Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle>Camera Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={cameraType && cameraIndex !== null ? `${cameraType}:${cameraIndex}` : ""}
            onValueChange={handleSelectCamera}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select camera" />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((camera) => (
                <SelectItem
                  key={`${camera.type}:${camera.index}`}
                  value={`${camera.type}:${camera.index}`}
                  disabled={
                    (camera.type === "picamera" && !cameraStatus.picamera) ||
                    (camera.type === "cameraids" && !cameraStatus.cameraids)
                  }
                >
                  {camera.label}
                  {(camera.type === "picamera" && !cameraStatus.picamera) ||
                  (camera.type === "cameraids" && !cameraStatus.cameraids)
                    ? " (Unavailable)"
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle>Camera Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Status: {connectionStatusText} | Previewing: {isPreviewing ? "Yes" : "No"}
            </span>
            <Button
              onClick={isPreviewing ? stopPreview : startPreview}
              variant={isPreviewing ? "destructive" : "default"}
              disabled={connectionStatus !== ReadyState.OPEN || !cameraType}
            >
              {isPreviewing ? "Stop Preview" : "Start Preview"}
            </Button>
          </div>

          <div className="relative bg-gray-100 aspect-video">
            {connectionStatus !== ReadyState.OPEN && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-gray-500">{connectionStatusText}...</span>
              </div>
            )}
            <img
              ref={imgRef}
              alt="Camera Preview"
              className="w-full h-full object-contain"
            />
          </div>
        </CardContent>
      </Card>

      {/* Storage Card */}
      <Card>
        <CardHeader>
          <CardTitle>Image Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Storage Running: {isStoringImages ? "Yes" : "No"}
            </span>
            <Button
              onClick={isStoringImages ? stopStorage : startStorage}
              variant={isStoringImages ? "destructive" : "default"}
              disabled={!cameraType}
            >
              {isStoringImages ? "Stop Storage" : "Start Storage"}
            </Button>
          </div>

          <div className="flex items-center space-x-2">
            <Input
              type="number"
              value={interval}
              onChange={(e) => setIntervalValue(Number(e.target.value))}
              placeholder="Interval in seconds"
              min={1}
              step={0.1}
            />
            <Button onClick={handleSetInterval}>Set Interval</Button>
          </div>

          <div className="text-center">
            <Link href={imagesPath}>
              <Button variant="secondary">View Stored Images</Button>
            </Link>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {warning && (
            <Alert variant="destructive">
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          )}
          {feedback && (
            <Alert>
              <AlertDescription>{feedback}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
