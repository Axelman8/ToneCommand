# Closed MK2 Beta 5 Amp calibration

This is a separate follow-up to #289/#290, not an automatic firmware upgrade
or general Axe-Fx III Beta 5 release. The ordinary adapter, default writer
profile, AI planner, NAM, global controls and slot policies are unchanged.
This development branch does not replace the owner's full working fork.

## Explicit opt-in and narrow contract

The reviewed Amp experiment must already be explicitly enabled with
`TONECOMMAND_AXEFX3_REVIEWED_AMP=1`. A second process environment setting,
`TONECOMMAND_AXEFX3_REVIEWED_AMP_PROFILE=mk2-beta5-calibration`, selects this
closed profile on the existing connection. Without it, the earlier measured
profile keeps its original full-response identity pin and refuses Beta 5.
Unknown profiles do not fall back. Mark I and Turbo are not promoted.
Native opening additionally requires the measured Windows, 64-bit Python
3.12 and mido environment. Explicit injected ports remain an offline test
interface, not an arbitrary-code security sandbox.

Only the independently observed full identity SHA-256
`15e9277d25e2180599d6d8a9d1fda73373ee592cdc0ce8682a1f7c007b67a616`
is recognized. Its label is `33.00-beta5.20261026`, not the misleading raw
97.00 fields. This identity recognition grants no other operation family.

Only four captured SET frames are accepted:

| Amp 1/channel A control | Allowed displayed values |
| --- | --- |
| Gain | 4.6, 5.0 |
| Mid | 5.0, 5.6 |

The exact preexisting encoder output must match the independently captured
literal, including checksum. Values are not coerced, clamped or inferred.
Both proposal inspection and the final one-use output permit enforce this
restriction. Other parameters, model changes, zero setters and other values
remain refused even though the older writer has wider bounds.

The current target must be disposable wire preset327, scene1. The complete
grid must contain only Amp1/A at row1/column1, no shunts, I/O or cables, with
the Bassguy Bright model already selected and independently displayed Amp
Level at most -12dB. All32 modifier records must be inactive and unassigned.
TC does not build, select, repair or clear this fixture to make it eligible.
The form shows the calibration limits and disables uncaptured values.

## Preservation, confirmation and refusal

The existing bridge, host lock and PLAN/REVIEW/CONFIRM/SEND screens are reused.
Prepare, Review and ARM do not write. Target/mute acknowledgements and the
player's explicit SEND click are still required. Native expiry, replay,
Gig Lock, connection/scene changes and the maximum one-unit change remain
enforced. No automatic retry, rollback, Store, reload or Undo is offered.

In addition to all568 Amp words, all32 complete modifiers and the existing
name/status surface, this profile reads the complete grid, the independent
level display, and the complete controller blocks200/201 (1525/350 words).
The native 65535 sentinel in controller data is preserved verbatim; this
does not permit65535 in Amp/modifier values or add any controller SET.
Every observed word and field except the addressed Amp A word and its
independent display must remain identical. Settling retries are reads only.
An uncertain result latches the connection and does not repeat a SET.

The disconnected fixture and level policy are calibration boundaries, not a
physical volume limiter. Keep external monitoring muted. This fixture is
not a playable preset and cannot establish tone, loudness or pedal quality.

## Evidence and what remains

Independent fake-port tests cover literal bytes, grid decoding, controller
sentinels, strict fixture/value limits, old-profile refusal, context drift,
uncertain outcomes, and the registered HTTP phase sequence. The shipped
controller has a calibration-value regression in its DOM/clock/HTTP harness.

Native preparation/review/confirm was checked with an extra GET-only final
boundary and zero SETs. A separately requested Gain5.0 to4.6 SEND then passed
the registered route and complete-state verification. Fresh Axe-Edit
independently confirmed Gain4.6, Mid5 and Level-12 on the unchanged isolated
fixture. No flash storage or reference-preset writes were performed.

Final-source browser/native and Mid acceptance are recorded separately in
the review description/evidence index; preparation is not that proof. Until
those final checks complete, this is not a native-accepted integration.
Even after them, only this closed calibration contract is established.
Other amp models, values, arbitrary routes/presets, firmware, MK1, physical
audio and the normal text-driven preset builder require their own evidence.
