import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/update-from-upstream.sh");

describe("update-from-upstream.sh", () => {
	it("documents the safe update workflow without changing the repository", () => {
		const result = spawnSync("bash", [SCRIPT, "--help"], {
			cwd: path.resolve("."),
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("fast-forward");
		expect(result.stdout).toContain("npm ci");
	});

	it("refuses to update from a branch other than master", () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-update-"));
		const script = path.join(repo, "scripts", "update-from-upstream.sh");
		fs.mkdirSync(path.dirname(script));
		fs.copyFileSync(SCRIPT, script);
		execFileSync("git", ["init", "-q", "-b", "master"], { cwd: repo });
		execFileSync("git", ["config", "user.email", "test@example.com"], {
			cwd: repo,
		});
		execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
		fs.writeFileSync(path.join(repo, "README.md"), "fixture\n");
		execFileSync("git", ["add", "README.md"], { cwd: repo });
		execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: repo });
		execFileSync("git", ["switch", "-q", "-c", "feature/test"], {
			cwd: repo,
		});

		const result = spawnSync("bash", [script], { cwd: repo, encoding: "utf8" });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("feature/test");
		expect(result.stderr).toContain("master");
	});

	it("refuses to update a dirty master worktree", () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-update-"));
		const script = path.join(repo, "scripts", "update-from-upstream.sh");
		fs.mkdirSync(path.dirname(script));
		fs.copyFileSync(SCRIPT, script);
		execFileSync("git", ["init", "-q", "-b", "master"], { cwd: repo });
		execFileSync("git", ["config", "user.email", "test@example.com"], {
			cwd: repo,
		});
		execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
		fs.writeFileSync(path.join(repo, "README.md"), "fixture\n");
		execFileSync("git", ["add", "."], { cwd: repo });
		execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: repo });
		fs.writeFileSync(path.join(repo, "README.md"), "dirty\n");

		const result = spawnSync("bash", [script], { cwd: repo, encoding: "utf8" });

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("worktree");
		expect(result.stderr).toContain("clean");
	});

	it("fast-forwards master, pushes origin, and rebuilds through npm ci", () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-update-flow-"));
		const upstream = path.join(base, "upstream.git");
		const origin = path.join(base, "origin.git");
		const seed = path.join(base, "seed");
		const checkout = path.join(base, "checkout");
		const binDir = path.join(base, "bin");
		fs.mkdirSync(binDir);
		fs.writeFileSync(
			path.join(binDir, "sfw"),
			"#!/usr/bin/env bash\nexec \"$@\"\n",
			{ mode: 0o755 },
		);
		execFileSync("git", ["init", "-q", "--bare", upstream]);
		execFileSync("git", ["init", "-q", "--bare", origin]);
		fs.mkdirSync(seed);
		execFileSync("git", ["init", "-q", "-b", "master"], { cwd: seed });
		execFileSync("git", ["config", "user.email", "test@example.com"], {
			cwd: seed,
		});
		execFileSync("git", ["config", "user.name", "Test"], { cwd: seed });
		fs.mkdirSync(path.join(seed, "scripts"));
		fs.copyFileSync(SCRIPT, path.join(seed, "scripts", "update-from-upstream.sh"));
		fs.writeFileSync(
			path.join(seed, "package.json"),
			`${JSON.stringify(
				{
					name: "update-fixture",
					version: "1.0.0",
					scripts: {
						prepare:
							"node -e \"require('node:fs').writeFileSync('rebuilt.txt','ok')\"",
					},
				},
				null,
				2,
			)}\n`,
		);
		fs.writeFileSync(
			path.join(seed, "package-lock.json"),
			`${JSON.stringify(
				{
					name: "update-fixture",
					version: "1.0.0",
					lockfileVersion: 3,
					requires: true,
					packages: { "": { name: "update-fixture", version: "1.0.0" } },
				},
				null,
				2,
			)}\n`,
		);
		fs.writeFileSync(path.join(seed, "version.txt"), "one\n");
		execFileSync("git", ["add", "."], { cwd: seed });
		execFileSync("git", ["commit", "-q", "-m", "initial"], { cwd: seed });
		execFileSync("git", ["remote", "add", "upstream", upstream], { cwd: seed });
		execFileSync("git", ["remote", "add", "origin", origin], { cwd: seed });
		execFileSync("git", ["push", "-q", "upstream", "master"], { cwd: seed });
		execFileSync("git", ["push", "-q", "origin", "master"], { cwd: seed });
		execFileSync("git", ["clone", "-q", origin, checkout]);
		execFileSync("git", ["remote", "add", "upstream", upstream], {
			cwd: checkout,
		});
		fs.writeFileSync(path.join(seed, "version.txt"), "two\n");
		execFileSync("git", ["add", "version.txt"], { cwd: seed });
		execFileSync("git", ["commit", "-q", "-m", "upstream update"], {
			cwd: seed,
		});
		execFileSync("git", ["push", "-q", "upstream", "master"], { cwd: seed });
		const expectedHead = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: seed,
			encoding: "utf8",
		}).trim();

		const result = spawnSync("bash", ["scripts/update-from-upstream.sh"], {
			cwd: checkout,
			encoding: "utf8",
			env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
		});

		expect(result.status).toBe(0);
		expect(
			execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: checkout,
				encoding: "utf8",
			}).trim(),
		).toBe(expectedHead);
		expect(
			execFileSync("git", ["--git-dir", origin, "rev-parse", "master"], {
				encoding: "utf8",
			}).trim(),
		).toBe(expectedHead);
		expect(fs.readFileSync(path.join(checkout, "rebuilt.txt"), "utf8")).toBe(
			"ok",
		);
	});
});
