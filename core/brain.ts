import { Position, TileType } from "./types";

export type LLMAction = "MOVE" | "COLLECT" | "ATTACK" | "WAIT" | "BUILD";

export interface ObservedBug {
  name: string;
  pos: Position;
  hp: number;
  distance: number;
}

export interface ObservedWeapon {
  pos: Position;
  bonus: number;
  distance: number;
}

export type ResourceKind = "wood" | "meat" | "water" | "energy" | "heart" | "cure";

export interface ObservedResource {
  kind: ResourceKind;
  pos: Position;
  distance: number;
}

export interface ObservedNPC {
  name: string;
  pos: Position;
  distance: number;
}

export interface Operator {
  username: string;
  display_name: string;
  hostname: string;
}

export interface Observation {
  agent_id: string;
  process_id: string;
  agent_name: string;
  tick: number;
  operator: Operator;
  current_pos: Position;
  health: { hp: number; max_hp: number };
  atq: number;
  inventory: { wood: number; meat: number; weapons: number };
  nearby_entities: {
    bugs: ObservedBug[];
    weapons: ObservedWeapon[];
    resources: ObservedResource[];
    npcs: ObservedNPC[];
  };
}

export interface Decision {
  action: LLMAction;
  target?: Position;
  thought: string;
  tokensUsed: number;
  source: "mock" | "claude";
}

export interface Brain {
  readonly source: "mock" | "claude";
  decide(obs: Observation): Promise<Decision>;
}

export interface ObservationWorldView {
  width: number;
  height: number;
  tiles: TileType[][];
}

export interface ObservedAgentInput {
  id: string;
  processId: string;
  name: string;
  pos: Position;
  hp: number;
  maxHp: number;
  atq: number;
  inventory: { wood: number; meat: number; weapons: number };
}

function estimateTokens(...parts: string[]): number {
  const total = parts.reduce((s, p) => s + p.length, 0);
  return Math.max(1, Math.round(total / 4));
}

export class MockBrain implements Brain {
  readonly source = "mock" as const;

  async decide(obs: Observation): Promise<Decision> {
    const inputBlob = JSON.stringify(obs);
    const op = obs.operator.display_name;
    const bugs = [...obs.nearby_entities.bugs].sort(
      (a, b) => a.distance - b.distance
    );

    const adj = bugs.find((b) => b.distance <= 1);
    if (adj) {
      const thought = `${op}, ${adj.name} adjacent (hp=${adj.hp}). Engaging — defense via offense.`;
      return this.pack("ATTACK", adj.pos, thought, inputBlob);
    }

    if (obs.health.hp < obs.health.max_hp * 0.3) {
      const meat = obs.nearby_entities.resources
        .filter((r) => r.kind === "meat")
        .sort((a, b) => a.distance - b.distance)[0];
      if (meat) {
        const thought = `${op}, HP critical (${obs.health.hp}/${obs.health.max_hp}). Falling back to 🥩.`;
        return this.pack("COLLECT", meat.pos, thought, inputBlob);
      }
    }

    const bugSwarmNearResource = bugs.filter(
      (b) =>
        b.distance <= 5 &&
        obs.nearby_entities.resources.some(
          (r) => Math.abs(r.pos.x - b.pos.x) + Math.abs(r.pos.y - b.pos.y) <= 3
        )
    );
    if (bugSwarmNearResource.length >= 2 && obs.inventory.wood > 3) {
      const thought = `${op}, ${bugSwarmNearResource.length} bugs near resources. Building 🧱 to bottleneck.`;
      return this.pack("BUILD", obs.current_pos, thought, inputBlob);
    }

    const weapon = [...obs.nearby_entities.weapons].sort(
      (a, b) => a.distance - b.distance
    )[0];
    if (weapon) {
      const thought = `${op}, weapon at d=${weapon.distance}. Picking up for +${weapon.bonus} ATQ.`;
      return this.pack("COLLECT", weapon.pos, thought, inputBlob);
    }

    if (bugs[0]) {
      const thought = `${op}, ${bugs[0].name} d=${bugs[0].distance}. Hunting before resource damage.`;
      return this.pack("ATTACK", bugs[0].pos, thought, inputBlob);
    }

    const res = [...obs.nearby_entities.resources].sort(
      (a, b) => a.distance - b.distance
    )[0];
    if (res) {
      const thought = `${op}, no threats. Collecting ${res.kind} at (${res.pos.x},${res.pos.y}).`;
      return this.pack("COLLECT", res.pos, thought, inputBlob);
    }

    const thought = `${op}, map quiet. Holding position.`;
    return this.pack("WAIT", undefined, thought, inputBlob);
  }

  private pack(
    action: LLMAction,
    target: Position | undefined,
    thought: string,
    blob: string
  ): Decision {
    return {
      action,
      target,
      thought,
      tokensUsed: estimateTokens(blob, thought),
      source: "mock",
    };
  }
}

