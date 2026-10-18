# Axe-Fx III firmware migration

FW33 extends the FW32.06 implementation; it must not silently replace or discard
accepted functions. Reuse the shared musical behavior, validation and tests.
Retain firmware-specific encoders and independently verify device writes before
releasing a new profile. Unknown firmware stays read-only.

## Parameter coverage

The baseline has 75 first-instance parameter definitions. The exact tested
`33.00-beta.20261006` profile retains 62 and adds eight: five NAM controls, two
compressor automatic-mode controls and GEQ Q. Thirteen old definitions remain
pending. Definition coverage is not permission for every model, channel,
instance, route or scalar-zero value.

| Legacy group | FW33 migration |
|---|---|
| Amp (8), Cab (12), Delay (4), Reverb (3), Chorus (4), Output (1) | Definitions retained. Seven Amp knob encoders are firmware-specific; the measured route/channel/model boundaries still apply. |
| Drive (4), Compressor (6), GEQ (11) | Definitions retained; normal AMP/CAB building uses the measured T808 Mod, Modern VCA and 10 Band Variable Q profiles. Other legacy effect models are separate work. |
| Wah (10) | Nine definitions retained, with a different Level encoder. Scalar Wah Control remains pending. Modifier binding has separate acceptance below. |
| PEQ (11) | All five frequency/gain pairs and Level need FW33 numeric/model/channel acceptance and planner integration. |
| Pitch (1) | Pitch Level needs FW33 acceptance. The old Level setter never established musical pitch shifting. |

`firmware_parity.py` derives the inventory from the actual registries. Tests
require every missing definition and changed encoder to be explicitly accounted
for; removing another entry fails the migration contract. Extra instances are
checked separately: Amp 2 and additional Cab, Delay, Output, Reverb and Wah
numeric instances are not released by first-instance metadata.

## Wah controller acceptance

On 2026-10-18, the owner confirmed external audio muted. Axe-Edit captured native
allocation, External 1/2 source changes and Auto Engage Off/Fast Pos for Wah 1/2
on test preset 323. Complete native 25-word records matched the earlier FW32.06
comparison records. Eight direct existing-binding operations passed independent
full-state checks and fresh Axe-Edit inspection.

A normal reviewed 14-block fixture was built in empty preset 324 without Store.
Five further checks covered device-native Wah 1 modifier creation, both source
values and both modes. Fresh Axe-Edit confirmed External 2, full 0..10 range, linear
mapping and Auto Engage Off. The ordinary registered controller review/SEND
then changed that binding to External 1/Fast Pos and rejected token replay.

The controller workspace now reuses `pedal_control.py` on FW33/MK2. Each FW33
write has a single-use exact-frame boundary, full modifier and device-state
readback, and preservation checks. Only the target wah's bypass may respond to
source/Auto Engage changes. No global CC mapping or synthesized transfer curve
is written. Volume/Pan remains FW32.06-only until independently migrated.

Use CONTROLLERS in the shelf for this separate workflow. The FW33 tone planner
still does not combine wah voicing, scene states and controller allocation into
its normal AMP/CAB build. It must disclose that remaining integration gap rather
than claim a completed wah preset. Physical pedal movement and audible bypass
remain user acceptance checks.

## Remaining functional migration

- Connect the accepted wah operations to musical design, scene verification,
  controller review and refinement without clearing existing modifiers.
- Measure Volume/Pan binding, missing numeric parameters, extra instances and
  remaining effect model/channel domains. Preserve unrelated records on every
  test; an unchanged parameter address alone is not acceptance.
- Bring the more flexible FW32.06 construction/insertion behavior into the
  normal FW33 planner. Developer graph captures do not release arbitrary graph
  building, Send/Return loops or destructive reconstruction.
- Keep the eight-scene AMP/CAB and narrow NAM paths separate until their expanded
  routing/controller behavior is accepted. Keep recovery, Store and NAM-memory
  installation separately consented; no automatic write retry or rollback.

No preset was stored during this migration acceptance. Presets 326 and 328
were not changed. Static level/feedback limits and readback are not an audio
limiter or a claim of an audible recording match.
