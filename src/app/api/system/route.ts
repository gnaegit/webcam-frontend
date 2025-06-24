import { NextResponse } from "next/server";
import { getSystemDetails } from "@/lib/system";

export async function GET() {
  try {
    const systemInfo = await getSystemDetails();
    // Serialize os methods to their values since they can't be sent directly
    const serializedInfo = {
      os: {
        hostname: systemInfo.os.hostname(),
        platform: systemInfo.os.platform(),
        arch: systemInfo.os.arch(),
      },
      cpuTemp: systemInfo.cpuTemp,
      cpuUsage: systemInfo.cpuUsage,
      memoryUsage: systemInfo.memoryUsage,
      storageUsage: systemInfo.storageUsage,
    };
    return NextResponse.json(serializedInfo);
  } catch (error) {
    console.error("Error fetching system details:", error);
    return NextResponse.json({ error: "Failed to fetch system details" }, { status: 500 });
  }
}