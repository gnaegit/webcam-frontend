import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function getCpuUsage() {
  const cpus = os.cpus();
  return cpus.map((cpu) => {
    const total = Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0);
    const usage = 100 - (100 * cpu.times.idle) / total;
    return usage.toFixed(1);
  });
}

async function getCpuTemp() {
  const { stdout } = await execAsync("vcgencmd measure_temp");
  // in celsius
  return parseFloat(stdout.replace("temp=", "").replace("'C", ""));
}

async function getStorageUsage() {
  const { stdout } = await execAsync("df -B1 / | tail -1 | awk '{print $2,$3,$4}'");
  const [totalStorage, usedStorage, freeStorage] = stdout
    .trim()
    .split(/\s+/)
    .map((val) => parseInt(val));
  return {
    total: parseFloat(bytesToGB(totalStorage)),
    used: parseFloat(bytesToGB(usedStorage)),
    free: parseFloat(bytesToGB(freeStorage)),
  };
}

function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    total: parseFloat(bytesToGB(totalMem)),
    used: parseFloat(bytesToGB(usedMem)),
    free: parseFloat(bytesToGB(freeMem)),
  };
}

function bytesToGB(bytes: number) {
  return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

export async function getSystemDetails() {
  return {
    os,
    cpuTemp: await getCpuTemp(),
    cpuUsage: getCpuUsage(),
    memoryUsage: getMemoryUsage(),
    storageUsage: await getStorageUsage(),
  };
}
