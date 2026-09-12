# Draft Google Play Data safety answers

This is a conservative draft based on the current web app. Reconfirm the deployed analytics worker and Tally feedback flow immediately before submission because Play disclosures must match production behavior.

## Data collected

- App interactions: app opens, games started/completed, selected edition, player-count and round-count totals, Cast attempts/connections, session duration, and installed-app/browser launch mode.
- Device or other identifiers: a random installation identifier; the server stores only a salted hash.
- Diagnostics/device metadata: coarse platform category (Android, iOS, desktop, or other).
- User-provided feedback: anything a user voluntarily submits through the separately opened Tally form, including optional uploads and contact information if the form permits them.

## Data not collected by FlipCast analytics

- Player names
- Scores or game history
- Precise location
- Contacts
- Financial information
- Photos or files, except an optional upload deliberately submitted to Tally
- Advertising ID
- IP address retained by the analytics application (hosting/network providers may process ordinary request data)

## Purpose and handling

- Purpose: analytics and app functionality/improvement.
- Sharing: do not answer “not shared” until Play's definition has been checked against Cloudflare/GitHub/Tally service-provider processing.
- Encryption in transit: Yes (HTTPS).
- Deletion: raw analytics events are deleted after 90 days; aggregate counts may remain. The random installation ID can be reset by clearing app/site data. The app currently has no account-based deletion-request workflow.
- Optionality: anonymous analytics can be disabled in the Privacy screen; Tally feedback is optional.

## Local-only game data

Player names, scores, history, and statistics stay in browser/app storage. Under Google's definition, data processed only on-device and never sent off-device is generally not declared as collected, but the current Play questionnaire wording must be followed.
