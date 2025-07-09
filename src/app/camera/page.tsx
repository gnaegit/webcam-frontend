"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  parameters: CameraParameters;
}

interface CameraParameters {
  exposure: {
    auto: boolean;
    min: number | null;
    max: number | null;
    increment: number | null;
    current: number | null;
  };
  gain: {
    auto: boolean;
    min: number | null;
    max: number | null;
    increment: number | null;
    current: number | null;
  };
}

interface CameraSettings {
  auto_exposure: boolean;
  exposure_time: number | null;
  auto_gain: boolean;
  gain: number | null;
}

export default function CameraStream() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [cameraStatuses, setCameraStatuses] = useState<Record<string, CameraStatus>>({});
  const [interval, setInterval] = useState<number>(5);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ReadyState>(ReadyState.CLOSED);
  const [isLoadingCameras, setIsLoadingCameras] = useState<boolean>(true);
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    auto_exposure: true,
    exposure_time: null,
    auto_gain: true,
    gain: null,
  });

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
      setError("WebSocket connection failed. Please check the backend server.");
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
            setCameraSettings({
              auto_exposure: status.cameras[selectedCamera].parameters.exposure.auto,
              exposure_time: status.cameras[selectedCamera].parameters.exposure.current,
              auto_gain: status.cameras[selectedCamera].parameters.gain.auto,
              gain: status.cameras[selectedCamera].parameters.gain.current,
            });
          }
          if (status.new_image && status.camera_key === selectedCamera) {
            setSuccess(`Image captured and saved to <a href="${imagesPath}/${status.new_image}" target="_blank">${status.new_image}</a>`);
            setTimeout(() => setSuccess(null), 5000);
          }
          if (status.stop_reason && status.camera_key === selectedCamera) {
            console.warn(`Stop reason for ${status.camera_key}: ${status.stop_reason}`);
            setWarning(`Camera ${status.camera_key}: ${stop_reason}`);
          } else if (
            selectedCamera &&
            status.cameras[selectedCamera]?.storage_status === "running"
          ) {
            setWarning(null);
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
        setError("Invalid WebSocket message received.");
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
          setCameraSettings({
            auto_exposure: data.cameras[selectedCamera].parameters.exposure.auto,
            exposure_time: data.cameras[selectedCamera].parameters.exposure.current,
            auto_gain: data.cameras[selectedCamera].parameters.gain.auto,
            gain: data.cameras[selectedCamera].parameters.gain.current,
          });
        }
        if (data.stop_reason && data.camera_key === selectedCamera) {
          setWarning(`Camera ${data.camera_key}: ${data.stop_reason}`);
        }
      } else {
        throw new Error(data.detail || "Failed to fetch status");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch initial status.");
    }
  };

  const fetchCameras = async (retries = 3, delay = 1000): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch("/py/cameras");
        const data = await response.json();
        console.log("Fetched cameras:", data);
        if (response.ok) {
          if (Array.isArray(data) && data.length > 0) {
            setCameras(data);
            setError(null);
          } else {
            setError("No cameras found. Please connect a camera and try again.");
          }
          return;
        } else {
          throw new Error(data.detail || `Failed to fetch cameras (status: ${response.status})`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch camera list.";
        console.error(`Attempt ${attempt} failed:`, errorMsg);
        if (attempt === retries) {
          setError(errorMsg);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        setIsLoadingCameras(false);
      }
    }
  };

  const fetchCameraParameters = useCallback(async (cameraKey: string) => {
    try {
      const response = await fetch(`/py/get_camera_parameters/${cameraKey}`);
      const data = await response.json();
      if (response.ok) {
        setCameraSettings({
          auto_exposure: data.exposure.auto,
          exposure_time: data.exposure.current,
          auto_gain: data.gain.auto,
          gain: data.gain.current,
        });
        setCameraStatuses((prev) => ({
          ...prev,
          [cameraKey]: { ...prev[cameraKey], parameters: data },
        }));
        setError(null);
      } else {
        throw new Error(data.detail || "Failed to fetch camera parameters");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to fetch parameters for ${cameraKey}.`);
    }
  }, []);

  const updateCameraSettings = useCallback(async (cameraKey: string, settings: CameraSettings) => {
    try {
      const response = await fetch("/py/set_camera_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camera_key: cameraKey,
          auto_exposure: settings.auto_exposure,
          exposure_time: settings.exposure_time,
          auto_gain: settings.auto_gain,
          gain: settings.gain,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to set camera settings");
      setSuccess("Camera settings updated successfully.");
      setTimeout(() => setSuccess(null), 5000);
      setError(null);
      await fetchCameraParameters(cameraKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to set settings for ${cameraKey}.`);
    }
  }, [fetchCameraParameters]);

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
      setError(err instanceof Error ? err.message : `Failed to stop storage for ${cameraKey}.`);
    }
  }, []);

  const captureImage = useCallback(async (cameraKey: string) => {
    try {
      console.log(`Capturing image for ${cameraKey}`);
      const response = await fetch("/py/capture_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_key: cameraKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to capture image");
      console.log(`Image captured for ${cameraKey}:`, data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to capture image for ${cameraKey}.`);
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
        try {
          const response = await fetch("/py/select_camera", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ camera_key: cameraKey }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to select camera");
          await startPreview(cameraKey);
          await fetchCameraParameters(cameraKey);
        } catch (err) {
          setError(err instanceof Error ? err.message : `Failed to select camera ${cameraKey}.`);
        }
      }
    },
    [selectedCamera, startPreview, stopPreview, fetchCameraParameters]
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
          "Authorization": "Bearer supersecretkey",
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

  useEffect(() => {
    fetchInitialStatus();
    fetchCameras();
  }, []);

  const connectionStatusText = ReadyState[connectionStatus];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Camera Selection</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Select
            value={selectedCamera || ""}
            onValueChange={handleSelectCamera}
            disabled={isLoadingCameras}
          >
            <SelectTrigger>
              <SelectValue placeholder={isLoadingCameras ? "Loading cameras..." : cameras.length === 0 ? "No cameras available" : "Select a camera"} />
            </SelectTrigger>
            <SelectContent>
              {cameras.map((camera) => (
                <SelectItem key={camera.camera_key} value={camera.camera_key}>
                  {camera.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

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
              <Button
                onClick={() => captureImage(selectedCamera)}
                variant="default"
                disabled={connectionStatus !== ReadyState.OPEN}
              >
                Capture Image
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

            {cameraStatuses[selectedCamera].camera_type === "cameraids" ? (
              <div className="space-y-4">
                <h3 className="font-semibold">Camera Settings</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-exposure"
                      checked={cameraSettings.auto_exposure}
                      onCheckedChange={(checked) =>
                        setCameraSettings((prev) => ({ ...prev, auto_exposure: checked, exposure_time: checked ? null : prev.exposure_time || 1000 }))
                      }
                    />
                    <Label htmlFor="auto-exposure">Auto Exposure</Label>
                  </div>
                  {!cameraSettings.auto_exposure && (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="number"
                        value={cameraSettings.exposure_time || ""}
                        onChange={(e) =>
                          setCameraSettings((prev) => ({ ...prev, exposure_time: Number(e.target.value) }))
                        }
                        placeholder="Exposure time (µs)"
                        min={cameraStatuses[selectedCamera].parameters?.exposure.min || 0}
                        max={cameraStatuses[selectedCamera].parameters?.exposure.max || 1000000}
                        step={cameraStatuses[selectedCamera].parameters?.exposure.increment || 1}
                      />
                      <span className="text-sm text-gray-500">
                        Range: [{cameraStatuses[selectedCamera].parameters?.exposure.min} - {cameraStatuses[selectedCamera].parameters?.exposure.max} µs]
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto-gain"
                      checked={cameraSettings.auto_gain}
                      onCheckedChange={(checked) =>
                        setCameraSettings((prev) => ({ ...prev, auto_gain: checked, gain: checked ? null : prev.gain || 0 }))
                      }
                    />
                    <Label htmlFor="auto-gain">Auto Gain</Label>
                  </div>
                  {!cameraSettings.auto_gain && (
                    <div className="flex items-center space-x-2">
                      <Input
                        type="number"
                        value={cameraSettings.gain || ""}
                        onChange={(e) =>
                          setCameraSettings((prev) => ({ ...prev, gain: Number(e.target.value)}))
                        }
                        placeholder="Gain"
                        min={cameraStatuses[selectedCamera].parameters?.gain.min || 0}
                        max={cameraStatuses[selectedCamera].parameters?.gain.max || 100}
                        step={cameraStatuses[selectedCamera].parameters?.gain.increment || 0.1}
                      />
                      <span className="text-sm text-gray-500">
                        Range: [{cameraStatuses[selectedCamera].parameters?.gain.min} - {cameraStatuses[selectedCamera].parameters?.gain.max}]
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  onClick={() => updateCameraSettings(selectedCamera, cameraSettings)}
                  variant="default"
                >
                  Apply Camera Settings
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Manual exposure and gain settings are not supported for Raspberry Pi cameras.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
          {success && (
            <Alert variant="default">
              <AlertDescription dangerouslySetInnerHTML={{ __html: success }} />
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
