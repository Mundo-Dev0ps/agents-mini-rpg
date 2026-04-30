export type CharacterClass = "mage" | "tech" | "wolf" | "scout" | "flyer";

export type Ability =
  | "remote_patch"
  | "turbo_deploy"
  | "log_sniffer"
  | "bypass";

export type AuraColor =
  | "magenta"
  | "cyan"
  | "yellow"
  | "green"
  | "blue"
  | "red";

export interface ClassSpec {
  icon: string;
  label: string;
  ability: Ability;
  abilityLabel: string;
  hpMult: number;
  atqMult: number;
  defStat: number;
  spdStat: number;
  cooldown: number;
  range: number;
  blurb: string;
  auraColor: AuraColor;
}

export const CLASS_SPECS: Record<CharacterClass, ClassSpec> = {
  mage: {
    icon: "🧙",
    label: "Mage",
    ability: "remote_patch",
    abilityLabel: "Remote Patch",
    hpMult: 0.8,
    atqMult: 1.4,
    defStat: 5,
    spdStat: 8,
    cooldown: 8,
    range: 2,
    blurb: "ranged 2-tile attack — carnivore 🥩",
    auraColor: "magenta",
  },
  tech: {
    icon: "🤖",
    label: "Tech",
    ability: "turbo_deploy",
    abilityLabel: "Turbo-Deploy",
    hpMult: 1.0,
    atqMult: 1.0,
    defStat: 15,
    spdStat: 6,
    cooldown: 0,
    range: 0,
    blurb: "x2 speed when BUSY — eats 🔋",
    auraColor: "cyan",
  },
  wolf: {
    icon: "🐺",
    label: "Wolf",
    ability: "log_sniffer",
    abilityLabel: "Pack Hunt",
    hpMult: 1.05,
    atqMult: 1.1,
    defStat: 10,
    spdStat: 9,
    cooldown: 12,
    range: 8,
    blurb: "carnivore — eats 🥩 only",
    auraColor: "yellow",
  },
  scout: {
    icon: "🧝",
    label: "Scout",
    ability: "bypass",
    abilityLabel: "Bypass",
    hpMult: 0.9,
    atqMult: 0.9,
    defStat: 2,
    spdStat: 14,
    cooldown: 0,
    range: 0,
    blurb: "agile — high dodge",
    auraColor: "green",
  },
  flyer: {
    icon: "🧚",
    label: "Flyer",
    ability: "bypass",
    abilityLabel: "Bypass",
    hpMult: 1.4,
    atqMult: 1.0,
    defStat: 10,
    spdStat: 13,
    cooldown: 0,
    range: 0,
    blurb: "flies over obstacles — high dodge",
    auraColor: "blue",
  },
};

export const ALL_CLASSES: CharacterClass[] = [
  "mage",
  "tech",
  "wolf",
  "scout",
  "flyer",
];

const ALIASES: Record<string, CharacterClass> = {
  mage: "mage",
  mage_m: "mage",
  mage_f: "mage",
  wizard: "mage",
  tech: "tech",
  tech_m: "tech",
  tech_f: "tech",
  engineer: "tech",
  wolf: "wolf",
  pet: "wolf",
  dog: "wolf",
  cat: "wolf",
  hound: "wolf",
  lynx: "wolf",
  scout: "scout",
  rabbit: "scout",
  flyer: "flyer",
};

export function parseClass(raw: string | undefined): CharacterClass | null {
  if (!raw) return null;
  return ALIASES[raw.toLowerCase().trim()] ?? null;
}

export function randomClass(rand: () => number = Math.random): CharacterClass {
  return ALL_CLASSES[Math.floor(rand() * ALL_CLASSES.length)];
}

export function canBypass(cls: CharacterClass): boolean {
  return CLASS_SPECS[cls].ability === "bypass";
}

export function canTurbo(cls: CharacterClass): boolean {
  return CLASS_SPECS[cls].ability === "turbo_deploy";
}

export type CategoryKey = "M" | "T" | "P" | "B" | "N";

const CATEGORY_MAP: Record<CategoryKey, CharacterClass> = {
  M: "mage",
  T: "tech",
  P: "wolf",
  B: "scout",
  N: "flyer",
};

export function classFromCategory(k: CategoryKey): CharacterClass {
  return CATEGORY_MAP[k] ?? "tech";
}

const FOOD_BY_CLASS: Record<CharacterClass, string[]> = {
  mage: ["M", "E"],
  tech: ["M", "E"],
  wolf: ["M", "E"],
  scout: ["M", "E"],
  flyer: ["M", "E"],
};

export function canEat(cls: CharacterClass, tile: string): boolean {
  return FOOD_BY_CLASS[cls].includes(tile);
}

export function dietRefusal(cls: CharacterClass, name: string): string {
  if (cls === "scout") return `Not food for Scout, ${name}!`;
  if (cls === "flyer") return `Light food only, ${name}!`;
  if (cls === "tech") return `Needs batteries 🔋, ${name}!`;
  if (cls === "mage") return `Meat only 🥩, ${name}!`;
  if (cls === "wolf") return `Meat only, ${name}!`;
  return `Cannot eat that, ${name}!`;
}
