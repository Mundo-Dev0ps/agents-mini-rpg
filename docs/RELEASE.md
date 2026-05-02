# Release Process & Contributing

← [Back to README](../README.md)

## CI pipeline

Runs on every push and pull request via `.github/workflows/ci.yml`:

- TypeScript type check (`tsc --noEmit`)
- Build (`tsc`)
- Matrix: Ubuntu + macOS × Node 20 + Node 22

---

## Publishing to npm

Publishing is **tag-driven** via `.github/workflows/publish.yml`.

```bash
# 1. Bump version
npm version patch       # or minor / major

# 2. Push commit + tag
git push --follow-tags
```

On tag push matching `v*.*.*` the workflow:
1. Verifies tag matches `package.json` version
2. Runs typecheck + build
3. Publishes to npm with `--provenance`
4. Creates a GitHub Release with auto-generated notes

### One-time setup

1. Replace `OWNER` placeholder in `package.json` → `repository`, `homepage`, `bugs` URLs
2. Generate an npm automation token at <https://www.npmjs.com/settings/~/tokens>
3. Add it to GitHub repo secrets: **Settings → Secrets and variables → Actions → `NPM_TOKEN`**
4. Optional: link repo to npm package for OIDC provenance — see [npm docs](https://docs.npmjs.com/generating-provenance-statements)

---

## Contributing

PRs welcome. Before submitting:

```bash
npm test && npm run typecheck
```

### Guidelines

- **Emoji tile widths**: most layout issues come from mixing 1-cell and 2-cell emoji in the same grid row. Verify visually after tile changes.
- **No dead code**: if a stat or tile has no gameplay effect, remove it rather than leaving it wired up but ignored.
- **No backwards-compat shims**: delete cleanly. No `// removed` comments, no dead aliases.
- **No full-screen clears** in the renderer main loop — keep the per-cell CHA pattern.
- **TypeScript strict mode**: no `any`, no `@ts-ignore` without a comment explaining why.

### Adding a new AI agent

1. Add a name matcher in `ProcessMonitor` (looks for process names containing `claude` today)
2. Write hook scripts that append events to `~/.agent_rpg_queue.ndjson` in the same NDJSON format
3. Optionally add a label entry for the HUD

### Adding a character class

1. Add spec to `CLASS_SPECS` in `core/avatars.ts`
2. Add theme entries in both `THEMES.adventure.displayAvatars` and `THEMES.bugs.displayAvatars`
3. Wire ability logic in `core/game.ts` → `useAbility()`
4. Add tests in `tests/abilities.test.ts`
