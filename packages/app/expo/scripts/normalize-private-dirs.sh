#!/usr/bin/env bash
# Normalize colocated private directories under `app/` to the SKILL
# convention: hyphen-prefixed (`-components/`, `-stores/`, `-hooks/`).
#
# Renames any `_components/`, `_stores/`, `_hooks/` folder back to its
# hyphen-prefixed twin and rewrites every import that references the
# underscore form. Idempotent — re-running on a clean tree exits cleanly.
#
# The custom `_ctx.js` excludes both prefixes from the Expo Router scan,
# so this is purely about staying consistent with the documented SKILL
# pattern. Macros depend on BSD `sed` (default on macOS); a small wrapper
# falls back to GNU `sed` when run on Linux/CI.
#
# Usage:  bun x ./scripts/normalize-private-dirs.sh
#         (or any direct invocation — script resolves the expo workspace
#          root from its own location)

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
EXPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

cd "$EXPO_ROOT"

if [[ ! -d app ]]; then
	echo "error: expected app/ at $EXPO_ROOT" >&2
	exit 1
fi

sed_inplace() {
	if [[ "$(uname)" == "Darwin" ]]; then
		sed -i '' "$@"
	else
		sed -i "$@"
	fi
}

# 1. Rename underscore-prefixed colocated directories.
renamed=0
while IFS= read -r -d '' dir; do
	parent=$(dirname "$dir")
	base=$(basename "$dir")
	target="$parent/-${base#_}"
	if [[ -e "$target" ]]; then
		echo "skip: $dir → $target (target already exists)" >&2
		continue
	fi
	mv "$dir" "$target"
	echo "renamed: $dir → $target"
	renamed=$((renamed + 1))
done < <(find app -type d \( -name "_components" -o -name "_stores" -o -name "_hooks" \) -print0)

if [[ $renamed -eq 0 ]]; then
	echo "✓ no underscore-prefixed colocated directories under app/"
fi

# 2. Patch imports inside source files. Replaces `/_components`, `/_stores`,
#    `/_hooks` segments anywhere in an import path string. The leading `/`
#    in the pattern protects bare identifiers like `_layout`.
patched=0
while IFS= read -r -d '' f; do
	sed_inplace -E 's#(/)_(components|stores|hooks)#\1-\2#g' "$f"
	echo "patched: $f"
	patched=$((patched + 1))
done < <(grep -rlZ "from ['\"][^'\"]*_\(components\|stores\|hooks\)" app components lib 2>/dev/null || true)

if [[ $patched -eq 0 ]]; then
	echo "✓ no imports referencing _components/_stores/_hooks paths"
fi

# 3. Verify a clean tree. Subshell wrappers neutralize `grep`'s exit-1 on
#    no-match so `pipefail` doesn't sink the script.
echo
echo "--- verification ---"
remaining_dirs=$( (find app -type d \( -name "_components" -o -name "_stores" -o -name "_hooks" \) 2>/dev/null || true) | wc -l | tr -d ' ')
remaining_imports=$( (grep -rln "from ['\"][^'\"]*_\(components\|stores\|hooks\)" app components lib 2>/dev/null || true) | wc -l | tr -d ' ')
echo "underscore dirs:    $remaining_dirs"
echo "underscore imports: $remaining_imports"

if [[ "$remaining_dirs" != "0" || "$remaining_imports" != "0" ]]; then
	echo "✗ residue remains" >&2
	exit 1
fi

echo "✓ all clean"
