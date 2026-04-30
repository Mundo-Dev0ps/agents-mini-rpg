import { spawn } from "child_process";
import * as os from "os";
import { GameMode } from "./themes";

const MIN_GAP_MS = 400;
let lastPlayedAt = 0;
let enabled = true;

export function setAudioTheme(_m: GameMode): void {
  /* no-op: single sound, theme-agnostic */
}

export function setAudioEnabled(on: boolean): void {
  enabled = on;
}

export function isAudioEnabled(): boolean {
  return enabled;
}

function detached(file: string, args: string[]): void {
  try {
    const child = spawn(file, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {
      /* swallow */
    });
    child.unref();
  } catch {
    /* swallow */
  }
}

const FD_BELL = "/usr/share/sounds/freedesktop/stereo/bell.oga";
const ALSA_DEFAULT = "/usr/share/sounds/alsa/Front_Center.wav";

function linuxNotify(): void {
  const cmd =
    `pw-play "${FD_BELL}" 2>/dev/null || ` +
    `paplay "${FD_BELL}" 2>/dev/null || ` +
    `aplay -q "${ALSA_DEFAULT}" 2>/dev/null || ` +
    `play -q "${FD_BELL}" 2>/dev/null || ` +
    `printf '\\a' > /dev/tty 2>/dev/null`;
  detached("/bin/sh", ["-c", cmd]);
}

function macNotify(): void {
  detached("/bin/sh", ["-c", "afplay /System/Library/Sounds/Tink.aiff 2>/dev/null"]);
}

function winNotify(): void {
  detached("powershell", ["-NoProfile", "-Command", "[console]::beep(880,150)"]);
}

export function playNeedsInput(): void {
  if (!enabled) return;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;
  const platform = os.platform();
  if (platform === "linux") linuxNotify();
  else if (platform === "darwin") macNotify();
  else if (platform === "win32") winNotify();
  else process.stdout.write("\x07");
}

export function audioDiagnostic(): string {
  const platform = os.platform();
  if (platform !== "linux") return `platform=${platform} enabled=${enabled}`;
  const fs = require("fs") as typeof import("fs");
  const fd = fs.existsSync(FD_BELL) ? "✓" : "✗";
  const alsa = fs.existsSync(ALSA_DEFAULT) ? "✓" : "✗";
  return `linux fd=${fd} alsa=${alsa} enabled=${enabled}`;
}
