# FX3 adapter FW33/NAM port

This integration port uses the owner's inspected 939e3ef implementation and
historical muted Axe-Edit 1.15.01 comparisons. It is not new hardware acceptance.
The exact firmware identity is `33.00-beta.20261006`; raw 97.00, a different
date/checksum, FW33 final or a later beta does not enable it.

- 36 first-instance numeric controls: Amp8, Wah9, Delay4, Reverb3, Chorus4,
  Compressor2, Output1, NAM5. SET divisors/opcodes come from measured data.
- Exact zero only for Delay/Reverb/Chorus Level and NAM Input Gain/Level.
  Positive dB gain/levels and feedback over 60 percent are blocked. This is
  not a physical-volume limiter. Literal delay/chorus timing requires NONE
  independently read before writing, with no guessed FW33 tempo setter.
- NAM effect206 is separate from Chorus78 in full eight-bit grid decoding.
  Only Input1 -> NAM1 -> Cab1 -> Delay1 -> Chorus1 -> Reverb1 -> Output1 is
  buildable from a truly empty preset, scene1/A. An existing exact route may
  use scenes1/2 and NAM A/B; other blocks stay on shared A. No splicing,
  arbitrary model/CAB/mixer or modifier writes on FW33. The separately measured
  NAM slot selector is described below; it does not enable amp/effect models.
- Native NAM read/install: Windows, user-declared MK2, exact firmware and
  slots001-256 after explicit destination confirmation. Existing supported
  48kHz SlimmableContainer v0.7 A2 geometry
  with 1871/12146 finite weights. No downloaded code or Axe-Edit required.
  A creator's A2 label alone does not prove this geometry or tonal quality.
- Install is separately permanent: local browser-CSRF boundary, three strict
  acknowledgments, single-use ten-minute preview, fresh target/old hash,
  verified private recovery export, separate narrow traffic guard, complete
  65536-byte readback. Ordinary input is handed off to WinMM and reopened in
  finally. Unsupported MIDI backends decline before releasing input.
  Reconnection, profile, selected-model or memory changes invalidate approval;
  a matching slot hash on a different connection is not installation consent.
  NAM memory is shared: replacing a slot also changes other stored presets
  that reference it. An empty target does not prevent that effect; those
  references are not inventoried automatically. Review the overwrite warning.
- Inventory reads all256 names serially and suggests the first explicitly
  empty slot. A missing/malformed reply aborts inventory, not guessed emptiness.
  Selected destinations are independently exported in full before preview and
  again before commit; complete erased65536-byte memory is the empty state.
  Changing the target invalidates browser consent; the single-use token binds
  the actual slot and old full-memory state. A full bank requires a deliberate
  occupied-slot choice, never an automatic overwrite. This installs a capture
  in memory, not an implicit selector change in a preset. Explicit installed
  capture selection uses a separate state-bound reviewed preset plan.
- Store is separately permanent and reviewed, same current allowed preset,
  exact captured 23-byte command and settled flash-name readback. No Store As,
  automatic reload, rollback or implicit writes from an AI recommendation.

Historical preset326/slot001 test on 2026-10-08 and owner listening acceptance
on 2026-10-09 apply to the previous installation, not automatically this port.
Before deploying this integrated adapter: new identity/read-only check, muted
test-preset writes, independent Axe-Edit comparison, separately authorized
NAM/Store validation and low-volume user listening/physical pedal acceptance.
The offline phase ran with the Fractal off. Subsequent muted native TC API
tests on2026-10-09 installed the selected supported capture in authorized
slots250 and256 with full65536-byte hash verification and valid recovery
exports; NAM001 and the complete stored reference326 state stayed unchanged.
Independent Axe-Edit NAM manager confirms the names at250/256 without import
or Save; Axe-Edit is not the installer.
The name inventory reads all256 slots in both populated and empty preset
contexts. Address requests were independently captured from Axe-Edit before
native writes. Source and browser tests are not physical sound acceptance.
Remote GitHub CI and hardware regression are recorded separately. Ordinary pip wheels remain
unsupported as complete apps under upstream's resource policy; use the source
checkout/editable installation until a bundled distribution passes its own run.

## NAM player-selection acceptance, 2026-10-09

This chooses a capture already installed in memory. It never downloads,
installs or overwrites shared memory. Explicit request field `nam_slot` selects
the design capture; omission preserves the current NAM channel's capture, not
an implicit001. The request widget lists occupied slots from complete inventory.
Review shows the actual slot/name; failed inventory clears old choices. Install
and in-preset selection remain distinct, separately reviewed operations.

- With TC stopped, the user selected250 ->256 ->250 in Axe-Edit NAM Player1/A
  on preset328. A passive observer captured checksum-valid opcode09 parameter0
  frames with float32 ordinals249/255/249. Incoming buffers were unavailable
  to that observer; no incoming trace/readback is claimed. The visible editor
  showed250. Subsequent exclusive TC bulk independently returned249 at offset0
  in the complete four18-word NAM channel layout.
- After the editor closed, TC replayed256 and250 under a verified muted edit
  session, bypass and quiet-level staging. Complete bulk confirmed each ordinal
  and unchanged other channels. Full65536-byte NAM001/250/256 memories were
  checked before/after and unchanged. A changed selector stays quiet/bypassed
  until the reviewed design explicitly voices and engages that channel.
- Nonzero choices002-256 use the measured ordinal encoding, constrained to
  NAM Player1 and exact MK2/FW33. Hardware replay used250/256, not254 other
  destructive tests. NAM001 can be preserved as a read-only no-op; its zero
  selector SET is unmeasured and blocked when a real change is needed, before
  starting an AI request. Channels A/B remain the reviewed build scope.
- Actual registered API, live adapter and configured Codex build one-scene
  preset329 using250:41/41 actions verified. A second two-scene design uses256
  on NAM A/B:60/60 actions verified. This second request exercises the shared
  explained-rig reader and provenance report with pasted technical equipment
  text. It is not a live YouTube or listening test.
- Separate Store through the actual API succeeds. Diagnostic bank/PC switching
  329 ->328 ->329 reproduces complete state, including both NAM selectors,
  bulks, grid, modifiers, scene names and capture fingerprints. Stored reference
  326 and NAM001/250/256 are unchanged. Preset329 is `AI-NAM Slot Workflow`,
  two scenes. Cab is intentionally bypassed for this transport test, so this
  is not a complete tone or audible match. No automatic reload was enabled.
- Review/Store fingerprint the chosen full-memory capture plus all captures
  referenced by four NAM channels. Empty/incomplete chosen memory, changed hash,
  wrong slot, unknown channel or stale ticket refuses writes. Quiet staging,
  external mute and normal send consent remain mandatory. No generic selector
  frame is accepted without its exact one-operation permit. Ordinary FM9 guards
  and configured allowlists are unchanged.

Native install still requires supported capture geometry and exact firmware.
Arbitrary routing, CAB writes and controller bindings on FW33, zero-selector
measurement, live source-video regression, physical audition and remote CI
remain separate pending work. Axe-Edit is a comparison tool, not a dependency
of the native installer or preset writer. Local traces/reports stay private.
