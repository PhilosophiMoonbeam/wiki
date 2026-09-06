# Search and Agent research workspace

Search locates knowledge; Wiki Agent works with it. Both entrances remain visible in the application header. **Ask about this** prepares an editable question and carries the current search scope into the Agent. It never starts a model request by itself. Existing unsent text is retained when preparing a handoff.

## Sources in place

Search rows offer Preview. Citation links in Agent answers open the same reader, while modified clicks still support opening the underlying page. The reader includes current revision, update date, a bounded text excerpt, and Open page / Ask about this page. Its own focus scope restores focus and leaves the search query, result position, and conversation in place. Unavailable and locked sources have explicit states.

`GET /_api/pages/preview` uses the existing owner, page-rule, and password-unlock checks, then projects only source fields. Excerpts are plain text, with escaped Vue text nodes for highlights. Responses are private and non-cacheable. Selected-source metadata is a navigation hint, not authority or permission to read the page.

## Composed requests

A typed draft in the existing Pinia session coordinator owns text, message/goal mode, explicitly invoked skills, selected sources, search scope, and whether the current page is included. There is no browser-persistent draft storage. The current page is removable, and selected sources are distinct from skill attachments. Up to eight source pages can be attached. All Wiki, current page tree, selected pages, and a language scope carried from Search are supported.

Submission snapshots the context. Validated source references and scope become part of run admission and its idempotency envelope, survive durable queuing, and propagate to research tasks and goal continuations. Search actions apply the selected scope at execution time. Page reads still enforce current permissions and revision checks independently. The transcript shows the scope and selected revisions used for each submitted question, even if the composer later changes.

Early server-session creation remains intentional: the existing provider resolution and frozen memory snapshot are established when the conversation opens. Creating sessions lazily would change those semantics. Empty conversations are excluded from history, and replacement creation already preserves the previous draft on failure.

## Search coverage and continuation

PostgreSQL search accepts authorized page identities before lexical, exact, fuzzy, and graph ranking caps. Current metadata and page rules produce those identities; protected pages qualify only through searchable metadata. Selected-page scope constrains both public and private candidate queries. Search results are rehydrated from current metadata before returning them. Exact page paths bypass unnecessary broader lexical/fuzzy matching.

The browser requests 20-row pages from a bounded result window. Continuation keeps a five-minute snapshot of ordered identities, tied to the user session and query. It caches no page contents or excerpts. Each continuation reruns permission-aware retrieval and fills the next page from still-visible snapshot identities, preserving order across ranking changes and removals. Snapshots are bounded to 128 in memory and expire across restarts. An expired cursor asks the user to search again. Counts are explicitly lower bounds when the retrieval window is capped; scope and query refinement remain available.

The permission prefilter currently reads scoped public metadata to evaluate the application's existing page-rule logic. This prioritizes one consistent authorization policy over a second SQL implementation. Large deployments should monitor whole-request latency and metadata volume; the included engine benchmark does not claim to measure that entire HTTP path. Engines without the page-filter capability retain their bounded fallback behavior.

## Answers and changes

Completed answers offer Copy answer with source links and Save as Wiki draft. Saving opens an editable Markdown review with title, locale, path, and rendered preview. The explicit Create private draft action creates a new private, unpublished page through the existing page API. It never overwrites an existing page, and creation errors preserve the reviewed content. Existing Agent edit proposals retain their immutable diff, revision checks, and approval controls.

## Evaluation

The dedicated PostgreSQL benchmark now includes relevance at five results, reciprocal rank, nDCG, zero-result rate, and per-case latency across exact titles, content terms, typos, paths, descriptions, related concepts, abbreviations, paraphrases, locale/section scope, and selected identities beyond the ordinary result cap. Scope violations fail the evaluator. Run it only against a dedicated database ending in `_postgres_search_benchmark`; it recreates that database's benchmark schema.

The committed [2026-09-06 report](benchmarks/search-agent-2026-09-06.json) used 20,000 synthetic pages in a disposable PostgreSQL container. It records two lexical relevance gaps—abbreviations and paraphrases—rather than treating absent results as success. This is the comparison baseline for a future configured semantic retriever; no additional embedding provider or index is required by this change.

## Validation and rollout

The implementation passed 382 isolated repository test files, shared/client/server type checks, lint, API compatibility, dependency/license checks, and the Agent release gate. Browser checks on the maintained Docker backend covered actual authorized excerpts, source/scope handoff, goal-mode continuity, immutable submitted context, cited inference, in-place citation reading, clipboard export, editable private draft creation, failed-save preservation, and revision-checked cleanup. Temporary completion stayed out of history; Keep converted it into a visible saved conversation. Search, source reader, Agent, and draft-review accessibility checks passed, with responsive checks from 320px through desktop widths.

Live testing also corrected the scrolling excerpt's keyboard focus target and an Escape race while Agent-owned dialogs enter. The existing aggregate static gate remains red because the threat-model covered-source revision predates intervening work; this iteration documents its changed boundaries without asserting that the broader review is current.
