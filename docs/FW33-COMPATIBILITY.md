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

## Explicit GUI navigation acceptance, 2026-10-09

Click the preset header to search freshly read preset names000-511; click a
named scene button to select scene1-8. The connection indicator says VERBONDEN
only when TC reports a connection. Names/status reads do not select anything.
Navigation has separate expiring, single-use, device/state-bound confirmation.
External mute is required; loading a preset additionally requires acknowledging
that unstored device edits will be discarded. Request text stays in the GUI,
but previous build approvals are invalidated. Navigation never performs Store.

The native exact-FW33 test selects all eight scenes on325 and presets324/325,
then compares complete325 state with its baseline. The actual browser reads
all512 names, selects scenes1/8/2 and presets324/325, verifies consent and
retained text, and checks1180/1280/1440 layouts without JavaScript errors.
No parameter, model, NAM-memory or Store writes are part of this test.
Scene selection has an exact one-operation frame permit; it does not extend
AI NAM builds beyond their measured scene1/2 scope. Generic automatic preset
reload, unknown firmware and arbitrary model/routing/controller writes remain
blocked. This native/browser result is not an independent Axe-Edit comparison
or physical loudness measurement. Test switching stayed within321-329;
other preset banks are not claimed as newly hardware-tested.

### Next independent FW33 measurements

FW33 model/CAB selection, free grid construction and new modifier allocation
remain deliberately disabled. This is not just a product-code difference:
the32.06 model roster/selection domains, CAB Legacy mixer layout and modifier
creation path are firmware-pinned. Identical-looking addresses are not new
readback proof. The current exact-FW33 grid permit covers only the accepted
NAM route. Human scene navigation does not extend that grid/build scope.

The next measurement pass needs an independently running Axe-Edit while TC
has explicitly released MIDI. First export a baseline of a test preset and
all32 modifier records, then passively capture a named AMP-model change, CAB
bank/slot change, isolated block/connection edit, and modifier creation/source
choice. After the editor closes, replay only the captured operation in TC
with external mute and compare full bulk/display/grid/modifiers, including
unchanged other channels. No globalCC mapping, firmware change or speculative
opcode is part of this work. A failure leaves the feature disabled.

The autonomous launch attempt was rejected by the execution environment before
execution. No editor was started and no blocked operation was retried through
another mechanism. A user-opened editor is required to resume this independent
measurement; native/browser navigation tests already completed without it.

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
- Choices001-256 use the measured ordinal encoding, constrained to NAM
  Player1 and exact MK2/FW33. Hardware replay used001/250/256, not256
  destructive tests. A later user-operated256 ->001 ->256 ->001 measurement
  on329 captured opcode09 zero twice. Visible editor selection001 and complete
  independent TC bulk ordinal0 confirm the final selection. Native TC replay
  256 ->001 ->250 ->001 independently verifies each selection, complete
  unchanged NAM001/250/256 memories, unchanged other NAM channels, other block
  bulks and grid. NAM remains quiet/bypassed. No Store or installation occurs
  in that selector-only pass. Channels A/B remain the reviewed build scope.
- The previous technical AI design is then recompiled for001, reviewed and
  sent through the actual registered API:60/60 actions, zero skipped. Both
  NAM A/B select001. Separate Store329 and diagnostic reload reproduce the
  full state; stored326 and NAM001/250/256 remain unchanged. This is not a
  new paid AI or sound-matching test. Mandatory and changed regression tests:
  268 passed. Graceful runtime restart loads the new code on the single8909
  instance; live state independently shows NAM001 on preset329/scene2.
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

## Actual YouTube, route exploration and NAM acceptance, 2026-10-09

