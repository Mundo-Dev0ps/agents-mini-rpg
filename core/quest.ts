import { Quest, QuestKind, Position } from "./types";

let questCounter = 0;

export function makeQuest(
  title: string,
  description: string,
  kind: QuestKind,
  target: Position,
  reward: number,
  patrolPoints?: Position[],
  requiresPlayer: boolean = false
): Quest {
  questCounter += 1;
  return {
    id: `q${questCounter}`,
    title,
    description,
    kind,
    target,
    patrolPoints,
    patrolIndex: patrolPoints ? 0 : undefined,
    assignedAgent: null,
    status: "available",
    reward,
    requiresPlayer,
    playerAssisted: false,
  };
}

export class QuestBoard {
  quests: Quest[] = [];

  add(q: Quest): void {
    this.quests.push(q);
  }

  available(): Quest[] {
    return this.quests.filter((q) => q.status === "available");
  }

  active(): Quest[] {
    return this.quests.filter((q) => q.status === "active");
  }

  completed(): Quest[] {
    return this.quests.filter((q) => q.status === "completed");
  }

  findById(id: string): Quest | undefined {
    return this.quests.find((q) => q.id === id);
  }

  assign(quest: Quest, agentId: string): void {
    quest.assignedAgent = agentId;
    quest.status = "active";
  }

  complete(quest: Quest): void {
    quest.status = "completed";
  }
}
