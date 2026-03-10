#!/bin/bash
# Shared utilities for sensitive-guard

sg_sha256() {
  local value="$1"
  # Trim leading/trailing whitespace
  value="$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  # Use shasum (macOS) or sha256sum (Linux)
  if command -v shasum &>/dev/null; then
    printf '%s' "$value" | shasum -a 256 | cut -d' ' -f1
  else
    printf '%s' "$value" | sha256sum | cut -d' ' -f1
  fi
}

sg_truncate_value() {
  local value="$1" max_preview="${2:-12}"
  local len=${#value}
  if [[ $len -le $((max_preview + 6)) ]]; then
    echo "$value"
  else
    local half=$((max_preview / 2))
    echo "${value:0:$half}...${value: -$half}"
  fi
}

sg_log_warn() {
  echo "[sensitive-guard] WARNING: $1" >&2
}

sg_log_error() {
  echo "[sensitive-guard] ERROR: $1" >&2
}

sg_is_file() {
  [[ -f "$1" ]]
}

sg_resolve_path() {
  local path="$1"
  # Expand ~ and known variables
  path="${path/#\~/$HOME}"
  path="${path//\$HOME/$HOME}"
  path="${path//\$PWD/$PWD}"
  # Resolve symlinks if file exists
  if [[ -e "$path" ]]; then
    if command -v realpath &>/dev/null; then
      path=$(realpath "$path")
    elif command -v readlink &>/dev/null; then
      path=$(readlink -f "$path" 2>/dev/null || echo "$path")
    fi
  fi
  echo "$path"
}

sg_is_binary() {
  local file_path="$1"
  # Quick check: if file contains null bytes, it's binary
  # Use od (octal dump) which is portable across macOS and Linux
  if od -An -tx1 "$file_path" 2>/dev/null | grep -q '00'; then
    return 0  # is binary
  fi
  return 1  # is text
}
