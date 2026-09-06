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
| Wiki Agent | Providers/models, skills, browser, tools, memory, MCP and runtime | Implemented; deployment verification pending |
| Search | Providers, retrieval, index lifecycle and evaluation | Pending |
| API | Credentials/scopes, integration setup and reference | Pending |
| Webhooks | Events, endpoints, deliveries, tests and recovery | Pending |
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
| GraphQL explorer | Integration, authentication and exploration | Pending |

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

Validation: client/shared/server type checks, repository lint, Agent component tests, administration integration tests and server controller/catalog tests. Browser preview reviewed all seven sections at 1440px and 390px in dark and light themes: no page overflow, JavaScript errors or WCAG A/AA violations after corrections. Interactive checks covered provider and destination filters, history, direct provider editing/discard, source selection, tool disclosure and section persistence after reload. Source selection used controlled metadata without creating a production skill. Production deployment and verification remain the next gate.
