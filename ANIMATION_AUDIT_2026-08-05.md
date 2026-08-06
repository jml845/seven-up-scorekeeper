# FlipCast animation audit — 2026-08-05

## Outcome

The phone effects are lightweight CSS/image animations. The reliability defect was concentrated in the Cast receiver's video path. Build 68 changes the receiver so every effect has immediate motion, only one decoder-heavy video runs at a time, and a stalled video cannot leave a frozen first frame on screen.

## Confirmed defects

- The receiver marked a video `ready` on `loadeddata`. That event means a first frame decoded; it does not mean playback started. The static frame then hid the fallback artwork.
- A player contributed only its highest-priority effect to the queue. If several flags remained active, lower-priority effects could remain blocked indefinitely.
- Repeated score updates can briefly interrupt a video element while the scoreboard is rebuilt. There was no explicit `play()` recovery after reinsertion.
- Six video elements were warmed at startup. Even metadata-only initialization creates avoidable network and decoder pressure on weak Cast hardware.
- The existing fallback posters for fire, freeze, and electricity were static PNGs, so a failed video looked like a broken animation.
- If the currently playing effect disappeared, its watchdog was not cleared immediately.

## Build 68 corrections

- A video becomes visible only after the `playing` event.
- `waiting` or `stalled` immediately reveals the fallback layer; playback can recover without showing a frozen frame.
- Playback is started/restarted explicitly after every render. A video that never starts fails over after 4.5 seconds, while the 15-second queue watchdog remains the final safety net.
- A transient `play()` rejection caused by moving the live video during a score refresh reveals the fallback but does not prematurely discard the effect; the bounded start timer handles genuine failure.
- Fire, freeze, and electricity use the existing 900×240 animated WebP artwork as their fallback (306 KB, 345 KB, and 81 KB respectively).
- Startup warms only lightweight artwork; it no longer initializes all six video decoders.
- Every simultaneous effect is queued in priority order: bust, Flip 7, ×2, freeze, fire, electricity.
- Only the active queued effect renders artwork, preserving true one-at-a-time playback and reducing compositing load.
- Removing an active effect now clears its watchdog before the next effect starts.

## Validation gates

- JavaScript syntax checks for sender, app, and receiver.
- Existing rules/statistics/cache-version tests.
- New deterministic assertions for playback readiness, animated fallbacks, all-effect queueing, serial artwork, and lightweight warm-up.
- Headless Chromium runtime harness confirms all six simultaneous effects execute once, in priority order.
- Mirrored receiver source/hash comparison before deployment.
- Live app and receiver build/version checks after GitHub Pages deployment.

## Build 70 adaptive concurrency

Build 70 increases visible concurrency without increasing decoder concurrency:

- Up to four different player cards may animate together.
- One priority effect receives the original full-resolution video path.
- Up to three other players receive lightweight high-resolution animation: animated WebP for fire/freeze/electricity and GPU-composited motion for bust/Flip 7/×2.
- Secondary effects run for a bounded six seconds and are not replayed later as duplicate videos.
- The scheduler avoids putting two simultaneous effects on the same player card, protecting text readability.
- One video decoder remains the hard maximum. Abandoned/timed-out video elements are paused and removed immediately.
- A new Chromium runtime gate verifies exactly one video plus three lightweight effects under a four-player simultaneous load; the existing single-player gate still verifies that queued effects are never lost.