export class ClaudeBrain implements Brain {
  readonly source = "claude" as const;
  apiKey: string;
  model: string;

  constructor(apiKey: string, model: string = "claude-haiku-4-5-20251001") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async decide(obs: Observation): Promise<Decision> {
    const sys =
      'You are an AI agent in a 2D RPG fighting bugs and gathering resources. Reply ONLY with strict JSON: {"action":"MOVE|COLLECT|ATTACK|WAIT","target":{"x":N,"y":N},"thought":"one sentence reasoning"}.';
    const user = `Observation:\n${JSON.stringify(obs)}\nDecide best next action.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 200,
          system: sys,
          messages: [{ role: "user", content: user }],
        }),
      });
      const data = (await res.json()) as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content?.[0]?.text ?? "";
      const tokens =
        (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      const parsed = this.parseDecision(text);
      return { ...parsed, tokensUsed: tokens, source: "claude" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        action: "WAIT",
        thought: `LLM error: ${msg}`,
        tokensUsed: 0,
        source: "claude",
      };
    }
  }

  private parseDecision(text: string): {
    action: LLMAction;
    target?: Position;
    thought: string;
  } {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        action: "WAIT",
        thought: text.slice(0, 80) || "no parseable response",
      };
    }
    try {
      const j = JSON.parse(match[0]) as {
        action?: string;
        target?: { x?: number; y?: number };
        thought?: string;
      };
      const allowed: LLMAction[] = ["MOVE", "COLLECT", "ATTACK", "WAIT"];
      const action = (allowed as string[]).includes(j.action ?? "")
        ? (j.action as LLMAction)
        : "WAIT";
      const target =
        j.target && typeof j.target.x === "number" && typeof j.target.y === "number"
          ? { x: j.target.x, y: j.target.y }
          : undefined;
      const thought = typeof j.thought === "string" ? j.thought : "no thought";
      return { action, target, thought };
    } catch {
      return { action: "WAIT", thought: "JSON parse error" };
    }
  }
}

export function makeBrain(): Brain {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) return new ClaudeBrain(key);
  return new MockBrain();
}

export function buildObservation(
  agent: ObservedAgentInput,
  world: ObservationWorldView,
  bugs: Array<{ name: string; pos: Position; hp: number }>,
  weapons: Array<{ pos: Position; bonus: number }>,
  npcs: Array<{ name: string; pos: Position }>,
  tick: number,
  operator: Operator,
  visionRadius: number = 8
): Observation {
  const dist = (p: Position): number =>
    Math.abs(p.x - agent.pos.x) + Math.abs(p.y - agent.pos.y);

  const obsBugs: ObservedBug[] = bugs
    .map((b) => ({
      name: b.name,
      pos: { ...b.pos },
      hp: b.hp,
      distance: dist(b.pos),
    }))
    .filter((b) => b.distance <= visionRadius)
    .sort((a, b) => a.distance - b.distance);

  const obsWeapons: ObservedWeapon[] = weapons
    .map((w) => ({ pos: { ...w.pos }, bonus: w.bonus, distance: dist(w.pos) }))
    .filter((w) => w.distance <= visionRadius)
    .sort((a, b) => a.distance - b.distance);

  const obsResources: ObservedResource[] = [];
  const yMin = Math.max(0, agent.pos.y - visionRadius);
  const yMax = Math.min(world.height - 1, agent.pos.y + visionRadius);
  const xMin = Math.max(0, agent.pos.x - visionRadius);
  const xMax = Math.min(world.width - 1, agent.pos.x + visionRadius);
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const d = dist({ x, y });
      if (d > visionRadius) continue;
      const t = world.tiles[y][x];
      if (t === "%") obsResources.push({ kind: "wood", pos: { x, y }, distance: d });
      else if (t === "M") obsResources.push({ kind: "meat", pos: { x, y }, distance: d });
      else if (t === "E") obsResources.push({ kind: "energy", pos: { x, y }, distance: d });
      else if (t === "H") obsResources.push({ kind: "heart", pos: { x, y }, distance: d });
      else if (t === "+") obsResources.push({ kind: "cure", pos: { x, y }, distance: d });
    }
  }
  obsResources.sort((a, b) => a.distance - b.distance);

  const obsNpcs: ObservedNPC[] = npcs
    .map((n) => ({ name: n.name, pos: { ...n.pos }, distance: dist(n.pos) }))
    .filter((n) => n.distance <= visionRadius);

  return {
    agent_id: agent.id,
    process_id: agent.processId,
    agent_name: agent.name,
    tick,
    operator,
    current_pos: { ...agent.pos },
    health: { hp: agent.hp, max_hp: agent.maxHp },
    atq: agent.atq,
    inventory: {
      wood: agent.inventory.wood,
      meat: agent.inventory.meat,
      weapons: agent.inventory.weapons,
    },
    nearby_entities: {
      bugs: obsBugs,
      weapons: obsWeapons,
      resources: obsResources.slice(0, 12),
      npcs: obsNpcs,
    },
  };
}
