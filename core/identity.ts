import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { randomBytes } from "crypto";

export interface SystemIdentity {
  username: string;
  gitName: string | null;
  displayName: string;
  hostname: string;
}

export interface SystemStats {
  freeMemPct: number;
  totalMemMb: number;
  loadAvg: number;
  uptimeSec: number;
  platform: string;
}

export function getSystemIdentity(): SystemIdentity {
  let username = "user";
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || process.env.USERNAME || "user";
  }

  let pathName: string | null = null;
  try {
    const home = os.homedir();
    const base = home.split(path.sep).filter(Boolean).pop();
    if (base) pathName = base;
  } catch {
    pathName = null;
  }

  let gitName: string | null = null;
  try {
    const out = execFileSync("git", ["config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 800,
    }).trim();
    if (out) gitName = out;
  } catch {
    gitName = null;
  }

  const displayName = username || pathName || "user";
  void gitName;
  let hostname = "localhost";
  try {
    hostname = os.hostname();
  } catch {
    hostname = "localhost";
  }
  return { username, gitName, displayName, hostname };
}

export function getSystemStats(): SystemStats {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    freeMemPct: Math.round((free / total) * 100),
    totalMemMb: Math.round(total / 1024 / 1024),
    loadAvg: os.loadavg()[0] ?? 0,
    uptimeSec: Math.floor(os.uptime()),
    platform: os.platform(),
  };
}

export function generateHandshakeToken(): string {
  return randomBytes(8).toString("hex");
}
