---
name: board
description: Manage the recmyrecord issue board (GitHub Issues plus the "recmyrecord" GitHub Project). Use when Samer gives an idea to turn into a ticket, asks what is on the board or what is next, asks to move a ticket between columns, or asks to start or pick up a ticket.
---

# The recmyrecord board

Tickets are GitHub issues in `sameraslan/recmyrecord`. Their status is the Status column on the GitHub Project titled `recmyrecord`. The board is the only task list: do not keep task lists or statuses in `CLAUDE.md`, memory or other files.

The repository is public. Never put secrets, credentials or private details in an issue.

## Columns

| Column | Meaning |
|---|---|
| Backlog | An idea. May still have open questions. |
| Todo | Shaped: the "Done when" list is complete and nothing blocks starting. |
| In progress | Being worked on now. Keep it to one ticket, two at most. |
| In review | A PR is open and waits for Samer. |
| Done | Set by GitHub when the issue closes or the PR merges. Do not set it by hand. |

Order within a column is the priority. There are no priority or status labels.

## Labels

Area: `site`, `pipeline`, `experiment`. Kind: `bug`, `idea`. `needs-decision` marks a ticket that waits on Samer. Most tickets get one area label and at most one other.

## Moving and listing cards

```bash
.claude/skills/board/board.sh list              # every card with its column
.claude/skills/board/board.sh list todo
.claude/skills/board/board.sh add 41 backlog    # issue or PR number
.claude/skills/board/board.sh move 41 "in progress"
```

The script needs the `project` scope on the `gh` token. If it reports the scope is missing, ask Samer to run `gh auth refresh -s project`; do not try to work around it.

## Creating a ticket

1. Search for a duplicate: `gh issue list --state all --search "<keywords>"`. If one exists, add to it instead.
2. Write the body with the sections of `.github/ISSUE_TEMPLATE/task.md`. Read enough of the code to fill in Pointers with real paths. Put what is unknown under Open questions; do not invent acceptance criteria for an idea that has not been shaped.
3. Create it: `gh issue create --title "..." --body-file <file> --label <labels>`. Titles are short and start with a verb.
4. Put it on the board: Backlog for an idea, Todo if it is ready to start.
5. Reply with the issue link and the column.

## Starting a ticket

1. Read it: `gh issue view <n> --comments`.
2. Check what is already In progress. If something is, say so and ask before starting a second.
3. If the ticket has open questions or the `needs-decision` label, settle those with Samer first.
4. Move it to In progress.
5. Work on a branch with the issue number in its name, for example `feat/41-preview-player`. Experiments follow `experiments/README.md` instead and use `experiment/<name>`.
6. Check the result against the "Done when" list and run the ticket's verification.
7. Open a PR whose description contains `Closes #<n>`, then move the ticket to In review. `Closes` only takes effect when the PR targets `main`; for a stacked PR, say in the PR that the issue has to be closed by hand.
8. Merging follows the rules in `CLAUDE.md`. Merging closes the issue and GitHub moves the card to Done.

## Keeping the board honest

Before answering "what's next" or "what's on the board", compare the board with `gh pr list` and `gh issue list`, and fix cards that have drifted (a merged PR whose ticket is still In review, an open PR that is not on the board). When an idea is dropped, close the issue as not planned rather than leaving it in Backlog.