The shipped GUI, actual selected Codex provider, encrypted TONE3000 account,
native installer and live MK2 adapter were tested with
[the user's Whole Lotta Love bluesrock reference](https://www.youtube.com/watch?v=Plwb_gfmSc4).
This is feature/transport acceptance, not a measured or audible recording match.

- Actual YouTube audio is downloaded and measured locally for60 seconds.
  The AI receives measurements, not isolated guitar or the raw recording.
  Exploration and planning reuse the same measurements for an unchanged
  source in the current browser session; changed URL/file/reset invalidates
  them. Browser tests cover repeat requests and changed-source isolation.
- Read-only route exploration considers AMP/CAB with pedals and NAM with
  effects. No route is silently selected. The user explicitly chooses an
  executable route; unsupported FW33 AMP/CAB remains a musical alternative,
  not a hidden NAM substitution. Detailed advice is separately collapsible.
  Real live catalog research using the short query `Whole Lotta Love`
  returns two candidates without selection, installation or preset writes.
- The direct song-related TONE3000 capture has a catalog name longer than the
  measured27-character ASCII header. Preview shows both names and adapts only
  the device label, not weights or compiler requirements. Native installation
  in authorized NAM252 verifies the complete65536-byte payload and keeps a
  verified private pre-write recovery export. No Axe-Edit is used.
- Empty325 builds the fixed NAM252 route with41/41 independently verified
  actions; a second actual GUI design extends it to Rhythm/Solo on NAM A/B
  with60/60 verified actions and zero skipped. The inventory is read again
  after refresh before selecting a numbered capture. No stale slot is reused.
- Separate GUI Store saves325 as `AI-Whole Lotta Love`. Diagnostic325 ->324
  ->325 reload reproduces the complete snapshot: grid, bulks,32 modifiers,
  both scene names, capture fingerprints and NAM252 on A/B. Stored reference
  326 and full NAM001/250/251/256 payloads remain unchanged. An earlier
  fallback JCM800 capture was separately installed in251 and its one-scene
  test remains stored on328. These are authorized test resources, not a
  product requirement to overwrite them or depend on Axe-Edit.
- Fresh numeric checks on saved323 independently verify Amp Drive/Bass/Mid/
  Treble/Master/Depth/Presence/Level, Compressor Threshold/Ratio and Output
  Level. Amp model, other channels, other block bulks, grid and modifiers stay
  unchanged. Diagnostic reload restores the entire saved323 baseline. This
  accepts existing measured numeric setters, not FW33 amp model/CAB selectors,
  controller bindings, extra block construction or complete FM9 parity.
- Final Windows SIM regression:4,426 passed,16 skipped,336.23s,eight workers.
  Fresh mandatory/changed regression:350 passed,128.12s,four workers. Real
  Chrome with shipped assets passes explicit route choice, cache reuse after
  request/NAM-search changes, changed-source invalidation and text safety.
  Actual live compact GUI/provider/catalog regression also passes. Public
  staged-file release tripwire passes; remote CI and manual review are not
  substituted by these local checks.

Native install still requires supported capture geometry and exact firmware.
Arbitrary routing, CAB/model writes and controller bindings on FW33, physical
audition and remote CI remain separate pending work. Axe-Edit is a comparison
tool, not a dependency of the native installer or preset writer. Local traces,
model files, private recovery exports and reports stay untracked.

## Free-grid measurement checkpoint, 2026-10-10

The user-operated Axe-Edit measurement was made on preset324 under external
mute. This preset has a nonempty parallel rig despite its EMPTY name. The
original rig and its wah/volume modifiers were preserved; two test blocks
were placed separately on the empty fifth row, not connected to the output.

- Exact outgoing frames capture Compressor1/Drive1 placement, their cable,
  cable removal and both deletions. The cursor is encoded independently of
  the insert payload. Captured insert payload positions differ from the
  selected target; do not silently substitute a calculated insert position.
- The cable add/remove bytes match the shared FM9 builder for this geometry,
  with the FX3 envelope and checksum. This does not establish every coordinate
  or block type, nor remove the shared builder's undecoded-coordinate limits.
- Native TC repeats ten exact captured frames on324 with a developer-only
  permit. Every step independently verifies the full grid and complete original
  block bulks, status,32 modifiers, scene names and referenced NAM memory hash.
  Final complete state equals the baseline. No Store, model/level write,
  installation, global mapping, move or automatic rollback occurs.
- After the native connection was released, the user reopened Axe-Edit.
  Independent visible-grid inspection confirms the original parallel route,
  block channels/bypass state and empty fifth row. The editor was not used
  to apply or save TC's native test writes.
- The fixture guard requires exact firmware, a muted preset-bound edit session,
  fresh selection, absent insert target, expected block identity and isolated
  cable/removal state. Other cells and presets remain blocked. This is not an
  AI action, HTTP endpoint or public deletion/parallel-build capability.
- New read-only topology checks preserve branches and fan-in instead of
  flattening them. Every cell must lie on a complete Input1-to-Output1 path.
  Dangling cells/cables, ambiguous status, malformed masks, multiple IO and
  feedback-capable blocks are rejected; physical loudness is not verified.
- Mandatory device/capability/UI-warning and changed-module regression:
  237 passed. After additional transport refusal tests, the final focused
  adapter/grid/topology regression passes187 tests. These are local Windows
  synthetic tests, not remote CI or sound-match acceptance.

Remaining promotion gates: independently measure other block-placement frames,
supported cable geometries and safe branch/move operations; verify each native
operation; then add a state-bound graph review and executor/GUI integration.
Current public FW33 builds remain confined to the accepted NAM route. Numeric
and model/controller availability remain separate from topology capability.

### Subsequent diagonal measurement and graph planning

The owner subsequently placed Compressor1 at row5/column1 and Drive1 at
row6/column2, connected them diagonally, removed the cable and deleted both.
The passive trace captures all ten operations with valid FX3 checksums. The
insert payloads are identical to the earlier fixture despite the different
Drive cursor position. Cable add/remove matches the shared FM9 builder for
this geometry. No incoming trace buffers are claimed.

After the user closed Axe-Edit, TC natively replayed all ten exact frames on
324. Full grid and every original block bulk, status,32 modifier records,
scene names and referenced NAM hash are independently checked after each step.
Final complete snapshot equals the baseline, with no Store, model/level,
global or memory writes. Only this developer fixture is extended; free-grid
UI/planner execution is still gated. Post-replay editor comparison is pending.

The next source seam is a read-only explicit graph contract. Proposed cells
use one-based positions plus a named block/instance or an explicit shunt;
cables name both adjacent endpoints. It refuses duplicates, undeclared cells,
missing paths, feedback blocks and incomplete device snapshots. The report
fingerprints the full baseline and lists differences and affected modifier
slots. A move remains a move with full-state preservation required; rewiring
around replaced nodes is reported even when cable coordinates are unchanged.
The list is not a safe transmission order, has no SEND token and cannot
authorize writes or overwrite blocks. Quiet staging and parameter/scene/
modifier preservation still need an independently accepted graph executor.

Actual read-only TC inspection of parallel324 verifies zero changes for the
identical graph and a three-operation extra Compressor branch proposal. The
proposal writes nothing and preserves the complete before/after device state.
The first read-only check exposed the real numbered, blank scene-name replies;
validation and regression now accept those complete replies, not invented
nonempty scene names. Private traces/reports remain outside Git.

Final mandatory device/capability/UI-warning plus changed adapter/grid/graph
regression passes286 tests on Windows, four workers. These tests do not promote
the proposed graph operations into general FW33 hardware capabilities.
Subsequent packaging/maintenance and graph/fixture regression passes107 tests.
A local wheel build includes all three new grid/graph modules and excludes
private KB/backups. This is a package-content check, not an installed GUI or
remote CI claim; the upstream wheel resource/startup boundary remains unchanged.
