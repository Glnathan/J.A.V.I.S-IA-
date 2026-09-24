import os from "node:os";
import type { SystemStats } from "@/lib/types";
import { pcControlAvailable } from "./pc";

function cpuTimes() {
  return os.cpus().map((c) => {
    const t = c.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

function platformLabel(): string {
  switch (process.platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}

export async function getServerStats(): Promise<SystemStats> {
  const a = cpuTimes();
  await new Promise((r) => setTimeout(r, 250));
  const b = cpuTimes();
  let idle = 0;
  let total = 0;
  b.forEach((t, i) => {
    idle += t.idle - (a[i]?.idle ?? 0);
    total += t.total - (a[i]?.total ?? 0);
  });
  const cpuUsage = total > 0 ? Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100))) : 0;
  const cpus = os.cpus();
  return {
    platform: platformLabel(),
    release: os.release(),
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model?.replace(/\s+/g, " ").trim() || "Processeur inconnu",
    cores: cpus.length,
    cpuUsage,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    pcControl: pcControlAvailable(),
    node: process.version,
  };
}
