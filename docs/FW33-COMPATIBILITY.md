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
  capture selector, model/CAB/mixer or modifier writes on FW33.
- Native NAM read/install: Windows, user-declared MK2, exact firmware and
  slot001 only. Existing supported 48kHz SlimmableContainer v0.7 A2 geometry
  with 1871/12146 finite weights. No downloaded code or Axe-Edit required.
  A creator's A2 label alone does not prove this geometry or tonal quality.
- Install is separately permanent: local browser-CSRF boundary, three strict
  acknowledgments, single-use ten-minute preview, fresh target/old hash,
  verified private recovery export, separate narrow traffic guard, complete
  65536-byte readback. Ordinary input is handed off to WinMM and reopened in
  finally. Unsupported MIDI backends decline before releasing input.
  Reconnection, profile, selected-model or memory changes invalidate approval;
  a matching slot hash on a different connection is not installation consent.
  NAM memory is shared: replacing slot001 also changes other stored presets
  that reference it. An empty target does not prevent that effect; those
  references are not inventoried automatically. Review the overwrite warning.
- Store is separately permanent and reviewed, same current allowed preset,
  exact captured 23-byte command and settled flash-name readback. No Store As,
  automatic reload, rollback or implicit writes from an AI recommendation.

Historical preset326/slot001 test on 2026-10-08 and owner listening acceptance
on 2026-10-09 apply to the previous installation, not automatically this port.
Before deploying this integrated adapter: new identity/read-only check, muted
test-preset writes, independent Axe-Edit comparison, separately authorized
NAM/Store validation and low-volume user listening/physical pedal acceptance.
The Fractal remains OFF during today's offline tests. Remote GitHub CI and
hardware regression must be recorded separately. Ordinary pip wheels remain
unsupported as complete apps under upstream's resource policy; use the source
checkout/editable installation until a bundled distribution passes its own run.
