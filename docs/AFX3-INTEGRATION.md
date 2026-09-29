# Axe-Fx III upstream integration

## Status: adapter and execution seam, not an enabled application feature

Worktree: `integration/axefx3-upstream-20260929`, based on upstream
`c2c8a8789b0f065e2a5d37d0b359fbb33d28fdb1` (after 1.5.3).
Source for the port: owner checkpoint
`18f8eac0b49820c8fb7c4248f76bfacacc6b6feb`.

This is a deliberate port, not a completed merge. The original installation,
private settings, cab imports and presets remain separate and unchanged.
The adapter is **not registered in device selection or the server** yet.
Installing these modules does not replace the owner's working application.
No publication, paid AI request or hardware session is part of this stage.

The upstream gitignored knowledge base is absent. The owner explicitly
authorized continuing offline with public source/docs and the earlier fork's
evidence after being informed of that gap. No missing evidence has been
invented; the invariant safety guard and whitelists are unchanged.

## Why this is not an FM9 model-byte substitution

The framing/packing and parts of the Gen-3 read protocol are shared, but the
earlier catalog comparison found 492 named records with different parameter
IDs. Even within one AFX3 block, SET domains differ from displayed values
and from bulk-read normalization. The captured effect zero SETs also differ
from an FM9 generic ordinal-zero workaround.

`devices/axefx3` therefore has its own transport, registry, protocol boundary,
firmware-pinned evidence and package-local model data. It reuses only shared
packing, parsers, names/aliases, result types and the adapter contract. It
does not inherit `FM9`, mutate its protocol defaults or enable its automatic
global routing restoration/reamp path. Firmware 32.06 is the only writable
profile in this foundation; other firmware is read-only.

## What the newer upstream can contribute

The upstream amp sidecar contains exact-name factual metadata for 330 of
the 336 models in our FW 32.06 inventory. In this particular comparison their
ordinals also match, but `Registry.load_amp_facts` joins by unambiguous name,
never by ordinal. Six models have no
exact matching record and must not receive invented descriptions. These
facts (amp identity, intended cab, control layout) are useful reasoning
input; they do not authorize additional DSP parameters or model writes.

Upstream also adds cab identity/microphone metadata, per-scene recording and
measurement-driven balancing/tone-match modules. The pure measurement and
proposal code can be reused. The audio/device side cannot simply be enabled:
`fm9/reamp.py` selects an FM9 with 48 kHz, 8-in/8-out assumptions, and the
global routing/restore path is FM9-specific. Device-specific verification
must precede AFX3 audio capture or automatic level corrections. An analysed
reference alone still does not prove that the produced preset sounds alike.

## Implemented and tested offline

| Component | Boundary retained in the port |
|---|---|
| Connection/readback | Model/checksum filtering, addressed replies, complete bulk blocks, passive display reads; no model-selector query |
| Scalars | 39 individually mapped controls, finite/range checks, independent display verification and captured zero setters |
| Delay time | Independently verify bulk plus display Tempo NONE before writing milliseconds; failed dependency stops the time write |
| Legacy cab mixer | IRs 1-4, channels A-D, full-block comparison; levels, pan and normal/mute/solo are distinct from IR selection |
| Models | Separate readable/selectable rosters; matching model is a no-op, changes are bypassed and quiet-staged with other-channel checks |
| Writes | Explicit external-mute acknowledgement and target preset; changed firmware/preset aborts, no automatic store or reload |
| Restore | Only independently established bulk laws, exact word verification, no guessed alternate opcode |
| Batch | Validate all static values before the first write, stop after the first failed verification |
| Cab lists/selections | Atomic Factory/User name imports with explicit bank/slot bounds; independent IR1/IR2 selection, preserving other slots and mixer state |
| Grid | Empty-grid serial construction or exact existing-route reuse; no implicit overwrite, flattening, deletion, preset reload or flash store |
| Modifiers | Inspect all 32 slots, refuse unassessed active targets/curves; reassign an existing usable Wah Control source to External 1/2 without changing its curve |
| Execution seam | Preflight the whole action list and route before construction; explicit model channel/final level, first-failure stop, partial-edit recovery warning |
| Transport cleanup | Release the input if opening the output fails on either backend; no FM9 invariant-guard change |

Unknown readings fail closed. A successful command receipt is not a
successful verification. None of these checks measures loudness, pedal
movement, sound quality or audio feedback, and none is a physical limiter.

Model selection resets a channel's voicing. The executor must choose the
channel/model before setting gain/EQ/effect parameters. IR slots 1 and 2 do
not mean stereo pan; a selected IR may still be muted or excluded by solo.

## Remaining integration gates

1. Verify the new read paths and an actually working, device-built Wah
   modifier on the unit. The old from-scratch defaults omit transfer-curve
   fields, so the new path deliberately does not create a fresh curve.
   Existing source readback does not prove physical pedal/global CC mapping
   or sweep. A new-empty-preset plan requiring that binding is rejected
   BEFORE building any blocks until this gap is resolved.
2. Connect the adapter through upstream device contexts, capability gates,
   planner reference, manual controls, send preflight, staging and recovery.
   Do not expose FM9 reamp/capture or startup global-restore actions to AFX3.
3. Deliberately reconcile the owner's audio-reference and conversation UI
   with upstream's newer sound-check/tone-match and amp/cab metadata features.
   Preserve provider choice, no paid fallback, and measured-vs-heard labels.
4. Run focused and full offline regressions plus UI/package checks on that
   integrated path, not just the independent adapter.
5. After the complete application path is verified offline, reconfirm external
   mute and use only authorized
   test slots 321-329. Compare with Axe-Edit and independently read all four
   scenes. Human listening and physical pedal tests remain necessary.

