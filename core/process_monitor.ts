import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const pexecFile = promisify(execFile);

export type ProcessState = "ACTIVE" | "STANDBY" | "IDLE" | "DISCONNECTED";

export interface ClaudeProcess {
  pid: number;
  ppid: number;
  name: string;
  cmd: string;
  cpu: number;
  mem: number;
  writing: boolean;
  writeBytes: number;
  isRoot: boolean;
}

const SAMPLE_INTERVAL_MS = 1000;
const CPU_BUSY_THRESHOLD = 15.0;
const CPU_STANDBY_THRESHOLD = 1.0;
const BUSY_DEBOUNCE_MS = 1500;
const PS_TIMEOUT_MS = 1500;

interface PsListEntry {
  pid: number;
  ppid?: number;
  name: string;
  cmd?: string;
  cpu?: number;
  memory?: number;
}

interface PidUsageStats {
  cpu: number;
  memory: number;
}

let psListFn: (() => Promise<PsListEntry[]>) | null = null;
let pidUsageFn: ((pid: number) => Promise<PidUsageStats>) | null = null;
let depsAttempted = false;

function tryRequire<T = unknown>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name) as T;
  } catch {
    return null;
  }
}

function loadOptionalDeps(): void {
  if (depsAttempted) return;
  depsAttempted = true;
  const psModule = tryRequire<unknown>("ps-list");
  if (psModule) {
    const candidate =
      typeof psModule === "function"
        ? (psModule as () => Promise<PsListEntry[]>)
        : (psModule as { default?: () => Promise<PsListEntry[]> }).default;
    if (typeof candidate === "function") psListFn = candidate;
  }
  const usageModule = tryRequire<unknown>("pidusage");
  if (usageModule) {
    const candidate =
      typeof usageModule === "function"
        ? (usageModule as (pid: number) => Promise<PidUsageStats>)
        : (usageModule as {
            default?: (pid: number) => Promise<PidUsageStats>;
          }).default;
    if (typeof candidate === "function") pidUsageFn = candidate;
  }
}

export class ProcessMonitor {
  patterns: string[];
  current: ClaudeProcess | null;
  processes: ClaudeProcess[];
  everSeen: boolean;
  busy: boolean;
  lastSampledAt: number;
  sampleCount: number;
  private prevWriteBytes: Map<number, number>;
  private busySinceMs: Map<number, number>;
  private lastActiveAt: Map<number, number>;

  constructor(patterns: string[] = ["claude"]) {
    this.patterns = patterns;
    this.current = null;
    this.processes = [];
    this.everSeen = false;
    this.busy = false;
    this.lastSampledAt = 0;
    this.lastActiveAt = new Map();
    this.sampleCount = 0;
    this.prevWriteBytes = new Map();
    this.busySinceMs = new Map();
    loadOptionalDeps();
  }

  list(): ClaudeProcess[] {
    return this.processes;
  }

  roots(): ClaudeProcess[] {
    return this.processes.filter((p) => p.isRoot);
  }

  getByPid(pid: number): ClaudeProcess | null {
    return this.processes.find((p) => p.pid === pid) ?? null;
  }

  topByCpu(): ClaudeProcess | null {
    if (this.processes.length === 0) return null;
    return [...this.processes].sort((a, b) => b.cpu - a.cpu)[0];
  }

  hasNativeBackends(): boolean {
    return psListFn !== null;
  }

  async sample(): Promise<void> {
    const now = Date.now();
    if (this.busy) return;
    if (now - this.lastSampledAt < SAMPLE_INTERVAL_MS) return;
    this.busy = true;
    try {
      const candidates = psListFn
        ? await this.discoverAllViaPsList()
        : await this.discoverAllViaPs();
      const enriched: ClaudeProcess[] = [];
      const pidSet = new Set(candidates.map((c) => c.pid));
      for (const c of candidates) {
        const stats = await this.measure(c.pid, c.cpu, c.mem);
        const { writing, writeBytes } = this.checkWriting(c.pid);
        enriched.push({
          ...c,
          cpu: stats.cpu,
          mem: stats.mem,
          writing,
          writeBytes,
          isRoot: !pidSet.has(c.ppid),
        });
      }
      this.processes = enriched;
      this.current =
        enriched.length > 0
          ? [...enriched].sort((a, b) => b.cpu - a.cpu)[0]
          : null;
      if (this.current) this.everSeen = true;

      const livePids = new Set(enriched.map((p) => p.pid));
      for (const p of enriched) {
        if (p.cpu >= CPU_BUSY_THRESHOLD) {
          if (!this.busySinceMs.has(p.pid)) {
            this.busySinceMs.set(p.pid, now);
          }
        } else {
          this.busySinceMs.delete(p.pid);
        }
        if (this.pidState(p.pid) === "ACTIVE") {
          this.lastActiveAt.set(p.pid, now);
        }
      }
      for (const pid of [...this.busySinceMs.keys()]) {
        if (!livePids.has(pid)) this.busySinceMs.delete(pid);
      }
      for (const pid of [...this.lastActiveAt.keys()]) {
        if (!livePids.has(pid)) this.lastActiveAt.delete(pid);
      }

      this.lastSampledAt = now;
      this.sampleCount += 1;
    } catch {
      this.processes = [];
      this.current = null;
      this.lastSampledAt = now;
    } finally {
      this.busy = false;
    }
  }

