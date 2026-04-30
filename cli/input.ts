import * as readline from "readline";

export type InputHandler = (key: string) => void;

export function setupInput(handler: InputHandler): () => void {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  const onKey = (str: string, key: readline.Key) => {
    if (key.ctrl && key.name === "c") {
      handler("q");
      return;
    }
    if (key.name) handler(key.name);
    else if (str) handler(str);
  };

  process.stdin.on("keypress", onKey);

  return () => {
    process.stdin.off("keypress", onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}
