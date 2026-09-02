# Codex `exec --json` event schema — VENDOR-DOCUMENTED (not measured)

Source: https://learn.chatgpt.com/docs/non-interactive-mode
(reached via https://developers.openai.com/codex/noninteractive → 308)
Fetched: 2026-08-27. CLI under test: codex-cli 0.150.0.

PROVENANCE WARNING: everything in this file is DOCUMENTED, not measured against the
binary. Only the subset in `s1-text.jsonl` (thread.started / turn.started / error /
turn.failed / item.completed[type=error]) is measured. Anything else must be marked
UNFALSIFIED in the runner's docblocks until a live successful turn is captured.

## Event types
thread.started | turn.started | turn.completed | turn.failed
item.started | item.updated | item.completed | error

## thread.started
{ "type": "thread.started", "thread_id": "<uuid>" }
-> thread_id is the session id (claude equivalent: system/init `session_id`).

## turn.completed — carries usage
"usage": {
  "input_tokens":            number,
  "cached_input_tokens":     number,
  "output_tokens":           number,
  "reasoning_output_tokens": number
}

## item envelope
"item": { "id": string, "type": string, "status": string /* e.g. "in_progress" */ }

## item.type variants
agent_message      (text)
reasoning
command_execution  (command, status)
file_change
mcp_tool_call
web_search
todo_list
error              (message)   <- MEASURED in s1-text.jsonl

## Structured output
--output-schema <FILE>  : JSON Schema file; final response conforms to it.
-o/--output-last-message <FILE> : final message written to path.

## Resume
codex exec resume [SESSION_ID] [PROMPT]   (or --last)