  private async discoverAllViaPsList(): Promise<ClaudeProcess[]> {
    if (!psListFn) return [];
    const list = await psListFn();
    const own = process.pid;
    const parent = process.ppid ?? -1;
    return list
      .filter((p) => p.pid !== own && p.pid !== parent)
      .filter((p) => !this.isSelf(p.cmd ?? "", p.name ?? ""))
      .filter((p) => this.matchesPattern(p.cmd ?? "", p.name ?? ""))
      .map((p) => ({
        pid: p.pid,
        ppid: p.ppid ?? -1,
        name: p.name,
        cmd: p.cmd ?? p.name,
        cpu: p.cpu ?? 0,
        mem: p.memory ? p.memory / 1024 / 1024 : 0,
        writing: false,
        writeBytes: 0,
        isRoot: true,
      }));
  }

  private async discoverAllViaPs(): Promise<ClaudeProcess[]> {
    const { stdout } = await pexecFile(
      "ps",
      ["-axo", "pid=,ppid=,pcpu=,pmem=,comm=,args="],
      { timeout: PS_TIMEOUT_MS }
    );
    const own = process.pid;
    const parent = process.ppid ?? -1;
    const lines = stdout.split("\n");
    const out: ClaudeProcess[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(
        /^(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(.*)$/
      );
      if (!m) continue;
      const pid = parseInt(m[1], 10);
      const ppid = parseInt(m[2], 10);
      if (pid === own || pid === parent) continue;
      const cpu = parseFloat(m[3]);
      const mem = parseFloat(m[4]);
      const comm = m[5];
      const args = m[6];
      const fullCmd = `${comm} ${args}`;
      if (this.isSelf(fullCmd, comm)) continue;
      if (!this.matchesPattern(fullCmd, comm)) continue;
      out.push({
        pid,
        ppid,
        name: comm,
        cmd: fullCmd,
        cpu,
        mem,
        writing: false,
        writeBytes: 0,
        isRoot: true,
      });
    }
    return out;
  }

  private isSelf(cmd: string, name: string): boolean {
    const blob = `${cmd} ${name}`;
    return (
      blob.includes("agents-mini-rpg") ||
      blob.includes("agent-mini-rpg") ||
      blob.includes("ps -axo") ||
      blob.includes("ps-list")
    );
  }

  private matchesPattern(cmd: string, name: string): boolean {
    const lc = `${cmd} ${name}`.toLowerCase();
    return this.patterns.some((p) => lc.includes(p.toLowerCase()));
  }

  private async measure(
    pid: number,
    fallbackCpu: number,
    fallbackMem: number
  ): Promise<{ cpu: number; mem: number }> {
    if (pidUsageFn) {
      try {
        const stats = await pidUsageFn(pid);
        return { cpu: stats.cpu, mem: stats.memory / 1024 / 1024 };
      } catch {
        /* fall through */
      }
    }
    return { cpu: fallbackCpu, mem: fallbackMem };
  }

  private checkWriting(pid: number): { writing: boolean; writeBytes: number } {
    try {
      const data = fs.readFileSync(`/proc/${pid}/io`, "utf8");
      const m = data.match(/write_bytes:\s*(\d+)/);
      if (!m) return { writing: false, writeBytes: 0 };
      const cur = parseInt(m[1], 10);
      const prev = this.prevWriteBytes.get(pid);
      this.prevWriteBytes.set(pid, cur);
      if (prev === undefined) return { writing: false, writeBytes: cur };
      return { writing: cur > prev, writeBytes: cur };
    } catch {
      return { writing: false, writeBytes: 0 };
    }
  }

  state(): ProcessState {
    if (this.current === null) {
      return this.everSeen ? "DISCONNECTED" : "IDLE";
    }
    return this.pidState(this.current.pid);
  }

  pidState(pid: number): ProcessState {
    const proc = this.getByPid(pid);
    if (!proc) return "DISCONNECTED";
    const cpu = proc.cpu;
    if (cpu >= CPU_BUSY_THRESHOLD) {
      const since = this.busySinceMs.get(pid);
      if (since !== undefined && Date.now() - since >= BUSY_DEBOUNCE_MS) {
        return "ACTIVE";
      }
      return "STANDBY";
    }
    if (cpu >= CPU_STANDBY_THRESHOLD) return "STANDBY";
    return "IDLE";
  }

  isBusy(): boolean {
    return this.state() === "ACTIVE";
  }

  isStandby(): boolean {
    return this.state() === "STANDBY";
  }

  isIdle(): boolean {
    return this.state() === "IDLE" && this.current !== null;
  }

  isPidActive(pid: number): boolean {
    return this.pidState(pid) === "ACTIVE";
  }

  anyRecentlyActive(windowMs: number): boolean {
    const cutoff = Date.now() - windowMs;
    for (const ts of this.lastActiveAt.values()) {
      if (ts >= cutoff) return true;
    }
    return false;
  }

  isConnected(): boolean {
    return this.current !== null;
  }

  isDisconnected(): boolean {
    return this.everSeen && this.current === null;
  }
}
