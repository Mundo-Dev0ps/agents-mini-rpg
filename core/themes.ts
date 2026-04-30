import { CharacterClass, CLASS_SPECS } from "./avatars";

export type GameMode = "adventure" | "bugs";

export interface ThemeAvatar {
  key: CharacterClass;
  icon: string;
  label: string;
  blurb: string;
  abilityLabel: string;
}

export interface ThemeHud {
  primaryLabel: string;
  primaryIcon: string;
  secondaryLabel: string;
  secondaryIcon: string;
}

export interface Theme {
  mode: GameMode;
  label: string;
  blurb: string;
  enemyIcons: { l1: string; l2: string; l3: string };
  enemyVariants: { l1: string[]; l2: string[]; l3: string[] };
  bossIcons: { l1: string; l2: string; l3: string };
  bossVariants: string[];
  enemyNames: string[];
  treeVariants: string[];
  rockTile: string;
  woodTile: string;
  brickTile: string;
  npcIcon: string;
  displayAvatars: ThemeAvatar[];
  hud: ThemeHud;
}

const ADVENTURE_NAMES = [
  "WildWolf",
  "ForestSnake",
  "VineCreeper",
  "ShadowBeast",
  "MossOgre",
  "ThornHound",
  "RootGolem",
  "FrostLynx",
];

const BUGS_NAMES = [
  "TimeoutError",
  "404_NotFound",
  "NullPointerException",
  "RaceCondition",
  "MemoryLeak",
  "StackOverflow",
  "TypeError",
  "DeadlockBug",
  "OffByOneError",
  "InfiniteLoop",
  "UnhandledRejection",
  "SegFault",
];

export const THEMES: Record<GameMode, Theme> = {
  adventure: {
    mode: "adventure",
    label: "Agent Adventure",
    blurb: "Fantasy Forest",
    enemyIcons: { l1: "🐺", l2: "🐻", l3: "🦍" },
    enemyVariants: {
      l1: ["🐺", "🐯"],
      l2: ["🐻", "🦍"],
      l3: ["🦏", "🐃"],
    },
    bossIcons: { l1: "🦣", l2: "🦖", l3: "🦏" },
    bossVariants: ["🐗", "🦏", "🦣", "🦖", "🐲"],
    enemyNames: ADVENTURE_NAMES,
    treeVariants: ["🌲", "🌲", "🌲"],
    rockTile: "🪨",
    woodTile: "🪵",
    brickTile: "🧱",
    npcIcon: "👴",
    displayAvatars: [
      {
        key: "scout",
        icon: "🧝",
        label: "Elf",
        blurb: "agile archer — high dodge",
        abilityLabel: "Elven Leap",
      },
      {
        key: "mage",
        icon: "🧙",
        label: "Wizard",
        blurb: "spellcaster — arcane damage",
        abilityLabel: "Arcane Spell",
      },
      {
        key: "flyer",
        icon: "🧚",
        label: "Fairy",
        blurb: "flies over all — healer",
        abilityLabel: "Magic Flight",
      },
      {
        key: "wolf",
        icon: "🛡️ ",
        label: "Knight",
        blurb: "robust carnivore — high HP",
        abilityLabel: "Heroic Charge",
      },
    ],
    hud: {
      primaryLabel: "Hunger",
      primaryIcon: "🥩 ",
      secondaryLabel: "Mana",
      secondaryIcon: "🍃 ",
    },
  },
  bugs: {
    mode: "bugs",
    label: "Agents vs Bugs",
    blurb: "Cyber Tech",
    enemyIcons: { l1: "🐛", l2: "👾", l3: "🕷️ " },
    enemyVariants: {
      l1: ["🐛", "🐜"],
      l2: ["👾", "🦂"],
      l3: ["🕷️ ", "🦠"],
    },
    bossIcons: { l1: "🤖", l2: "👹", l3: "💀" },
    bossVariants: ["🦟", "🐉", "🤖", "👹", "💀"],
    enemyNames: BUGS_NAMES,
    treeVariants: ["🧱", "🧱", "🧱"],
    rockTile: "🧱",
    woodTile: "🔩",
    brickTile: "🧱",
    npcIcon: "📚",
    displayAvatars: [
      {
        key: "tech",
        icon: "🤖 ",
        label: "Robot",
        blurb: "x2 speed when BUSY",
        abilityLabel: "Turbo-Deploy",
      },
      {
        key: "flyer",
        icon: "🛰️ ",
        label: "Drone",
        blurb: "flies — high dodge",
        abilityLabel: "Bypass",
      },
      {
        key: "scout",
        icon: "🛡️ ",
        label: "Firewall",
        blurb: "blocks bypass",
        abilityLabel: "Block Packet",
      },
      {
        key: "mage",
        icon: "🔧",
        label: "Debugger",
        blurb: "remote patch — high ATQ",
        abilityLabel: "Remote Patch",
      },
    ],
    hud: {
      primaryLabel: "Battery",
      primaryIcon: "🔋 ",
      secondaryLabel: "CPU Heat",
      secondaryIcon: "🔥 ",
    },
  },
};

export function themeFor(mode: GameMode): Theme {
  return THEMES[mode];
}

export function themedIconFor(
  cls: CharacterClass,
  theme: Theme | null
): string | null {
  if (!theme) return null;
  const av = theme.displayAvatars.find((a) => a.key === cls);
  return av ? av.icon : null;
}

export function themedLabel(cls: CharacterClass, theme?: Theme): string {
  if (theme) {
    const av = theme.displayAvatars.find((a) => a.key === cls);
    if (av) return av.label;
  }
  return CLASS_SPECS[cls].label;
}
