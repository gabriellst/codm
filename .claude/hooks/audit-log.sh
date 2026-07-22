#!/bin/bash
# Audit Log Hook
#
# Appends every Claude Code hook event to .claude/audit/<date>__<session>.jsonl
# (one JSONL file per session_id). Must be silent and fast — never blocks the
# tool call, never prints to stdout (which Claude Code would treat as output).
#
# Wired in .claude/settings.json for: UserPromptSubmit, PreToolUse,
# PostToolUse, SubagentStop, Stop, SessionStart.
#
# Schema per line:
#   { timestamp, pid, session_id, hook_event_name, tool_name, tool_input,
#     tool_response, transcript_path, cwd, ... } — passthrough + enrichment.
#
# Parent/child session linkage is NOT enriched here (kept fast).
# `bun cli audit --tree` reconstructs the parent->subagent chain post-hoc
# by parsing the transcripts referenced in each line's `transcript_path`.

set -e

INPUT=$(cat)

LOG_DIR="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/audit"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
DATE=$(date -u +%Y-%m-%d)
LOG_FILE="$LOG_DIR/${DATE}__${SESSION_ID}.jsonl"

# %3N is GNU date; fall back to second precision on systems without it.
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

echo "$INPUT" | jq -c \
  --arg ts "$TIMESTAMP" \
  --arg pid "$$" \
  '. + {timestamp: $ts, pid: $pid}' >> "$LOG_FILE" 2>/dev/null || true

exit 0
