#!/bin/bash
# Interactive prompt for sensitive-guard findings
# Shows findings to stderr, reads actions from stdin
# Returns JSON array of {index, action} pairs

sg_format_findings_display() {
  local findings_json="$1"
  local max_preview="${2:-12}"

  local count
  count=$(echo "$findings_json" | jq 'length')

  local files
  files=$(echo "$findings_json" | jq -r '[.[].file] | unique | join(", ")')

  local output=""
  output+="$(printf '\n  \033[1;33m⚠ sensitive-guard: %d finding(s) in %s\033[0m\n\n' "$count" "$files")"

  local i=0
  while IFS= read -r finding; do
    i=$((i + 1))
    local type value line
    type=$(echo "$finding" | jq -r '.type')
    value=$(echo "$finding" | jq -r '.value')
    line=$(echo "$finding" | jq -r '.line')

    local preview
    preview=$(sg_truncate_value "$value" "$max_preview")

    output+="$(printf '  %d. [%s] %s  (line %s)\n' "$i" "$type" "$preview" "$line")"
  done < <(echo "$findings_json" | jq -c '.[]')

  echo "$output"
}

sg_collect_actions() {
  local findings_json="$1"
  local max_preview="${2:-12}"

  local count
  count=$(echo "$findings_json" | jq 'length')

  # Non-interactive (stdin not a TTY): block all
  if [[ ! -t 0 ]]; then
    local actions="[]"
    for ((i=0; i<count; i++)); do
      actions=$(echo "$actions" | jq --argjson idx "$i" '. + [{"index": $idx, "action": "block"}]')
    done
    echo "$actions"
    return
  fi

  # Show findings
  sg_format_findings_display "$findings_json" "$max_preview" >&2

  echo "" >&2
  echo "  Action per item: [p]ass once  [a]llow project  [g]lobal allow  [b]lock" >&2

  local actions="[]"
  for ((i=0; i<count; i++)); do
    local idx=$((i + 1))
    local action=""
    while [[ -z "$action" ]]; do
      printf '  (%d): ' "$idx" >&2
      read -r input
      case "${input,,}" in
        p) action="pass" ;;
        a) action="allow_project" ;;
        g) action="allow_global" ;;
        b) action="block" ;;
        *) echo "  Invalid choice. Use p/a/g/b" >&2 ;;
      esac
    done
    actions=$(echo "$actions" | jq --argjson idx "$i" --arg act "$action" \
      '. + [{"index": $idx, "action": $act}]')
  done

  echo "$actions"
}
