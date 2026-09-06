# Wiki Agent workspace

Search and Wiki Agent have distinct entrances. Search finds pages as you type; the Agent helps interpret those pages and work with them. The header exposes both on desktop and mobile, with Ctrl/Command+K for search and Ctrl/Command+Shift+A for the Agent. Search results offer **Ask about this**, which prepares the current query and search scope as an editable request. **Open Wiki Agent** opens the workspace without sending a message.

The Agent stays on the current Wiki route, preserving page context. Its single toolbar contains search, conversation identity, history, memory, conversation creation, and close. Temporary sessions have a highlighted action and an expiry notice with **Keep conversation**; their creation action moves into the panel menu on small screens. They stay out of Recent unless explicitly kept. Personal memory remains available in temporary conversations; temporary retention is not an incognito mode.

History and memory occupy independent columns at desktop widths. Between 1024px and 1759px, one panel can be open at a time; wider screens can show both. On smaller screens they use the existing modal focus scope and scrim. Container queries also adapt the toolbar and starters when a docked panel narrows the conversation. Closed panels reserve no space.

The visual language uses the application's local display typeface, warm accent, and light/dark surface tokens. The transcript and composer share a reading measure. Assistant text sits directly on the workspace; sources, activity, approvals, and goals retain their explicit disclosures. Page context sits above the composer. Keyboard focus outlines the entire composer so the inner textarea does not clip the indicator.

The composed request—text, goal mode, selected skills, source pages, and search scope—belongs to its conversation and stays in the in-memory workspace when switching between Search and Agent or closing and reopening the overlay. It is not written to browser storage and does not survive a page reload. Starting a new conversation opens a clean composer. The existing conversation is only replaced after creation succeeds; a failed request preserves its draft. Accepted submissions clear matching text, mode, and skills even if the composer has unmounted; reusable source context remains selected. Newer edits are preserved. If the same conversation reopens before submission completes, the store refreshes it in the current workspace to discover the accepted run.

Search results show available match fields (for example, title, tags, or page text) without presenting internal rank scores.

Welcome suggestions prepare editable drafts. They do not send requests until the user submits. The empty workspace starts at the top after resizing; active conversations retain their existing follow-response behavior.

## Verification

- Client typecheck and repository lint.
- Agent component interaction tests, memory and history tests, search handoff and modal focus tests, and typography contracts.
- Authenticated browser checks at 320px, 390px, 768px, and desktop widths; history/memory docking, temporary sessions, search navigation, editable starters, and light/dark presentation.
- A live read-only question in a temporary conversation verifies inference and source citations.

The responsive and accessibility browser suites use the explicit Agent entrance. Run them against the seeded E2E environment; their setup creates test data and is not intended for an existing maintained Wiki database.

Source previews, selectable context, bounded search continuation, and answer-to-draft review are described in [Search and Agent research workspace](search-agent-workspace.md).

Conversation History and Agent Memory share a compact editorial header, readable accent colors, and consistent panel spacing. Desktop panels reserve 20rem for history and 22rem for memory while preserving the conversation alongside them. History titles wrap to two lines; folder creation sits with saved folders, and clearing Recent lives in the options menu. Retention copy follows the configured policy instead of asserting a fixed number of days.

Memory uses the full note width, puts record actions below the text, and filters across both memory stores without changing saved content or capacity. Empty results can be cleared directly. Editing focuses the input, blocks replacing an open edit, and keeps the panel open when Escape cancels that edit. Failed saves retain the draft. Clear-all remains behind an explicit confirmation in the options menu. Character limits, revision checks, stale-response handling, account privacy, and frozen conversation snapshots retain their existing behavior.

The refinement was checked with targeted lifecycle and filtering tests, client type checking, lint, and production builds. Browser checks cover History and representative populated/empty Memory fixtures, failed-save recovery, cancellation without mutations, focus and Escape behavior, composer continuity, and dark/light accessibility at 320px, 390px, tablet, and desktop widths. Memory mutations in visual verification use isolated response fixtures; personal memory is not altered by those checks.
