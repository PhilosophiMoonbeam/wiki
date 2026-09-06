# Administration workflow overhaul

This continues beyond the shared shell refresh. Each destination needs a review of its real workflows, a tailored implementation, an assessment of useful missing capabilities, and verification of the result. A header change does not complete an area.

The visual direction is an editorial workspace: quiet surfaces, concise context, prominent task controls, readable records and progressive disclosure of advanced settings. Configuration state must be distinguishable from observed operational health.

| Area | Workflow and capability scope | State |
| --- | --- | --- |
| Pages | Inventory, filtering, ownership, publication, detail and bulk actions | Pending |
| Tags | Taxonomy, usage, editing and consolidation | Pending |
| Editors | Availability, defaults and configuration | Pending |
| Rendering | Pipeline, dependencies, configuration and output | Pending |
| Comments | Providers, discussion and moderation | Pending |
| Users | Discovery, details, creation and access lifecycle | Pending |
| Groups | Membership, permissions, page rules and effective access | Pending |
| Authentication | Providers, sign-in, provisioning and diagnostics | Pending |
| Security | Sessions, protections and policies | Pending |
| Wiki Agent | Providers/models, skills, browser, tools, memory, MCP and runtime | Implemented; first milestone verified |
| Search | Providers, retrieval, index lifecycle and evaluation | Implemented; first milestone verified |
| API | Credentials/scopes, integration setup and reference | Implemented; deployment verification pending |
| Webhooks | Events, endpoints, deliveries, tests and recovery | Implemented; first milestone verified |
| General | Identity, announcements, features and defaults | Pending |
| Theme | Appearance, previews and reversible editing | Pending |
| Navigation | Structure, ordering, audiences and preview | Pending |
| Locale | Languages, defaults and multilingual operation | Pending |
| Analytics | Providers, insight and collection controls | Pending |
| System | Environment, health and diagnostics | Pending |
| Storage | Targets, synchronization, recovery and job state | Pending |
| Mail | Sender, transport and delivery diagnostics | Pending |
| SSL | Certificates, renewal and ingress responsibilities | Pending |
| Logging | Destinations and troubleshooting | Pending |
| Extensions | Availability, configuration and dependencies | Pending |
| Utilities | Import, export and maintenance workflows | Pending |
| Developer flags | Constraints, dependencies and activation | Pending |
| GraphQL explorer | Integration, authentication and exploration | Implemented; deployment verification pending |

## Wiki Agent findings

The existing console has working provider creation, connection checks, access grants, default selection, skill approval and browser target management. Its landing view prioritizes deployment limits, repeats status in several places and leaves no clear setup path. Providers have no inventory filtering. Actual tool exposure and memory behavior are absent from administration, and MCP setup is disconnected from the capability policy that governs it.

The redesign starts with actionable setup status, brings providers forward, makes sections directly addressable, and introduces an authoritative tool inventory generated from the server action catalog and deployment flags. This inventory describes deployment eligibility; individual permissions, selected skills, provider support and execution-time approvals still apply. Personal memory remains private to its owner. Deployment kill switches remain deployment configuration.

Verification and implementation evidence will be recorded as each area is completed. All areas require final browser review, appropriate checks and deployment verification before this goal is complete.

### Agent implementation and verification

- Seven directly addressable sections: overview, providers, skills, browser access, tools/MCP, knowledge/memory and runtime. Full-width working area replaces the nested sidebar and repeated status cards.
- Setup checks distinguish runtime configuration, enabled/verified provider credentials and an eligible shared default. This is configuration evidence, not a live inference-health claim.
- Provider filtering covers names, models, endpoints, protocols and audiences; state filters expose connections needing attention. Existing-profile editing supports direct section access and saving from any section. Connection history uses the existing bounded verification endpoint, including individual probe results and retry.
- Browser destinations have search and state filters. Existing exact-URL approval and pause workflows remain enforced.
- A new administrator-only skill source endpoint finds unmapped Markdown roots within the configured namespace. Search treats wildcard characters literally, caps results at 20 and excludes nested/unrelated pages. The picker fills source references and the matching skill name; existing server validation and exact-revision approval remain authoritative.
- Runtime now projects tool descriptors and transport-specific deployment blockers directly from the action catalog. The new tool directory filters by capability, interface and eligibility and explains permissions/effects. Personal memory is explicitly unavailable over MCP. MCP currently exposes the wiki to clients; arbitrary outbound MCP server execution is not part of the runtime architecture and no nonfunctional connection editor is offered.
- Knowledge/memory explains authoritative pages, approved skills, owner-private memory snapshots and the actual retention configuration. Deployment gates and personal-memory ownership remain intact.

