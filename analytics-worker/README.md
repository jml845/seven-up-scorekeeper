# FlipCast analytics

Privacy-limited Cloudflare Worker and D1 service for anonymous beta metrics. The public app remains on GitHub Pages.

Accepted events are schema allowlisted. Player names, scores, game identifiers, browser fingerprints, IP addresses, and diagnostics are rejected. Installation IDs are random browser-local UUIDs and are stored only as SHA-256 hashes salted by the Worker secret.

Raw events and daily unique-installation rows are deleted after 90 days. Daily aggregate counts remain. Use `?campaign=internal` for owner tests; the dashboard excludes those by default.

The dashboard's **Unique devices** count represents anonymous browser profiles seen by the app. It does not prove that the PWA was installed. Use a distinct campaign parameter for each recruitment source, for example `?campaign=reddit`, `?campaign=facebook`, or `?campaign=boardgamegeek`.

Secrets required in Cloudflare:

- `ID_PEPPER`: random server-only salt used before hashing installation IDs.
- `ADMIN_TOKEN`: bearer token for the private summary API and dashboard.

Deployment:

1. Apply `migrations/0001_schema.sql` to the remote D1 database.
2. Set both secrets with Wrangler.
3. Deploy the Worker.
4. Verify `/health`, rejected private fields, duplicate handling, dashboard authentication, and the D1 summary.
