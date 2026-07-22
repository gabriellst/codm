#!/bin/bash
# Parse registry.yaml from a skill directory
# Extracts checklist IDs and bad_practices for structured review output.
#
# Usage: parse-registry.sh <skill-path>
#   where skill-path is the SKILL.md path (registry.yaml is resolved as sibling)
# Output: JSON with checklist_ids and bad_practices arrays

SKILL_PATH="$1"
if [[ -z "$SKILL_PATH" ]]; then
  echo '{"checklist_ids":[],"bad_practices":[]}'
  exit 0
fi

# Resolve registry.yaml as sibling of SKILL.md
SKILL_DIR=$(dirname "$SKILL_PATH")
REGISTRY_PATH="${SKILL_DIR}/registry.yaml"

if [[ ! -f "$REGISTRY_PATH" ]]; then
  echo '{"checklist_ids":[],"bad_practices":[]}'
  exit 0
fi

REGISTRY=$(cat "$REGISTRY_PATH")

# Extract pattern IDs (lines matching "id: XXX-NN" or "id: XXX-CNN")
CHECKLIST_IDS=$(echo "$REGISTRY" | grep -oE 'id: [A-Z]+-C?[0-9]+' | sed 's/id: //' | tr '\n' ',' | sed 's/,$//')

# Extract bad_practices array (line matching "bad_practices: [BP-...]")
BAD_PRACTICES=$(echo "$REGISTRY" | grep -oE 'bad_practices: \[.*\]' | sed 's/bad_practices: \[//' | sed 's/\]//' | tr -d ' ')

# Build JSON output — handle empty values
format_json_array() {
  local input="$1"
  if [[ -z "$input" ]]; then
    echo "[]"
  else
    echo "[$(echo "$input" | sed 's/\([^,]*\)/"\1"/g')]"
  fi
}

CHECKLIST_JSON=$(format_json_array "$CHECKLIST_IDS")
BPS_JSON=$(format_json_array "$BAD_PRACTICES")

echo "{\"checklist_ids\":${CHECKLIST_JSON},\"bad_practices\":${BPS_JSON}}"
