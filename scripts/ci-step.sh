#!/usr/bin/env bash
# Runs a command, streams its output, and on failure republishes the most useful
# lines as GitHub annotations so failures are readable from the checks UI / API.
# Usage: scripts/ci-step.sh "<step name>" <command> [args...]
set -uo pipefail

name="$1"
shift
log="$(mktemp)"

"$@" 2>&1 | tee "$log"
status="${PIPESTATUS[0]}"

if [ "$status" -ne 0 ]; then
  clean="$(mktemp)"
  sed -E 's/\x1B\[[0-9;]*[A-Za-z]//g' "$log" | grep -v '^[[:space:]]*$' > "$clean"

  encode() {
    # Workflow-command escaping: %, CR, LF.
    awk 'BEGIN{ORS="%0A"} {gsub(/%/,"%25"); gsub(/\r/,"%0D"); print}'
  }

  errors="$(grep -E -i 'error|fail|✕|●|expected|received|cannot|not found|ERR_' "$clean" | head -n 60 | encode)"
  tail_lines="$(tail -n 40 "$clean" | encode)"

  if [ -n "$errors" ]; then
    echo "::error title=${name} (errors)::${errors}"
  fi
  echo "::error title=${name} (tail)::${tail_lines}"
fi

exit "$status"
