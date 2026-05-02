import { spawn } from "child_process";
import * as os from "os";

const MIN_GAP_MS = 10_000;
const lastNotifiedAt = new Map<string, number>();
let enabled = true;

export function setNotificationsEnabled(on: boolean): void {
  enabled = on;
}

export function isNotificationsEnabled(): boolean {
  return enabled;
}

function detached(file: string, args: string[]): void {
  try {
    const child = spawn(file, args, { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* swallow */
  }
}

export function sendNeedsInputNotification(agentName: string, agentKey: string): void {
  if (!enabled) return;
  const now = Date.now();
  const last = lastNotifiedAt.get(agentKey) ?? 0;
  if (now - last < MIN_GAP_MS) return;
  lastNotifiedAt.set(agentKey, now);

  const title = "⚠ Agent Mini RPG";
  const body = `${agentName} is waiting for your input`;
  const platform = os.platform();

  if (platform === "darwin") {
    const script = `display notification "${body}" with title "${title}"`;
    detached("/bin/sh", ["-c", `osascript -e '${script}' 2>/dev/null`]);
  } else if (platform === "linux") {
    detached("/bin/sh", [
      "-c",
      `notify-send "${title}" "${body}" --expire-time=5000 --urgency=normal 2>/dev/null`,
    ]);
  }
}
