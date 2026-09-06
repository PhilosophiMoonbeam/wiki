# Administration experience

Administration uses a shared control center for the wiki's content, access, intelligence, workspace configuration, and operations. Existing routes and server authorization remain in place.

## Structure

`client/helpers/admin-navigation.ts` is the settings catalog. It owns domain membership, destinations, translated labels, descriptions, search aliases, counts, and visibility permissions. Both the sidebar and dashboard directory consume the same filtered catalog. Add new settings there rather than maintaining a second navigation list. Visibility follows the existing permission alternatives; server handlers continue to enforce access independently.

Search matches all entered terms against the domain, title, description, and aliases. Navigation clears the search after selection, opens the destination's domain, and focuses the incoming heading. Agents remain discoverable for system administrators when disabled; the destination explains the deployment setting.

## Presentation

The shared `AdminHero` provides a semantic heading, contextual description, status, and actions. Its icon family matches the navigation. Typography and colors use the wiki's existing user preferences and theme tokens. Administration uses restrained borders and surfaces, compact navigation, and consistent form and table treatments. Decorative delayed entrance animations are disabled within administration.

The dashboard presents workspace inventory, search and agent/integration entry points, recent content and access activity, and a searchable directory. Summary failures show unavailable values with retry instead of false zero counts. Recent activity retains its independent loading, error, empty, permission, and request-generation handling.

General settings includes section anchors and a sticky save bar using the existing form validation and dirty state. Search index maintenance is separate from the Apply action. API keys can be filtered by name and revocation status, with a record layout on smaller screens; integration reference includes the MCP endpoint and its resource-bound authentication requirement.

## Verification

- Unit/contract coverage: administration components, shared hero, and navigation catalog.
- Responsive regression: `dev/e2e/responsive.e2e.ts` checks drawer behavior, the directory anchor, alias search, empty results, and reset.
- Browser review: the dashboard and all 26 main settings pages at desktop and phone widths; focused tablet, light/dark, keyboard, form-state, filter, and error-recovery checks. Reviews use read-only requests or unsaved form edits.

The redesign does not alter persisted configuration schemas or API behavior.