Hardware is intentionally off during this foundation work. Historical
[2026-09-19 acceptance](AFX3-PARITY-2026-09-19.md) documents the old code,
not a hardware pass for this port. A stored preset reload can discard all
unsaved work; permanent storage and global pedal changes require separate
explicit permission. Neither operation is enabled in this adapter.

### Next hardware checkpoint: read-only, not the integrated server

After the owner confirms power and external mute, stop TC and Axe-Edit so
only one process owns MIDI. From this integration worktree run:

```powershell
.\.venv\Scripts\python.exe -m tools.afx3_integration_readback --hardware-read-only
```

This tool refuses `TONECOMMAND_SIM=1` rather than labelling simulation as
hardware. It imports no server, enters no edit session, and does not change
the selected preset, scene, channel, global mapping or stored data. It reads
the current channels, passive models/parameters, cab mixer, grid and modifier
slots, with before/after preset, scene and block-status consistency checks.
Keep any raw user-preset/modifier reports private under ignored backups.

The physical pedal's connection point must be known before deciding whether
External 1 is the right source. Missing or structurally plausible curve words
are not permission to synthesize a transfer function. A separately reviewed
Axe-Edit comparison and physical sweep test are still needed. The broad
modifier/topology capabilities remain disabled: these narrow internal
operations do not implement every upstream editor operation.

## Verification record

The original fork baseline passed 2,691 tests with one skip in UTF-8 mode.
Unmodified upstream passed 2,459 with 21 skips and one environment failure:
this Windows account cannot create a symbolic link (WinError 1314). The test
now explicitly skips only that unavailable prerequisite, without weakening
the application's path containment check or swallowing other OS errors.

191 targeted adapter/profile/model/cab tests pass locally on Python 3.12.10.
These use independent scripted ports and test doubles, not FM9Sim posing as
an AFX3 and not an acoustic/hardware acceptance claim. Full integration
baseline and foundation JUnit reports are kept locally under
`backups/integration-20260929/`.

Final upstream-plus-foundation run: **2,650 passed, 22 skipped** in 263.38 s
with `TONECOMMAND_SIM=1`, `PYTHONUTF8=1`, Python 3.12.10 and six pytest
workers. Report: `adapter-foundation-final.xml`. The required device-handle,
capability-gates and UI-warning run separately passed **54 tests** in
123.23 s; the focused adapter, packaging and site suite passed **207 tests**.
The preceding full run exposed a bad generated documentation link; that was
corrected before the final all-green run. Skips include the unavailable
Windows symlink prerequisite and 21 existing upstream skips.

A wheel was built and the adapter plus both packaged JSON model inventories
loaded directly from that wheel under isolated Python (`-I`), without opening
MIDI. This checks the new package's resource inclusion, not a complete
installed-GUI or frozen-application acceptance test.

The repository's required device-handle/capability/UI-warning suite must
also pass before each commit. CI, another computer and the real device
remain unproven until their own runs exist. No push/PR is authorized yet.

### Cab, routing and modifier checkpoint (2026-09-29)

Final full run: **2,751 passed, 22 skipped** in 365.23 s with the same
Python 3.12.10, UTF-8/SIM environment and six workers. JUnit:
`routing-final.xml`. Required gates separately: **54 passed** in 128.52 s
(`routing-final-required-gates.xml`). Focused adapter, transport, packaging
and site suite: **318 passed** in 11.62 s (`routing-focused.xml`). Reports
remain private in `backups/integration-20260929/`.

The wheel build and isolated imports also pass, including all six new AFX3
modules, the read-only inspection tool and firmware-pinned JSON resources.
Wheel SHA-256: `7c5992e59765b99a0b7550dc7cd3cf5cf2c7d9599ceb767fe8983232bb3aa61e`.
The first no-build-isolation attempt lacked setuptools in the virtualenv;
the normal isolated build then succeeded. No application dependencies or
the working installation were replaced for this check.

No MIDI port was opened and no real-device result is claimed in this run.
The owner has been asked to power on the muted unit, release its MIDI port,
and identify the pedal connection for the next read-only checkpoint.

### First real-device read-only observations (2026-09-29)

The owner supplied an existing Wah preset on FW 32.06. Independent reads
confirmed Cry Babe, one External 1 binding targeting Wah Control, and a
complete 25-word modifier record. During 180 passive samples, Control read
0 while both bypass states were observed; the modifier record was equal
before and after. This is not an acoustic sweep or measured pedal range.
The report now explicitly labels modifier-controlled display values as
unverified effective values rather than treating zero as a dead pedal.

Axe-Edit was opened separately after releasing the observer's MIDI port.
Its Wah page independently showed Modifier Enabled and Cry Babe. The user
reports that its bypass/enable follows their pedal. A later UI observation
held a fixed display value; the two observations were not simultaneous and
must not be used as a calibration comparison. A separate 25-second USB
input-only listen received no CCs; this does not establish absence of CCs
on the controller's hardware-MIDI link.

The owner's separate controller source uses configurable CCs and hardware
serial MIDI. No controller-specific CC mapping is embedded in TC. That
other project was inspected but not modified or flashed. All captures,
raw curves, preset identities and source-review details remain private in
ignored backups. No preset/scene/channel, parameter, global setting or
store was written by this inspection. A working fresh-binding write and
its audible sweep remain unverified; an existing curve read is not a SET
encoding calibration or permission to write unknown fields.

Changed inspection/modifier tests: **18 passed**. Required device-handle,
capability and UI-warning checks: **54 passed** in 112.46 s. Report:
`pedal-readback-gates.xml`. The earlier complete-suite result above remains
the last full run; these changes have focused, not repeated full-suite,
coverage.
