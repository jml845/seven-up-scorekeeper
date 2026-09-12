# Google Play Console checklist

## Owner actions needed before the first upload

1. Confirm the Play Console developer account and whether it is Personal or Organization.
2. Accept the Android SDK terms before the local build toolchain is installed.
3. Choose the public developer name and support email.
4. Pay Google's developer registration fee if the account is not already active.

## Build and signing

1. Generate an upload key and store it outside Git. Back it up with its passwords.
2. Build an Android App Bundle (`.aab`) with package ID `com.flipcast.scorekeeper`, version code 1, version name 1.0.0.
3. Create the Play Console app and enable Play App Signing.
4. Copy both SHA-256 fingerprints into `/.well-known/assetlinks.json`:
   - local/upload signing fingerprint for directly installed test builds;
   - Play App Signing certificate fingerprint for Play-delivered builds.
5. Deploy that file and verify it returns HTTP 200 with `application/json` or `application/json; charset=utf-8`.
6. Confirm the installed app opens without a browser toolbar. A toolbar means Digital Asset Links verification failed.

## Store setup

1. Paste the copy from `PLAY_STORE_LISTING.md` and upload `store-assets/`.
2. Add the privacy-policy URL and support email.
3. Complete App access: all functionality is available without an account.
4. Complete Ads: No, unless ads are added later.
5. Complete Content rating questionnaire honestly; the expected result is suitable for broad audiences.
6. Complete Target audience; the app is a general game-night utility, not specifically directed to children.
7. Complete News apps: No.
8. Complete Data safety using `DATA_SAFETY.md` and verify it against the production analytics endpoint before submission.

## Testing and production

- Run internal testing first on at least two Android versions and one Chromecast/Google TV environment.
- Verify fresh install, offline relaunch, game completion, app update, analytics opt-out, privacy link, Cast connect/disconnect/reconnect, and data retention after update.
- For Personal developer accounts created after November 13, 2023, Google currently requires a closed test with at least 12 testers opted in continuously for 14 days, followed by a production-access application.
- Do not press **Send for review** or publish to production without the owner's explicit approval.

## Authoritative references checked September 12, 2026

- TWA quick start: https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- Personal-account testing: https://support.google.com/googleplay/android-developer/answer/14151465
- Intellectual property: https://support.google.com/googleplay/android-developer/answer/9888072
- Store-listing practices: https://support.google.com/googleplay/android-developer/answer/13393723
- Impersonation policy: https://support.google.com/googleplay/android-developer/answer/9888374
