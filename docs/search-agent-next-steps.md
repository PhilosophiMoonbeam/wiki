# Search and Agent: next steps

## Product direction

Keep Search as the fast, predictable way to find pages and Wiki Agent as the place to understand or change them. Retain distinct header entrances and keyboard shortcuts. Connect them through deliberate handoffs: the query, selected pages, and scope should carry across visibly. Opening the Agent must not silently launch a model request.

This iteration fixes temporary-history visibility, exposes retention and a Keep action, preserves unsent text across overlay navigation, makes replacement creation safe on failure, and adds existing match evidence to search rows. Temporary means expiring conversation retention; it does not disable personal memory. A separate memory-free mode would need an explicit backend policy, not just a different button label.

## Recommended order

| Priority | Improvement | Implementation and acceptance criteria |
| --- | --- | --- |
| 1 | Inspect sources in place | Add an accessible preview drawer to search rows and Agent citations, with title, authorized query excerpt, revision date, and Open page / Ask about this page actions. Preserve the query, scroll, and draft when it closes. Recheck page access before returning an excerpt; never send protected content merely because its metadata matched. |
| 2 | Make context selectable | Show removable current-page and selected-page chips above the composer. Add explicit All Wiki / this section / selected pages scope. Opening the Agent prepares context and editable text; submission consumes an immutable snapshot. Keep skill attachments visually distinct from source pages. |
| 3 | Improve retrieval coverage and count honesty | Carry bounded-window metadata through the browser API, label capped counts, and provide a stable continuation strategy. Fill authorized result windows without exposing inaccessible titles, counts, snippets, or suggestions. Exercise locale, path, private ownership, password protection, and group rules in the same regression corpus. |
| 4 | Preserve the whole composed request | Extend the in-memory draft from text to text + goal mode + selected skills + selected sources. Introduce a single typed session coordinator for create/select/submit/retention transitions. Consider creating server sessions only on first submission, while preserving profile resolution, launch-page context, and idempotency. No local persistent storage for temporary drafts. |
| 5 | Make answers easier to use | Add Copy answer and an explicit Save as Wiki draft flow, carrying citations. Show a reviewable change preview for edits. Keep execution progress separate from answer text, and make reconnecting, waiting for approval, retrying, and completed states truthful and keyboard accessible. |
| 6 | Evaluate relevance before adding another index | Build a representative, permission-aware query set covering exact titles, abbreviations, paraphrases, tags, paths, and related concepts. Record recall at a fixed result count, ranking quality, zero-result rate, and p95 latency. Trial hybrid semantic retrieval only against that baseline and with the same access checks. |

## Architectural constraints

The existing page-search operation is a useful shared boundary for browser, Agent, and external tools. Extend that contract instead of building separate ranking and permission systems for each client. A retrieval response should carry stable page identity, matched fields, authorized excerpts, observed revision, scope, and honest continuation information. Revalidate access and revision at read or edit time; a search hit is not a write authorization.

Today `server/operations/pages.ts` receives a capped public candidate set and then filters it through live-page checks and access rules. That protects visibility but can underfill results when inaccessible candidates occupy the window. The operation returns `windowLimit` and `windowTruncated`; `client/helpers/pages-api.ts` exposes only results, suggestions, and `totalHits`, which is the accessible result count inside that window. Improving this requires an explicit retrieval contract and tests, rather than changing the displayed number alone. Private-page retrieval also follows a separate bounded query path and should participate in the same relevance evaluation.

Treat retention, memory, and active execution as separate concerns. History excludes unfiled temporary conversations before pagination; owner-scoped direct access remains available. Expiry is enforced by maintenance, with active execution fencing deletion. Foldered legacy sessions remain visible and exempt from expiration. Keep converts retention to saved and clears expiry. A future memory-free mode must prevent both reading the personal-memory snapshot and writing memory, including tool-driven writes, for the lifetime of that conversation.

For sources, avoid caching authorized excerpts in a shared global result cache. Cache identities and retrieval work only with an appropriate authorization boundary; rehydrate current visible content before showing it. Search excerpts should use safe text rendering with structured highlights rather than accepting raw result HTML.

## Verification for this iteration

Repository tests cover hiding completed temporary sessions before pagination, continued owner access, Keep conversion, and legacy folder visibility. Store regressions cover creating before deleting the previous empty session, retaining drafts on failure, and clearing only the submitted draft after an accepted request. Component and browser checks cover Search/Agent continuity, retention controls, responsive layout, focus, and accessibility. The maintained Docker app is checked separately from browser tests that substitute locally built assets.