Validation: client/shared/server type checks, repository lint, Agent component tests, administration integration tests and server controller/catalog tests. Browser preview reviewed all seven sections at 1440px and 390px in dark and light themes: no page overflow, JavaScript errors or WCAG A/AA violations after corrections. Interactive checks covered provider and destination filters, history, direct provider editing/discard, source selection, tool disclosure and section persistence after reload. Source selection used controlled metadata without creating a production skill. Deployed milestone `d49ac379` passed a second browser review without asset or API interception: all seven sections at desktop/phone in both themes, real tool policy and source-search responses, provider filtering/history, source-search empty state, section persistence and keyboard navigation. Container health is healthy. Final cross-administration review remains pending with the other areas.

## Search findings

Initial code review confirms that engine selection/configuration and rebuilding work, but Apply is enabled even without changes; no draft reset or query evaluation is available. The next implementation should separate saved engine state from configuration drafts, make maintenance understandable, and add a real query-evaluation workflow showing results and match evidence from the actual search service. Index health must be measured from supported server state, never inferred from a selected engine alone.

### Search implementation and verification

- Three directly addressable workspaces: Configuration, Evaluate queries and Index maintenance. Engine configuration has a saved baseline, dirty gating, reset, an accessible leave confirmation and a save bar outside the panel transition container.
- Query evaluation uses the same permission-filtered page-search API as readers. It displays the submitted query/scope, actual matching fields, relative scores, spelling suggestions, round-trip duration, bounded-window guidance and further result pages. Draft configuration never silently changes an evaluation.
- A new system-administrator endpoint projects PostgreSQL index coverage: published public pages, indexed entries, missing pages, stale source revisions and entries that no longer belong in the public index. Dictionary and schema metadata are compared with the running engine. Inspection uses one query snapshot with a five-second statement timeout and makes no index changes. Unsupported inspection is explicit, not an empty healthy result.
- Rebuilding has a review step, server-confirmed completion, an explicit uncertain-outcome state after a failed request and guidance that leaving the page does not cancel the server operation. Inspection is on demand; this is not a persistent rebuild-job history or a latency/service-health monitor.
- Enumerated configuration settings are validated before any engine rows are changed, preventing an invalid dictionary selection from being persisted through the API.

Verification: draft/reset/save-failure/navigation tests; REST transport and schema tests; administrator access and error-redaction tests; engine inspection tests; shared/client/server type checks, lint, build and bundle budgets. The exact inspection SQL was also executed against isolated PostgreSQL temporary tables covering current, missing, stale, private, unpublished and orphaned entries. All three sections passed browser preview at 1440px, 900px and 390px in light/dark themes with no page overflow, JavaScript errors or WCAG A/AA violations. Interactive checks covered a real query, configuration reset, navigation cancellation, inspection failure/retry, rebuild review cancellation and section persistence. Production verification is the next gate.

Search deployment `dd87cd09` is healthy. Unintercepted browser verification covered all three sections at 1440px, 900px and 390px in light and dark themes with no overflow, JavaScript errors or WCAG A/AA violations. Real queries, inspection and a server-confirmed index rebuild passed; the post-rebuild snapshot reported zero missing, stale or excluded entries with matching dictionary metadata.

## Webhooks findings

The old endpoint editor required manually typed event subscriptions, allowed silent draft loss when changing selection, and displayed delivery state without the stored error, response or retry schedule. Actual page producers emit hyphenated names that subscription validation rejected. There was no targeted receiver test or embedded integration contract.

### Webhooks implementation and verification

- Endpoint directory with name/URL search and status filtering; a compact mobile chooser. Each selected endpoint has directly linked Setup, Deliveries and Receiver guide sections, with endpoint identity preserved in the URL.
- Destination and subscription steps, actual page/review event catalog, custom subscription support, and matching server/client validation for hyphenated event names. New endpoints start disabled while their receiver signing secret is configured. Existing API callers retain the prior default behavior.
- Saved/draft separation, change-gated save/reset, navigation and endpoint-switch protection, recoverable failed saves, and protected one-time signing secret display. Rotation and deletion clearly explain consequences for queued and in-flight deliveries.
- Delivery search/state filters and expandable response, error, identifiers, timestamps and next-attempt details. Retry and cancellation use the existing durable state machine. Disabled deliveries are identified as skipped instead of implying a receiver acknowledged them.
- New administrator-only POST `/_api/webhooks/:id/test` queues a targeted `webhook.test` event containing only a synthetic marker/message. It uses the same signed worker delivery path, attempts once, rejects disabled/missing endpoints and duplicate active tests, and cannot fan out to other subscribers. The PostgreSQL endpoint lock serializes concurrent test creation; all inserts are transactional.
- Receiver guide documents the actual envelope, signature inputs/headers, timeout, acknowledgement, idempotency, metadata access and queue-history retention. Responses are private/no-store; unexpected server errors are logged and redacted from the client.
- Capability limits: history retains only the latest response per delivery and is bounded to the latest 100 records; terminal queue cleanup can remove history after 30 days. There is no durable per-attempt timeline, automatic UI polling, per-page webhook ACL or permanent webhook audit archive. These limits are explicit in the interface.

