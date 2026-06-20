#!/usr/bin/env bash
# Fast local re-run — defaults here; override via .envrc.local or env vars
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DEFAULT_INPUT="samples/10s.mp4"
DEFAULT_OUTPUT="outputs/fight.mp4"
DEFAULT_PLAYER1="TODYSH"
DEFAULT_PLAYER2="MAX-AZ"
DEFAULT_STYLE="arcade_fight"

_resolve_input() {
  if [[ -n "${INPUT:-}" && -f "$INPUT" ]]; then
    echo "$INPUT"
    return 0
  fi

  if [[ -n "${INPUT:-}" && ! -f "$INPUT" ]]; then
    echo "Note: INPUT=$INPUT not found (check .envrc / .envrc.local); trying fallbacks…" >&2
  fi

  for candidate in "$DEFAULT_INPUT" samples/*.mp4 samples/*.{MP4,mov,MOV}; do
    [[ -f "$candidate" ]] || continue
    echo "$candidate"
    return 0
  done

  return 1
}

if ! INPUT="$(_resolve_input)"; then
  echo "No input video found." >&2
  echo "  Put a clip in samples/ (e.g. samples/10s.mp4) or run:" >&2
  echo "  INPUT=path/to/video.mp4 ./run.sh" >&2
  exit 1
fi

OUTPUT="${OUTPUT:-$DEFAULT_OUTPUT}"
PLAYER1="${PLAYER1:-$DEFAULT_PLAYER1}"
PLAYER2="${PLAYER2:-$DEFAULT_PLAYER2}"
STYLE="${STYLE:-$DEFAULT_STYLE}"

mkdir -p "$(dirname "$OUTPUT")"

args=(
  tt-overlay process
  --input "$INPUT"
  --output "$OUTPUT"
  --player1 "$PLAYER1"
  --player2 "$PLAYER2"
  --style "$STYLE"
)

if [[ -n "${LAYOUT:-}" ]]; then
  args+=(--layout "$LAYOUT")
fi

if [[ -n "${HIT_TIMES:-}" ]]; then
  args+=(--hit-times "$HIT_TIMES")
fi

if [[ "${AUTO_HIT_SFX:-}" == "1" || "${AUTO_HIT_SFX:-}" == "true" ]]; then
  args+=(--auto-hit-sfx)
fi

echo "→ ${args[*]} $*"
exec uv run "${args[@]}" "$@"
