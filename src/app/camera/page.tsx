"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface Camera {
  camera_key: string;
  type: string;
  index: number;
  display_name: string;
  model: string;
  serial: string;
  label: string;
}

interface CameraStatus {
  preview_status: string;
  storage_status: string;
  save_interval: number;
  current_folder: string | null;
  camera_type: string;
  camera_index: number;
  camera_key: string;
}

export default function CameraStream() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, CameraStatus>>({});
  const [intervals, setIntervals] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ReadyState>(ReadyState.CLOSED);
  const [isMounted, setIsMounted] = useState(false);

  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const pathname = usePathname();
  const imagesPath = `${pathname}/images`;

  useEffect(() => {
    setIsMounted(true); // Ensure client-side rendering
  }, []);

  const { lastMessage, readyState } = useWebSocket("/py/ws", {
    shouldReconnect: () => true,
    onOpen: () => setConnectionStatus(ReadyState.OPEN),
    onClose: () => {
      setConnectionStatus(ReadyState.CLOSED);
      setCameraStatuses((prev) =>
        Object.fromEntries(
          Object.entries(prev).map(([key, status]) => [
            key,
            { ...status, preview_status: "stopped", storage_status: "stopped" },
          ])
        )
      );
    },
    onError: () => setConnectionStatus(ReadyState.CLOSED),
    onMessage: (message) => handleWebSocketMessage(message),
  });

  const handleWebSocketMessage = (message: MessageEvent) => {
    if (message.data instanceof Blob) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const headersEnd = result.indexOf("\r\n\r\n");
        const headers = result.slice(0, headersEnd).split("\r\n");
        let cameraKey = "";
        for (const header of headers) {
          if (header.startsWith("X-Camera-Key: ")) {
            cameraKey = header.split(": ")[1];
            break;
          }
        }
        if (cameraKey && imgRefs.current[cameraKey]) {
          const imgData = result.slice(headersEnd + 4);
          imgRefs.current[cameraKey]!.src = `data:image/jpeg;base64,${btoa(imgData)}`;
          setCameraStatuses((prev) => ({
            ...prev,
            [cameraKey]: { ...prev[cameraKey], preview_status: "running" },
          }));
        }
      };
      reader.readAsBinaryString(message.data);
    } else {
      try {
        const status = JSON.parse(message.data);
        if (status.cameras) {
          setCameraStatuses(status.cameras);
          setIntervals(
            Object.fromEntries(
              Object.entries(status.cameras).map(([key, cam]: [string, CameraStatus]) => [key, cam.save_interval])
            )
          );
          if (status.stop_reason && status.camera_key) {
            setWarning(`Camera ${status.camera_key}: ${status.stop_reason}`);
          } else if (Object.values(status.cameras).some((cam: CameraStatus) => cam.storage_status === "running")) {
            setWarning(null);
          }
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
        setCameraStatuses(data.cameras || {});
        setIntervals(
          Object.fromEntries(
            Object.entries(data.cameras || {}).map(([key, cam]: [string, CameraStatus]) => [key, cam.save_interval])
          )
        );
        if (data.stop_reason && data.camera_key) {
          setWarning(`Camera ${data.camera_key}: ${data.stop_reason}`);
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
    if (isMounted) {
      fetchInitialStatus();
      fetchCameras();
    }
  }, [isMounted]);

  const startPreview = useCallback(async (cameraKey: string) => {
    try {
      const response = await fetch("/py/start_preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to start preview");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to start preview for ${cameraKey}.`);
    }
  }, []);

  const stopPreview = useCallback(async (cameraKey: string) => {
    try {
      const response = await fetch("/py/stop_preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to stop preview");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to stop preview for ${cameraKey}.`);
    }
  }, []);

  const startStorage = useCallback(async (cameraKey: string) => {
    try {
      const response = await fetch("/py/start_storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to start storage");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to start storage for ${cameraKey}.`);
    }
  }, []);

  const stopStorage = useCallback(async (cameraKey: string) => {
    try {
      const response = await fetch("/py/stop_storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to stop storage");
      setError(null);
      setWarning(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to stop storage for ${cameraKey}.`);
    }
  }, []);

  const handleSetInterval = useCallback(async (cameraKey: string, interval: number) => {
    try {
      const response = await fetch("/py/set_interval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey, interval }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to set interval");
      setFeedback(`Interval set to ${interval} seconds for ${cameraKey}.`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to set interval for ${cameraKey}.`);
      setFeedback(null);
    }
  }, []);

  const connectionStatusText = ReadyState[connectionStatus];

  if (!isMounted) {
    return null; // Prevent SSR rendering
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {cameras.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>No cameras available. Please check the server configuration.</AlertDescription>
        </Alert>
      )}
      {cameras.map((camera) => (
        <Card key={camera.camera_key}>
          <CardHeader>
            <CardTitle>{camera.label} ({camera.camera_key})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Status: {connectionStatusText} | Previewing:{" "}
                {cameraStatuses[camera.camera_key]?.preview_status === "running" ? "Yes" : "No"}
              </span>
              <Button
                onClick={() =>
                  cameraStatuses[camera.camera_key]?.preview_status === "running"
                    ? stopPreview(camera.camera_key)
                    : startPreview(camera.camera_key)
                }
                variant={cameraStatuses[camera.camera_key]?.preview_status === "running" ? "destructive" : "default"}
                disabled={connectionStatus !== ReadyState.OPEN}
              >
                {cameraStatuses[camera.camera_key]?.preview_status === "running" ? "Stop Preview" : "Start Preview"}
              </Button>
            </div>
            <div className="relative bg-gray-100 aspect-video">
              {connectionStatus !== ReadyState.OPEN && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-gray-500">{connectionStatusText}...</span>
                </div>
              )}
              <img
                ref={(el) => (imgRefs.current[camera.camera_key] = el)}
                alt={`${camera.label} Preview`}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Storage Running: {cameraStatuses[camera.camera_key]?.storage_status === "running" ? "Yes" : "No"}
              </span>
              <Button
                onClick={() =>
                  cameraStatuses[camera.camera_key]?.storage_status === "running"
                    ? stopStorage(camera.camera_key)
                    : startStorage(camera.camera_key)
                }
                variant={cameraStatuses[camera.camera_key]?.storage_status === "running" ? "destructive" : "default"}
              >
                {cameraStatuses[camera.camera_key]?.storage_status === "running" ? "Stop Storage" : "Start Storage"}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={intervals[camera.camera_key] || 5}
                onChange={(e) =>
                  setIntervals((prev) => ({ ...prev, [camera.camera_key]: Number(e.target.value) }))
                }
                placeholder="Interval in seconds"
                min={1}
                step={0.1}
              />
              <Button onClick={() => handleSetInterval(camera.camera_key, intervals[camera.camera_key] || 5)}>
                Set Interval
              </Button>
            </div>
            <div className="text-center">
              <Link href={`${imagesPath}/${cameraStatuses[camera.camera_key]?.current_folder || ""}`}>
                <Button variant="secondary" disabled={!cameraStatuses[camera.camera_key]?.current_folder}>
                  View Stored Images
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
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
    </div>
  );
}
