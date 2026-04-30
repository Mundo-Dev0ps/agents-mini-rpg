import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const SYNC_PATH = path.join(os.homedir(), ".agent_rpg_sync.json");
export const QUEUE_PATH = path.join(os.homedir(), ".agent_rpg_queue.ndjson");

export interface BridgePayload {
  raw?: string;
  power_up?: {
    hp?: number;
    atq?: number;
    note?: string;
  };
  message?: string;
  [key: string]: unknown;
}

export type BridgeListener = (payload: BridgePayload) => void;

const POLL_MS = 2000;
const FRESH_WINDOW_MS = 60000;
const ACTIVE_WINDOW_MS = 30000;

export class Bridge {
  syncPath: string;
  lastMtimeMs: number;
  lastSyncedAt: number;
  syncCount: number;
  lastPayload: BridgePayload | null;
  private intervalId: NodeJS.Timeout | null;
  private listeners: BridgeListener[];

  constructor(_syncPath?: string) {
    this.syncPath = SYNC_PATH;
    this.lastMtimeMs = 0;
    this.lastSyncedAt = 0;
    this.syncCount = 0;
    this.lastPayload = null;
    this.intervalId = null;
    this.listeners = [];
  }

  on(listener: BridgeListener): void {
    this.listeners.push(listener);
  }

  start(): void {
    try {
      if (fs.existsSync(QUEUE_PATH)) fs.writeFileSync(QUEUE_PATH, "");
    } catch {
      /* swallow */
    }
    this.poll(true);
    this.intervalId = setInterval(() => this.poll(false), POLL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isFresh(maxAgeMs: number = FRESH_WINDOW_MS): boolean {
    return (
      this.lastSyncedAt > 0 && Date.now() - this.lastSyncedAt < maxAgeMs
    );
  }

  isActive(): boolean {
    return this.isFresh(ACTIVE_WINDOW_MS);
  }

  ageSec(): number {
    if (this.lastSyncedAt === 0) return -1;
    return Math.floor((Date.now() - this.lastSyncedAt) / 1000);
  }

  private poll(initial: boolean): void {
    this.drainQueue();
    if (!fs.existsSync(this.syncPath)) return;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(this.syncPath);
    } catch {
      return;
    }
    const mtime = stat.mtimeMs;
    if (initial) {
      this.lastMtimeMs = mtime;
      if (Date.now() - mtime < FRESH_WINDOW_MS) {
        this.lastSyncedAt = mtime;
        this.readAndDispatch();
      }
      return;
    }
    if (mtime === this.lastMtimeMs) return;
    this.lastMtimeMs = mtime;
    this.lastSyncedAt = Date.now();
    this.syncCount += 1;
    this.readAndDispatch();
  }

  private drainQueue(): void {
    if (!fs.existsSync(QUEUE_PATH)) return;
    let content = "";
    try {
      content = fs.readFileSync(QUEUE_PATH, "utf8");
      fs.writeFileSync(QUEUE_PATH, "");
    } catch {
      return;
    }
    if (!content.trim()) return;
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      let payload: BridgePayload;
      try {
        payload = JSON.parse(line);
      } catch {
        continue;
      }
      this.lastPayload = payload;
      this.lastSyncedAt = Date.now();
      this.syncCount += 1;
      for (const l of this.listeners) {
        try {
          l(payload);
        } catch {
          /* swallow */
        }
      }
    }
  }

  private readAndDispatch(): void {
    let content = "";
    try {
      content = fs.readFileSync(this.syncPath, "utf8");
    } catch {
      return;
    }
    let payload: BridgePayload;
    try {
      payload = JSON.parse(content);
    } catch {
      const repaired = {
        mcp: false,
        repaired: true,
        ts: Date.now(),
        raw: content.slice(0, 200),
      };
      try {
        fs.writeFileSync(this.syncPath, JSON.stringify(repaired));
      } catch {
        /* swallow */
      }
      payload = repaired as unknown as BridgePayload;
    }
    this.lastPayload = payload;
    for (const l of this.listeners) {
      try {
        l(payload);
      } catch {
        /* swallow listener error */
      }
    }
  }
}
