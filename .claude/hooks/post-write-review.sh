#!/bin/bash
# Post-Write Review Hook
# Filters written files and signals Claude to run bun scripts/review.ts on them.
# All classification, checklist compilation, and form context loading is handled by review.ts.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then exit 0; fi

# Only review TypeScript/React files
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Skip tests, generated files, stories
BASENAME=$(basename "$FILE_PATH")
case "$BASENAME" in
  *.gen.ts|*.gen.tsx|*.test.ts|*.spec.ts|*.stories.tsx) exit 0 ;;
esac

# Skip backend barrel exports (index.ts), but keep frontend index.tsx (they ARE the components)
if [[ "$BASENAME" == "index.ts" ]]; then
  exit 0
fi

# Skip non-project files
case "$FILE_PATH" in
  */node_modules/*|*/dist/*|*/sdk/*|*/.claude/*) exit 0 ;;
esac

# Check if review.ts can classify this file (skip unclassified files)
case "$FILE_PATH" in
  */shared/db/drizzle/schema/*.ts) ;;
  */ui/controllers/*.ts) ;;
  */ui/usecases/*.ts) ;;
  */controllers/*.ts) ;;
  */objects/*.ts) ;;
  */entities/*.ts) ;;
  */usecases/*.ts) ;;
  */repositories/*.ts) ;;
  */errors/*.ts) ;;
  */services/*.ts) ;;
  */events/*.ts) ;;
  */handlers/*.ts) ;;
  */schemas/*.ts) ;;
  */enums/*.ts) ;;
  */-forms/*.tsx|*/-forms/*.ts) ;;
  */-stores/*.ts|*/stores/*.ts) ;;
  */components/ui/*.tsx) ;;
  */-components/*.tsx|*/components/*.tsx) ;;
  */routes/*.tsx) ;;
  *) exit 0 ;;
esac

# Signal Claude to run review.ts on this file
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "[POST-WRITE-REVIEW] file=${FILE_PATH}"
  }
}
EOF
