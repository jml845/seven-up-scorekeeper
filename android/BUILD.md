# Android build and signing

The Trusted Web Activity project is in `android/twa/` and was generated with Bubblewrap 1.25.0. It targets Android API 36 and uses package ID `com.flipcast.scorekeeper`.

## Release identity

- Version name: `1.0.0`
- Version code: `1`
- Upload-key alias: `flipcast-upload`
- Upload certificate SHA-256: `96:92:44:72:86:F8:B7:26:9A:38:92:A5:D4:90:23:0E:40:F0:4F:54:F2:EB:9D:33:F7:DA:18:C5:E5:8A:E5:1C`
- Release bundle: `release/flipcast-1.0.0.aab`

## Sensitive signing material

The upload keystore and generated password file are intentionally outside the repository:

- `/home/jml845/.openclaw/credentials/flipcast-upload.keystore`
- `/home/jml845/.openclaw/credentials/flipcast-upload.env`

Both files have mode `0600`. Back up both together in a secure password manager or encrypted archive before the first Play upload. Losing the upload key is recoverable through Play's upload-key reset process, but keeping a verified backup is substantially easier.

## Digital Asset Links

`/.well-known/assetlinks.json` currently trusts direct builds signed with the upload key. After Play App Signing is enabled, add the Play App Signing certificate SHA-256 fingerprint as a second entry in `sha256_cert_fingerprints`, deploy it, and verify the live URL before closed testing.

## Rebuild

Use JDK 17 and the installed Android SDK. Never place keystore passwords in Gradle files or commit them. The release build used Gradle's injected signing properties loaded at runtime from the private environment file.
