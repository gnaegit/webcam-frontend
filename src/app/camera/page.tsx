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
}

export default function CameraStream() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, CameraStatus>>({});
  const [interval, setInterval] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ReadyState>(ReadyState.CLOSED);
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const pathname = usePathname();
  const imagesPath = `${pathname}/images`;

  const { lastMessage, readyState } = useWebSocket("/py/ws", {
    shouldReconnect: () => true,
    onOpen: () => {
      console.log("WebSocket opened");
      setConnectionStatus(ReadyState.OPEN);
    },
    onClose: () => {
      console.log("WebSocket closed");
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
    onError: () => {
      console.log("WebSocket error");
      setConnectionStatus(ReadyState.CLOSED);
    },
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
        if (cameraKey === selectedCamera && imgRef.current) {
          const imgData = result.slice(headersEnd + 4);
          imgRef.current.src = `data:image/jpeg;base64,${btoa(imgData)}`;
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
        console.log("WebSocket status message:", status);
        if (status.cameras) {
          setCameraStatuses((prev) => {
            const newStatuses = { ...prev };
            for (const [key, camStatus] of Object.entries(status.cameras)) {
              if (key === selectedCamera && camStatus.preview_status === "stopped" && prev[key]?.preview_status === "running") {
                console.warn(`Preview stopped for ${key}:`, camStatus);
                const stopReason = status.stop_reason || "Unknown reason";
                setWarning(`Camera ${key}: Preview stopped unexpectedly - ${stopReason}`);
              }
              newStatuses[key] = camStatus as CameraStatus;
            }
            return newStatuses;
          });
          if (selectedCamera && status.cameras[selectedCamera]) {
            setInterval(status.cameras[selectedCamera].save_interval);
          }
          if (status.stop_reason && status.camera_key === selectedCamera) {
            console.warn(`Stop reason for ${status.camera_key}: ${status.stop_reason}`);
            setWarning(`Camera ${status.camera_key}: ${status.stop_reason}`);
          } else if (
            selectedCamera &&
            status.cameras[selectedCamera]?.storage_status === "running"
          ) {
            setWarning(null);
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    }
  };

  const fetchInitialStatus = async () => {
    try {
      const response = await fetch("/py/get_stream_status");
      const data = await response.json();
      console.log("Initial status:", data);
      if (response.ok) {
        setCameraStatuses(data.cameras || {});
        if (selectedCamera && data.cameras[selectedCamera]) {
          setInterval(data.cameras[selectedCamera].save_interval);
        }
        if (data.stop_reason && data.camera_key === selectedCamera) {
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
      console.log("Fetched cameras:", data);
      if (response.ok) {
        setCameras(data);
      } else {
        throw new Error(data.detail || "Failed to fetch cameras");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch camera list.");
    } finally {
      setIsLoadingCameras(false);
    }
  };

  useEffect(() => {
    fetchInitialStatus();
    fetchCameras();
  }, []);

  const startPreview = useCallback(async (cameraKey: string) => {
    try {
      console.log(`Starting preview for ${cameraKey}`);
      const response = await fetch("/py/start_preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to start preview");
      console.log(`Preview started for ${cameraKey}:`, data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to start preview for ${cameraKey}.`);
    }
  }, []);

  const stopPreview = useCallback(async (cameraKey: string) => {
    try {
      console.log(`Stopping preview for ${cameraKey}`);
      const response = await fetch("/py/stop_preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to stop preview");
      console.log(`Preview stopped for ${cameraKey}:`, data);
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
      setError(err instanceof Error ? err.message : `Failed to start storage for ${cameraKey}.`);
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to set interval for ${cameraKey}.`);
    }
  }, []);

  const handleSelectCamera = useCallback(
    async (cameraKey: string) => {
      console.log(`Selecting camera: ${cameraKey}`);
      if (selectedCamera && selectedCamera !== cameraKey) {
        await stopPreview(selectedCamera);
      }
      setSelectedCamera(cameraKey);
      if (cameraKey) {
        const camera = cameras.find((cam) => cam.camera_key === cameraKey);
        try {
          const response = await fetch("/py/select_camera", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ camera_key: cameraKey }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to select camera");
          await startPreview(cameraKey);
        } catch (err) {
          setError(err instanceof Error ? err.message : `Failed to select camera ${cameraKey}.`);
        }
      }
    },
    [selectedCamera, startPreview, stopPreview, cameras]
  );

  const handleRestartServer = useCallback(async () => {
    if (!confirm("Are you sure you want to restart the server? This will stop all camera operations.")) {
      return;
    }
    try {
      const response = await fetch("/py/restart_server", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer supersecretkey" // Hardcoded for simplicity; use environment variables in production
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to restart server");
      setError(null);
      alert("Server restart initiated. The page will reconnect automatically.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart server.");
    }
  }, []);

  const connectionStatusText = ReadyState[connectionStatus];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      {/* Camera Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle>Camera Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedCamera || ""}
            onValueChange={handleSelectCamera}
            disabled={isLoadingCameras}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoadingCameras ? "Loading cameras..." : "Select a camera"} />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((camera) => (
                <SelectItem
                  key={camera.camera_key}
                  value={camera.camera_key}
                >
                  {camera.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Camera Information and Controls Card */}
      {selectedCamera && cameraStatuses[selectedCamera] && (
        <Card>
          <CardHeader>
            <CardTitle>Camera Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              <span className="font-medium">Camera Key:</span> {selectedCamera}
            </p>
            <p>
              <span className="font-medium">Type:</span> {cameraStatuses[selectedCamera].camera_type}
            </p>
            <p>
              <span className="font-medium">Index:</span> {cameraStatuses[selectedCamera].camera_index}
            </p>
            <p>
              <span className="font-medium">Preview Status:</span>{" "}
              {cameraStatuses[selectedCamera].preview_status}
            </p>
            <p>
              <span className="font-medium">Storage Status:</span>{" "}
              {cameraStatuses[selectedCamera].storage_status}
            </p>
            <p>
              <span className="font-medium">Save Interval:</span>{" "}
              {cameraStatuses[selectedCamera].save_interval} seconds
            </p>
            <p>
              <span className="font-medium">Current Folder:</span>{" "}
              {cameraStatuses[selectedCamera].current_folder || "N/A"}
            </p>
            <div className="flex items-center space-x-2">
              <Button
                onClick={() =>
                  cameraStatuses[selectedCamera].preview_status === "running"
                    ? stopPreview(selectedCamera)
                    : startPreview(selectedCamera)
                }
                variant={cameraStatuses[selectedCamera].preview_status === "running" ? "destructive" : "default"}
                disabled={connectionStatus !== ReadyState.OPEN}
              >
                {cameraStatuses[selectedCamera].preview_status === "running" ? "Stop Preview" : "Start Preview"}
              </Button>
              <Button
                onClick={() =>
                  cameraStatuses[selectedCamera].storage_status === "running"
                    ? stopStorage(selectedCamera)
                    : startStorage(selectedCamera)
                }
                variant={cameraStatuses[selectedCamera].storage_status === "running" ? "destructive" : "default"}
              >
                {cameraStatuses[selectedCamera].storage_status === "running" ? "Stop Storage" : "Start Storage"}
              </Button>
            </div>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                placeholder="Interval in seconds"
                min={0.1}
                step={0.1}
              />
              <Button onClick={() => handleSetInterval(selectedCamera, interval)}>Set Interval</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Card */}
      {selectedCamera && (
        <Card>
          <CardHeader>
            <CardTitle>Camera Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Status: {connectionStatusText} | Previewing: {cameraStatuses[selectedCamera]?.preview_status === "running" ? "Yes" : "No"}
              </span>
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
      )}

      {/* Storage and Server Controls Card */}
      <Card>
        <CardHeader>
          <CardTitle>Image Storage and Server Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <Link href={imagesPath}>
              <Button variant="secondary">View Stored Images</Button>
            </Link>
            <Button 
              variant="destructive" 
              onClick={handleRestartServer}
            >
              Restart Server
            </Button>
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
        </CardContent>
      </Card>  
    </div>
  );
}