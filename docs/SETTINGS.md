# Settings & CLI Flags

← [Back to README](../README.md)

## In-game settings overlay

Press `m` (or `Esc`) to open the settings panel. Navigate with `↑/↓`, confirm with `↵`.

| Option | Description |
|--------|-------------|
| 🔔 **Audio** | Toggle input-needed alert sound (ON / OFF) |
| 🔔 **Notifications** | Toggle OS desktop notifications when agent needs input (ON / OFF) |
| 🎨 **Color blind** | Switch to high-contrast white-only palette |
| 👁️ **Observer mode** | Hide player, camera follows top-CPU agent |
| 🌙 **Night mode** | Dim map, change border style, add star overlay |
| 🔁 **Restart game** | Reset round, world, and all agents |
| 🌐 **Change mode** | Switch Agents Aventure ↔ Agents vs Bugs |
| 🧝 **Change avatar** | Pick a different character class |

---

## System notifications

When a Claude agent is waiting for input, the game fires an OS desktop notification (outside the terminal). Throttled to one notification per agent every 10 seconds.

| Platform | Backend |
|----------|---------|
| macOS | `osascript display notification` |
| Linux | `notify-send` (requires `libnotify`) |
| Other | Silent fallback |

Toggle in-game via the settings overlay (`m` / `Esc` → **Notifications**) or with `s` for audio.

---

## CLI flags

```bash
agent-rpg [options]

Options:
  --mode=<adventure|bugs|a|b>          Skip mode menu
  --class=<name>                        Skip avatar menu
  --observer                            Start in spectator mode
  --pacifist                            Disable bug spawning
  --help=classes                        List available avatar classes and exit
```

### Avatar class names by mode

**Agents Aventure mode:**

| Flag value | Avatar |
|-----------|--------|
| `elf`, `scout` | 🧝 Elf |
| `wizard`, `mage` | 🧙 Wizard |
| `fairy`, `flyer` | 🧚 Fairy |
| `knight`, `wolf` | 🛡️ Knight |

**Bugs mode:**

| Flag value | Avatar |
|-----------|--------|
| `robot`, `tech` | 🤖 Robot |
| `drone`, `flyer` | 🛰️ Drone |
| `firewall`, `scout` | 🛡️ Firewall |
| `debugger`, `mage` | 🔧 Debugger |

### Environment variables

```bash
PLAYER_CLASS=wolf       # same values as --class
GAME_MODE=adventure     # same values as --mode
OBSERVER_MODE=1         # same as --observer
```

---

## Audio

Audio plays a system beep when an agent needs input (blinking 🚨 badge in HUD). No external audio files — uses the OS sound stack directly:

| Platform | Command tried |
|----------|--------------|
| Linux | `pw-play` → `paplay` → `aplay` (first found wins) |
| macOS | `afplay` |
| Other | Silent fallback |

Toggle in-game with `s` or via the settings overlay.
