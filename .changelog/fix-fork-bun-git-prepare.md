---
section: Fixed
audience: user
---

- **Git installs preserve npm as the distribution build runner.** Bun rewrites a bare `npm run` lifecycle command to `bun run`, which leaves `npm_execpath` pointing at Bun while the distribution builders require npm for their locked-tool fallback. Pass npm its normal notice log level explicitly so Bun invokes npm directly. Runtime behavior and locked dependency versions are unchanged.
