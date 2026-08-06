# FlipCast Cast-connection audit — 2026-08-05

## Symptom

The installed PWA intermittently returned `invalid_parameter` while starting a Cast session and recovered only after one or more force-closes.

## Findings

- The published receiver and live receiver URL are healthy; the failure occurs before scoreboard messaging, in the Web Sender session request.
- The sender allowed overlapping `requestSession()` calls because it had no in-flight guard or busy state.
- It used `ORIGIN_SCOPED` auto-join with saved-session resume enabled. That permits a stale session belonging to another page instance on the same origin to be considered during startup.
- Failed or incomplete sessions were not ended before the next request.
- `invalid_parameter` was logged but no sender recovery occurred, leaving force-close/reload as the only reset.
- Repeated SDK availability callbacks could reapply options unnecessarily.
- Diagnostics asked the context for a session state using the wrong object; session state belongs to the current Cast session.

These are concrete sender defects and plausible causes of the intermittent failure. The device-side Google Play Services state cannot be proven from server logs alone, so build 69 also keeps a bounded local error history for any remaining device-specific failures.

## Build 69 corrections

- Suppress overlapping session requests and visibly pulse/lock the Cast button while connecting.
- Use page-scoped auto-join with `resumeSavedSession:false` to avoid stale cross-page sessions.
- Detect an already-connected session without opening another chooser.
- End failed/incomplete sessions before requesting a new session.
- Wait up to one second for the framework to confirm stale-session removal instead of assuming cleanup is instantaneous.
- On a non-cancel error, end the session, reapply sender options, and prompt for one clean retry inside the still-open app.
- Recheck Cast availability when the PWA returns to the foreground.
- Record the last ten errors with timestamp, Cast state, and the real current-session state.

## Validation

- Sender JavaScript syntax and the complete app test suite.
- Static assertions for request serialization, page-scoped options, stale-session cleanup, and recovery.
- A headless-Chromium sender harness simulates `invalid_parameter` on the first request and verifies that the second tap succeeds without reloading or force-closing.
