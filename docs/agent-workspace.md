# Wiki Agent workspace

Search and Wiki Agent have distinct entrances. Search finds pages as you type; the Agent helps interpret those pages and work with them. The header exposes both on desktop and mobile, with Ctrl/Command+K for search and Ctrl/Command+Shift+A for the Agent. Search results offer **Ask about this**, which sends the current query into the conversation. **Open Wiki Agent** opens the workspace without sending a message.

The Agent stays on the current Wiki route, preserving page context. Its single toolbar contains search, conversation identity, history, memory, conversation creation, and close. Temporary sessions are explicitly identified; their creation action moves into the panel menu on small screens.

History and memory occupy independent columns at desktop widths. Between 1024px and 1759px, one panel can be open at a time; wider screens can show both. On smaller screens they use the existing modal focus scope and scrim. Container queries also adapt the toolbar and starters when a docked panel narrows the conversation. Closed panels reserve no space.

The visual language uses the application's local display typeface, warm accent, and light/dark surface tokens. The transcript and composer share a reading measure. Assistant text sits directly on the workspace; sources, activity, approvals, and goals retain their explicit disclosures. Page context sits above the composer. Keyboard focus outlines the entire composer so the inner textarea does not clip the indicator.

Welcome suggestions prepare editable drafts. They do not send requests until the user submits. The empty workspace starts at the top after resizing; active conversations retain their existing follow-response behavior.

## Verification

- Client typecheck and repository lint.
- Agent component interaction tests, memory and history tests, search handoff and modal focus tests, and typography contracts.
- Authenticated browser checks at 320px, 390px, 768px, and desktop widths; history/memory docking, temporary sessions, search navigation, editable starters, and light/dark presentation.
- A live read-only question in a temporary conversation verifies inference and source citations.

The responsive and accessibility browser suites use the explicit Agent entrance. Run them against the seeded E2E environment; their setup creates test data and is not intended for an existing maintained Wiki database.
