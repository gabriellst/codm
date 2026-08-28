#!/usr/bin/env bash
# Codex CLI measurement smokes. Driven against a LOCAL model (--oss/ollama) so the
# CLI's event grammar is measured without consuming ChatGPT quota. The grammar is
# emitted by the CLI, not the model.
WS="$(cd "$(dirname "$0")" && pwd)"
OUT="C:/Users/detup/Desktop/CoDM/.specs/codedm/codex-smoke/raw"
M="${CODEX_SMOKE_MODEL:-qwen3:4b}"
BASE=(codex exec --json --oss --local-provider ollama -m "$M" --skip-git-repo-check -C "$WS")

run() { # run <name> <timeout> <args...>
  local name="$1"; shift
  local secs="$1"; shift
  echo "--- $name ---"
  timeout "$secs" "$@" < /dev/null > "$OUT/$name.jsonl" 2> "$OUT/$name.stderr.txt"
  echo "$name exit=$?  stdout_lines=$(wc -l < "$OUT/$name.jsonl")"
}

# s1 — plain text turn: turn.completed + real usage shape
run s1-text 300 "${BASE[@]}" -s read-only "Reply with exactly the word PONG and nothing else."

# s2 — tool call: item.started/updated/completed triple, command_execution
run s2-tool 420 "${BASE[@]}" -s read-only "Read the file hello.txt in the current directory and tell me the magic word it contains. You must actually read the file."

# s3 — structured output via --output-schema
run s3-schema 300 "${BASE[@]}" -s read-only --output-schema "$WS/out-schema.json" -o "$WS/s3-last.txt" \
  "The user wrote: 'the login button is broken'. Classify it."

# s4 — resume: does thread_id persist across exec resume?
SID=$(grep -m1 -o '"thread_id":"[^"]*"' "$OUT/s1-text.jsonl" | cut -d'"' -f4)
echo "resume target thread_id=$SID"
if [ -n "$SID" ]; then
  run s4-resume 300 codex exec resume "$SID" --json --oss --local-provider ollama -m "$M" \
    --skip-git-repo-check -C "$WS" -s read-only "What word did you just say? Repeat it."
else
  echo "s4-resume SKIPPED: no thread_id captured from s1"
fi

# s5 — MCP injected per-run via inline TOML override (no ~/.codex/config.toml edit)
run s5-mcp 300 "${BASE[@]}" -s read-only \
  -c "mcp_servers.codmsmoke.command=\"node\"" \
  -c "mcp_servers.codmsmoke.args=[\"$WS/fake-mcp.js\",\"--probe\"]" \
  -c "mcp_servers.codmsmoke.env={CODM_RUN_TOKEN=\"tok-abc123\"}" \
  "Say OK."

echo "=== DONE ==="
ls -la "$OUT"
