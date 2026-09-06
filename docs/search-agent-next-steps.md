# Search and Agent: roadmap completion

Search remains a fast page finder, while Wiki Agent provides a separate working space. Explicit handoffs carry the query, scope, and chosen sources into an editable request. See [the implemented workspace contract](search-agent-workspace.md) for behavior and architectural details.

| Target | Delivered |
| --- | --- |
| Inspect sources in place | Shared accessible source reader for search results, selected sources, and Agent citations; authorized, bounded plain-text excerpts; current revision; preserved navigation. |
| Select context | Removable current-page and source chips; All Wiki, page-tree, language, and selected-page scopes; immutable submission context carried through durable execution and shown in the transcript. |
| Retrieval coverage and counts | Authorization before PostgreSQL candidate caps, live result hydration, scoped private retrieval, honest bounded counts, and session-bound ordered continuation with permission revalidation. |
| Preserve composed requests | Typed in-memory drafts retain text, goal mode, skills, sources, and scope across workspace navigation. Existing session coordination preserves drafts on failure and discovers submissions accepted while the view was closed. |
| Reuse answers | Copy with source links and editable private Wiki draft review; existing immutable edit proposals continue to provide diffs and approval. Agent-owned menus and dialogs participate correctly in focus and Escape handling. |
| Evaluate relevance | Reproducible 20,000-page PostgreSQL corpus, recall@5, reciprocal rank, nDCG, zero-result rate, latency, and scoped candidate checks. [Baseline report](benchmarks/search-agent-2026-09-06.json). |

Temporary conversations remain excluded from Recent until kept, show their expiry, and retain personal-memory behavior. Temporary is a retention choice. It is not a memory-free mode.

## Deliberate architectural decisions

Keep the existing typed Pinia session coordinator and early session creation: opening a conversation establishes provider resolution and its frozen memory snapshot. Lazy creation would alter those semantics without improving the composed-request continuity now provided.

Use the existing page-operation authorization boundary for the browser, Agent, and external tools. Source metadata is never permission or read evidence. Continuations cache identities, not excerpts, and revalidate current access. The PostgreSQL permission prefilter evaluates the existing page-rule policy instead of duplicating it in SQL.

## Evidence-led follow-up

The baseline exposes abbreviation and paraphrase misses. A semantic retrieval experiment should now be compared against these measured cases, including scope and access constraints, before selecting another index or embedding provider. This release does not introduce an unconfigured external dependency. Monitor whole-request latency and public metadata volume as the corpus grows; the engine baseline does not measure every HTTP authorization cost.

A separate memory-free conversation mode would need an explicit lifetime policy preventing both memory reads and writes. Do not relabel temporary retention to imply that guarantee.
