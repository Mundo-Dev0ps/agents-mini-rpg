export type TileType =
  | "."
  | "#"
  | "~"
  | "%"
  | "M"
  | "B"
  | "+"
  | "L"
  | "F"
  | "G"
  | "E"
  | "$"
  | "w"
  | "H"
  | "T";

export type AgentState =
  | "idle"
  | "exploring"
  | "moving"
  | "working"
  | "fighting"
  | "talking"
  | "sleep"
  | "thinking"
  | "zombie";

export type AgentRole = "warrior" | "mage" | "worker" | "scout";

export type QuestStatus = "available" | "active" | "completed";

export type QuestKind = "collect" | "visit" | "patrol";

export interface Position {
  x: number;
  y: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  kind: QuestKind;
  target: Position;
  patrolPoints?: Position[];
  patrolIndex?: number;
  assignedAgent: string | null;
  status: QuestStatus;
  reward: number;
  requiresPlayer?: boolean;
  playerAssisted?: boolean;
}

export interface AgentInventory {
  gold: number;
  wood: number;
  meat: number;
  water: number;
  weapons: number;
  items: string[];
}

export interface AgentSnapshot {
  id: string;
  name: string;
  role: AgentRole;
  state: AgentState;
  pos: Position;
  facing: "up" | "down" | "left" | "right";
  hp: number;
  maxHp: number;
  atq: number;
  questId: string | null;
  log: string[];
  inventory: AgentInventory;
}
