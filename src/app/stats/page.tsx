"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SystemInfo {
  os: {
    hostname: () => string;
    platform: () => string;
    arch: () => string;
  };
  cpuTemp: number;
  cpuUsage: string[];
  memoryUsage: { total: number; used: number; free: number };
  storageUsage: { total: number; used: number; free: number };
}

export default function Stats() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch("/api/system");
        if (!response.ok) {
          throw new Error("Failed to fetch system details");
        }
        const data = await response.json();
        setSystemInfo(data);
        setError(null);
      } catch (err) {
        setError("Error fetching system details");
        console.error(err);
      }
    };

    // Initial fetch
    fetchSystemInfo();

    // Set up interval to fetch every 5 seconds
    const intervalId = setInterval(fetchSystemInfo, 5000);

    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);

  if (error) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Raspberry Pi</h1>
        <p className="text-red-500">{error}</p>
      </main>
    );
  }

  if (!systemInfo) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Raspberry Pi</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-6 text-foreground">Raspberry Pi</h1>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {[
              ["Hostname", systemInfo.os.hostname],
              ["Platform", systemInfo.os.platform],
              ["Architecture", systemInfo.os.arch],
              ["CPU Temperature", `${systemInfo.cpuTemp.toFixed(1)}°C`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}:</span>
                <span className="text-foreground font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">CPU Usage</h3>
            {systemInfo.cpuUsage.map((usage, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Core {index}</span>
                  <span>{usage}%</span>
                </div>
                <Progress value={parseFloat(usage)} className="h-2" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Memory Usage</h3>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Used</span>
              <span>{systemInfo.memoryUsage.used.toFixed(2)} / {systemInfo.memoryUsage.total.toFixed(2)} GB</span>
            </div>
            <Progress 
              value={(systemInfo.memoryUsage.used / systemInfo.memoryUsage.total) * 100} 
              className="h-2" 
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Storage Usage</h3>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Used</span>
              <span>{systemInfo.storageUsage.used.toFixed(2)} / {systemInfo.storageUsage.total.toFixed(2)} GB</span>
            </div>
            <Progress 
              value={(systemInfo.storageUsage.used / systemInfo.storageUsage.total) * 100} 
              className="h-2" 
            />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}