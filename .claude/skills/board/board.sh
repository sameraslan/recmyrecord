#!/usr/bin/env bash
# Read and move cards on the recmyrecord GitHub Projects board.
#
#   board.sh list [status]          cards, optionally only one column
#   board.sh add <number> [status]  put an issue or PR on the board (default: Backlog)
#   board.sh move <number> <status> move a card, adding it first if it is missing
#   board.sh remove <number>        take a card off the board (the issue or PR itself is untouched)
#
# <number> is the issue or PR number in sameraslan/recmyrecord.
# <status> is a column name, case-insensitive:
#   Backlog, Todo, "In progress", "Needs answer", "Final review", Done.
# Needs the gh token to have the `project` scope: gh auth refresh -s project
set -euo pipefail

OWNER="sameraslan"
REPO="sameraslan/recmyrecord"
TITLE="recmyrecord"

die() { echo "board: $*" >&2; exit 1; }

project_json() {
  gh project list --owner "$OWNER" --format json --limit 100 \
    -q ".projects[] | select(.title == \"$TITLE\")"
}

load_project() {
  local p
  p="$(project_json)" || die "could not list projects (missing the project scope?)"
  [ -n "$p" ] || die "no project titled '$TITLE' for $OWNER"
  NUM="$(jq -r .number <<<"$p")"
  PROJECT_ID="$(jq -r .id <<<"$p")"
}

# Sets FIELD_ID and OPTION_ID for the Status column named $1.
load_status() {
  local want fields
  want="$(tr '[:upper:]' '[:lower:]' <<<"$1")"
  fields="$(gh project field-list "$NUM" --owner "$OWNER" --format json)"
  FIELD_ID="$(jq -r '.fields[] | select(.name == "Status") | .id' <<<"$fields")"
  OPTION_ID="$(jq -r --arg w "$want" \
    '.fields[] | select(.name == "Status") | .options[] | select((.name | ascii_downcase) == $w) | .id' <<<"$fields")"
  [ -n "$OPTION_ID" ] || die "no Status column named '$1'"
}

items_json() {
  gh project item-list "$NUM" --owner "$OWNER" --format json --limit 500
}

item_id() {
  items_json | jq -r --argjson n "$1" '.items[] | select(.content.number == $n) | .id'
}

add_item() {
  local url
  url="$(gh issue view "$1" --repo "$REPO" --json url -q .url)"
  gh project item-add "$NUM" --owner "$OWNER" --url "$url" --format json -q .id
}

set_status() {
  gh project item-edit --id "$1" --project-id "$PROJECT_ID" \
    --field-id "$FIELD_ID" --single-select-option-id "$OPTION_ID" >/dev/null
}

cmd="${1:-}"
case "$cmd" in
  list)
    load_project
    items_json | jq -r --arg s "$(tr '[:upper:]' '[:lower:]' <<<"${2:-}")" '
      .items[]
      | select($s == "" or ((.status // "") | ascii_downcase) == $s)
      | [(.status // "-"), "#\(.content.number)", .content.type, .content.title] | @tsv' \
      | sort
    ;;
  add)
    [ $# -ge 2 ] || die "usage: board.sh add <number> [status]"
    load_project
    load_status "${3:-Backlog}"
    id="$(item_id "$2")"
    [ -n "$id" ] || id="$(add_item "$2")"
    set_status "$id"
    echo "#$2 -> ${3:-Backlog}"
    ;;
  move)
    [ $# -ge 3 ] || die "usage: board.sh move <number> <status>"
    load_project
    load_status "$3"
    id="$(item_id "$2")"
    [ -n "$id" ] || id="$(add_item "$2")"
    set_status "$id"
    echo "#$2 -> $3"
    ;;
  remove)
    [ $# -ge 2 ] || die "usage: board.sh remove <number>"
    load_project
    id="$(item_id "$2")"
    [ -n "$id" ] || die "#$2 is not on the board"
    gh project item-delete "$NUM" --owner "$OWNER" --id "$id" >/dev/null
    echo "#$2 removed from the board"
    ;;
  *)
    die "usage: board.sh list [status] | add <number> [status] | move <number> <status> | remove <number>"
    ;;
esac
