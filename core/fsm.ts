import { AgentState } from "./types";

const TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ["exploring", "moving", "talking", "sleep", "thinking", "zombie"],
  exploring: ["idle", "moving", "fighting", "sleep", "thinking", "zombie"],
  moving: ["idle", "working", "fighting", "talking", "exploring", "sleep", "thinking", "zombie"],
  working: ["idle", "moving", "sleep", "thinking", "zombie"],
  fighting: ["idle", "moving", "sleep", "thinking", "zombie"],
  talking: ["idle", "moving", "sleep", "thinking", "zombie"],
  sleep: ["idle", "thinking", "moving", "exploring", "zombie"],
  thinking: ["idle", "sleep", "moving", "exploring", "zombie"],
  zombie: [],
};

export class FSM {
  private state: AgentState;

  constructor(initial: AgentState = "idle") {
    this.state = initial;
  }

  current(): AgentState {
    return this.state;
  }

  canTransition(to: AgentState): boolean {
    return TRANSITIONS[this.state].includes(to) || this.state === to;
  }

  transition(to: AgentState): boolean {
    if (this.state === to) return true;
    if (!this.canTransition(to)) return false;
    this.state = to;
    return true;
  }

  force(to: AgentState): void {
    this.state = to;
  }
}
