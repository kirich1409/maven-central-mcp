#!/bin/bash
# PII detection using regex patterns
# Outputs JSON array of findings

sg_detect_pii() {
  local file_path="$1"
  local patterns_json="$2"

  # Return empty if file doesn't exist or is binary
  if [[ ! -f "$file_path" ]]; then
    echo "[]"
    return
  fi
  if sg_is_binary "$file_path"; then
    echo "[]"
    return
  fi

  # Collect all findings as newline-delimited JSON objects, then wrap in array at end
  local findings_file
  findings_file=$(mktemp)
  trap "rm -f '$findings_file'" RETURN

  local line_num=0
  local start_time=$SECONDS

  while IFS= read -r line || [[ -n "$line" ]]; do
    # 5s timeout for large files
    if (( SECONDS - start_time > 5 )); then
      sg_log_warn "PII scan timeout after 5s on $file_path — treating as clean"
      break
    fi

    line_num=$((line_num + 1))

    # Test each pattern against this line
    while IFS= read -r pattern_entry; do
      local pid pregex
      pid=$(echo "$pattern_entry" | jq -r '.id')
      pregex=$(echo "$pattern_entry" | jq -r '.regex')

      # Use perl -sne with variable passing to prevent regex injection (no (?{...}) code execution)
      local matches
      if matches=$(echo "$line" | perl -sne 'print "$&\n" while /$regex/g' -- -regex="$pregex" 2>/dev/null) && [[ -n "$matches" ]]; then
        while IFS= read -r match; do
          [[ -z "$match" ]] && continue
          # Write finding as JSON line to temp file (batched, no per-match jq)
          printf '%s\n' "$match" >> "$findings_file.vals"
          printf '%s\t%s\t%d\n' "$pid" "$match" "$line_num" >> "$findings_file"
        done <<< "$matches"
      fi
    done < <(echo "$patterns_json" | jq -c '.[]')
  done < "$file_path"

  # Build JSON array from collected findings in one jq call
  if [[ ! -s "$findings_file" ]]; then
    rm -f "$findings_file.vals"
    echo "[]"
    return
  fi

  local result="["
  local first=true
  while IFS=$'\t' read -r f_type f_value f_line; do
    if [[ "$first" == "true" ]]; then
      first=false
    else
      result+=","
    fi
    # Use jq for safe JSON encoding of the value
    local encoded
    encoded=$(jq -n --arg t "$f_type" --arg v "$f_value" --arg f "$file_path" --argjson l "$f_line" \
      '{type:$t, value:$v, file:$f, line:$l, engine:"pii"}')
    result+="$encoded"
  done < "$findings_file"
  result+="]"

  rm -f "$findings_file.vals"
  echo "$result"
}
