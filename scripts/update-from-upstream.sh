#!/usr/bin/env bash

set -euo pipefail

show_help() {
	cat <<'EOF'
Usage: scripts/update-from-upstream.sh

Safely update pi-lens master from upstream using fast-forward-only Git
operations, push the result to origin, then run npm ci to rebuild pi-lens.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
	show_help
	exit 0
fi

if [[ $# -ne 0 ]]; then
	show_help >&2
	exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel)"
current_branch="$(git -C "$repo_root" branch --show-current)"

if [[ "$current_branch" != "master" ]]; then
	printf 'Refusing update from branch %s; switch to master first.\n' \
		"$current_branch" >&2
	exit 1
fi

if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
	printf 'Refusing update: worktree must be clean.\n' >&2
	exit 1
fi

for remote in origin upstream; do
	if ! git -C "$repo_root" remote get-url "$remote" >/dev/null 2>&1; then
		printf 'Required Git remote is missing: %s\n' "$remote" >&2
		exit 1
	fi
done

if ! command -v sfw >/dev/null 2>&1; then
	printf 'Socket Firewall (sfw) is required before running npm ci.\n' >&2
	exit 1
fi

printf 'Fetching origin/master...\n'
git -C "$repo_root" fetch --prune origin master

printf 'Fetching upstream/master...\n'
git -C "$repo_root" fetch --prune upstream master

printf 'Fast-forwarding local master...\n'
git -C "$repo_root" merge --ff-only origin/master
git -C "$repo_root" merge --ff-only upstream/master

printf 'Pushing master to origin...\n'
git -C "$repo_root" push origin master

printf 'Installing exact dependencies and rebuilding pi-lens...\n'
(
	cd "$repo_root"
	sfw npm ci
)

printf 'pi-lens is up to date. Restart active Pi sessions to load the build.\n'
