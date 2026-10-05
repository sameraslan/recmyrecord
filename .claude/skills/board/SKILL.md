---
name: board
description: Manage the recmyrecord issue board (GitHub Issues plus the "recmyrecord" GitHub Project). Use when Samer gives an idea to turn into a ticket, asks what is on the board, what is next or what needs him, asks to move a ticket between columns, or asks to start or pick up a ticket. Also use whenever work on a ticket pauses on a question for Samer or reaches a finished PR.
---

# The recmyrecord board

Tickets are GitHub issues in `sameraslan/recmyrecord`. Their status is the Status column on the GitHub Project titled `recmyrecord`. The board is the only task list: do not keep task lists or statuses in `CLAUDE.md`, memory or other files.

The repository is public. Never put secrets, credentials or private details in an issue.

## Columns

| Column | Meaning | Whose move |
|---|---|---|
| Backlog | An idea. May still have open questions. | Samer picks what to shape |
| Todo | Shaped: the "Done when" list is complete and nothing blocks starting. | Claude, when asked |
| In progress | A session is working on it. | Claude |
| Needs answer | Work has started and is paused on Samer: a plan to approve, design decisions, copy to sign off. The work is not finished. | Samer |
| Final review | Built and verified. The PR is ready and only needs Samer's approval to merge. | Samer |
| Done | Set by GitHub when the issue closes. Do not set it by hand. | |

Needs answer and Final review are Samer's queue. Everything he has to do should be visible in those two columns, and nothing should sit in them that does not need him.

Order within a column is the priority. There are no priority or status labels.

## One card per piece of work

The card is the issue. Pull requests are not cards: they are linked from the issue (a comment with the PR number, and `Closes #<n>` in the final PR). A piece of work may go through several PRs (a prototype, a plan, the build); they all hang off the same issue, and the issue's column says where the work as a whole stands.

When a ticket moves to Needs answer or Final review, leave a comment on the issue that says exactly what Samer is being asked: the questions with a recommendation for each, or the PR to approve. He should not have to open a session to find out.

## Labels

Area: `site`, `pipeline`, `experiment`. Kind: `bug`, `idea`. `needs-decision` marks a Backlog or Todo ticket that cannot be shaped or started without a decision from Samer; once work has started, use the Needs answer column instead. Most tickets get one area label and at most one other.

## Moving and listing cards

```bash
.claude/skills/board/board.sh list                 # every card with its column
.claude/skills/board/board.sh list "needs answer"
.claude/skills/board/board.sh add 41 backlog       # issue number
.claude/skills/board/board.sh move 41 "in progress"
.claude/skills/board/board.sh remove 41            # off the board; the issue is untouched
```

The script needs the `project` scope on the `gh` token. If it reports the scope is missing, ask Samer to run `gh auth refresh -s project`; do not try to work around it.

### From a cloud session

A cloud session can only reach this repository, not the Project, so `board.sh` and `gh project` fail there. Run the same commands through the `board` workflow (`.github/workflows/board.yml`) instead, with the GitHub tools:

- Start it: `actions_run_trigger` with `method: run_workflow`, `workflow_id: board.yml`, `ref: main` and `inputs` `{"command": "move", "number": "41", "status": "In progress"}`. `command` is `list`, `add`, `move` or `remove`; `status` is a column name exactly as above (for `list` it filters, and may be empty).
- Read the result: `actions_list` with `list_workflow_runs` for `board.yml` gives the run, `list_workflow_jobs` its job, and `get_job_logs` with `return_content: true` the output (for `list`, the cards).
- Check the run succeeded before telling Samer a card moved. If it fails because `BOARD_TOKEN` is not set, say so; do not ask Samer to move cards by hand as a habit.

The workflow also moves cards by itself: when a PR whose description says `Closes #<n>` opens as a draft (or is converted to one), issue `<n>` goes to In progress; when it opens ready or is marked ready for review, to Final review. You still move cards for anything else (Todo, Needs answer, a ticket with no PR yet).

## Creating a ticket

1. Search for a duplicate: `gh issue list --state all --search "<keywords>"`. Also check what other sessions and open PRs are already doing (`gh pr list`); do not file a ticket for work that is already under way under another ticket.
2. Write the body with the sections of `.github/ISSUE_TEMPLATE/task.md`. Read enough of the code to fill in Pointers with real paths. Put what is unknown under Open questions; do not invent acceptance criteria for an idea that has not been shaped. Write it so Samer can tell what it means without the code open.
3. Create it: `gh issue create --title "..." --body-file <file> --label <labels>`. Titles are short and start with a verb.
4. Put it on the board: Backlog for an idea, Todo if it is ready to start.
5. Reply with the issue link and the column.

## Working a ticket

1. Read it: `gh issue view <n> --comments`.
2. If it is already In progress, another session has it. Say so and ask before touching it.
3. If the ticket has open questions or the `needs-decision` label, settle those with Samer first.
4. Move it to In progress.
5. Work on a branch with the issue number in its name, for example `feat/41-preview-player`. Experiments follow `experiments/README.md` instead and use `experiment/<name>`.
6. Whenever the work stops on Samer (a plan, a design choice, copy), comment the questions on the issue and move it to Needs answer. When he answers, move it back to In progress.
7. When it is built: check the result against the "Done when" list, run the ticket's verification, and open a PR whose description contains `Closes #<n>`. `Closes` only takes effect when the PR targets `main`; for a stacked PR, say in the PR that the issue has to be closed by hand.
8. If the PR may merge without asking under the rules in `CLAUDE.md` (additions only, checks pass), merge it. Otherwise comment the PR link on the issue and move the ticket to Final review.
9. Merging closes the issue and GitHub moves the card to Done.

## Keeping the board honest

Before answering "what's next", "what's on the board" or "what needs me", compare the board with `gh pr list` and `gh issue list` and fix what has drifted: a ticket in Needs answer whose question was answered, a ticket in Final review whose PR merged or closed, an open PR whose work has no ticket. When an idea is dropped, close the issue as not planned rather than leaving it in Backlog.