Validation: targeted queue, operation, authorization, subscription, worker and client workflow tests; shared/client/server type checks; lint; Vite build. Preview browser review covered three sections at 1440px, 900px and 390px in light and dark themes with no overflow, JavaScript errors or WCAG A/AA violations. Controlled fixtures exercised create/save/failure/reset, event selection, endpoint and route draft guards, secret acknowledgement/rotation, test queueing, delivery retry/cancel, refresh recovery, deletion and bookmark restoration. No test messages were sent to external receivers during verification.

The targeted test transaction also passed against PostgreSQL temporary copies of the four relevant tables: one queued delivery, synthetic event marked published, active-test conflict, and disabled-endpoint rejection. No worker was invoked and no live rows were modified.

Webhooks deployment `f247c675` is healthy. Unintercepted browser verification covered all three sections at desktop, tablet and phone widths in both themes with no overflow, JavaScript errors or WCAG A/AA violations. A temporary disabled endpoint verified real creation, persisted hyphenated subscriptions, rotation, deletion, draft protection and server-side rejection of a test while disabled. The fixture was removed. No outbound delivery was sent. Detailed delivery recovery and synthetic sends used controlled browser fixtures plus queue/worker tests, not third-party receivers.

## API access / GraphQL explorer initial findings

The API inventory counts expired keys as active, hides issued group permissions and MCP resource bindings, and mixes key administration with a long integration reference. Key generation has permission selection but no preview of the selected group's effective grant. When MCP is enabled, newly issued keys are automatically bound to its configured resource; the existing reference does not clearly explain this lifecycle or how older keys differ. GraphQL exploration is provided by the server's GraphiQL endpoint, permission-gated separately from API-key enablement. The implementation separates credential administration from connection setup and preserves the standalone schema-aware editor.


### API access implementation and verification

- Three directly linked sections: Credentials, Connect a client and GraphQL explorer. Searchable credential register distinguishes active, expired, revoked and unknown expiry; expandable records show issued group identity, current group grants, dates and MCP resource binding. Global API state is separate from credential validity.
- Guided Identity / Access / Review issuance with a 90-day default, non-system group selection, current permission/page-rule preview and explicit MCP opt-in. Replacement carries forward scope and MCP intent, and leaves the old credential valid until separately revoked. One-time credentials remain visible even if inventory refresh fails. Draft/error recovery and navigation protection cover issuance and secret acknowledgement.
- Administrator-only connection metadata exposes configured MCP resource and group grants without secrets. Existing callers that omit MCP intent retain automatic binding behavior; new UI callers can explicitly exclude MCP. Creation validates lifetime, group existence and explicit MCP configuration. API responses are private/no-store. Failed global-state persistence restores runtime state; concurrent state writes serialize.
- Protocol-specific REST, GraphQL and MCP connection guidance uses real endpoint/configuration data, copyable examples with environment-variable placeholders, grant requirements and authentication diagnostics. Configuration evidence is explicitly distinguished from a successful connection test.
- Limits: there is no fabricated last-use telemetry, per-credential request history or immutable permission snapshot. Scoped credentials continue to inherit their group's current access. Protocol entitlement is bounded by actual server authentication rules; MCP resource binding is separate from the group's use:mcp permission.

Validation: 48 controlled browser cases across three widths and both themes, including all issuance stages and protocol guides; no overflow, JavaScript errors or WCAG A/AA violations. Lifecycle checks exercised creation, replacement, issuance failure, refresh failure without losing the secret, revocation and global state changes. Eleven targeted test files passed, along with shared/client/server type checks and repository lint. Production lifecycle verification is pending deployment.

### GraphQL explorer implementation and verification

- Integrated workspace navigation and a collapsible guide with three read-only starter queries validated against the actual server schema. Signed-in session authentication, optional bearer headers, real mutation effects and local query-history behavior are explained. Header persistence is disabled.
- Retains the full Yoga GraphiQL editor, query execution, variables, headers, schema documentation and subscriptions. Supplies an immediately executable page inventory instead of a welcome comment. Document selection/closing retains native React handlers and exposes independent accessible controls with keyboard navigation.
- Ships the pinned Yoga IDE 4.4.4 script, styles and Monaco workers as same-origin container assets. Build-time version checks prevent mismatched bundles. The build copies the MIT notice and the license inventory accounts for the prebuilt renderer's dependencies. Exact reviewed peer attribution exceptions record upstream package-range mismatches without changing application dependency resolution.
- Responsive workspace chrome, readable dark editor annotations, visible documentation links and theme-aware guide controls. No external script/style dependency is needed to open the editor.

Validation: six responsive/theme browser cases with no overflow, JavaScript errors or WCAG A/AA violations; actual permission-filtered page query, schema documentation, multiple documents and keyboard selection. Asset lifecycle/version mismatch tests, schema validation, subscription configuration regression tests, dependency and license checks passed. Production verification is pending deployment.
