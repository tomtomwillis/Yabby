# Issues Page

**File:** `src/pages/IssuesPage.tsx`
**Route:** `/issues`

A bug/problem report board where users post issues and admins track them through to resolution.

## What It Shows

- Two tabs: **In Progress** (default) and **Completed** — each backed by a status-filtered query on the `issues` collection
- A message board (same functionality as the main chatroom): text posts, pasted-image attachments, threaded replies, heart reactions
- The compose box only appears on the In Progress tab; new posts are always created with `status: 'inprogress'`
- Admins see a per-issue toggle (check/undo icon) that moves an issue between In Progress and Completed
- Polls and film announcements are disabled on this board

## Deep Linking

`/issues?issue=<docId>` opens the tab the issue lives on, pins the post to the top if it's beyond the first page, and scrolls to it with a highlight flash. The `/issueresolved` slash command in any compose box inserts links in this format.

## Components Used

- `MessageBoard` — with `collectionName="issues"`, `statusFilter`, `showComposer`, and `highlightMessageId`; remounted per tab via `key={activeTab}`
- `Header` — page header
- `Tips` — tip bar suggesting pasting screenshots

## Customising

- Tab labels/keys are in the `TABS` array in `IssuesPage.tsx`; tab styling is in `IssuesPage.css`
- Issue validation and the admin-only status rule are in `firestore.rules` under the `issues` collection
- The status-filtered query needs the composite index in `firestore.indexes.json` (`status` + `lastActivityAt`)
