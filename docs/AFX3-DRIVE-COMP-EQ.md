# Existing Drive, Compressor and EQ core controls

## Muted hardware checkpoint, 2026-10-06

Owner authorized TestPreset 323, confirmed external audio stays muted and
placed the test blocks manually. No permanent Store was authorized or sent.
The captured serial route was Input 1 -> Drive 1 -> Compressor 1 -> Amp 1 ->
Cab 1 -> GEQ 1 -> PEQ 1 -> Output 1. All four new test effects remained
bypassed after testing. Amp, Cab, Input and Output settings were preserved.

Passive Axe-Edit III outgoing evidence:
`20261006-105543-drive-comp-eq-main-323.jsonl`, with guarded numeric UI
events in `effects-ui-events-20261006.jsonl`. Independent native TC
`tone_review.Reviews.prepare/send` then verified **88/88** writes across
32 controls: test values, separately captured zeros where applicable, and
restoration to the independently read starting values. Checkpoints are
local/gitignored in `backups/integration-20260929/effects-tc-*.json`.

Full bulk checks verified unchanged Input/Amp/Cab/Output, other effect
channels, grid, modifier records, names and block/channel/bypass states.
An additional native review verified **8/8** engage/bypass round trips,
returning all four blocks to bypass with exact full-state equality.
Parameter acceptance is on channel A. Per-scene A-D compilation is tested
offline, with read-only mode/layout checks for every future selected channel.
It is not evidence that every model, filter type or instance is supported.

## Captured units and profiles

| Existing first block | Mode gate | Controls | SET 01 09 float |
|---|---|---|---|
| Drive, EID 118 | Rat Distortion, word 0 = 0 | Distortion, Filter, Level, Mix | knob / 10; Mix / 100 |
| Compressor, EID 46 | Modern VCA, word 12 = 0 | Threshold, Ratio, Attack, Release, Level, Mix | literal dB/ratio; time in seconds; Mix / 100 |
| GEQ, EID 50 | 10 Band Variable Q, word 15 = 4 | Ten band gains, Level | literal dB |
| PEQ, EID 54 | filter words 15-19 = 0 | Five frequencies, five gains, Level | literal Hz/dB |

Compressor threshold, GEQ band 1 and PEQ frequency 1 really use parameter
ID 0. Treating every pid 0 as a model selector breaks both reading and
writing these settings. The narrow first-block exception permits passive
01 10 display queries and canonical numeric SETs, not model-selector GETs
or an active zero SET masquerading as a query.

GEQ band order: 31/63/125/250/500/1000/2000/4000/8000/16000 Hz.
PEQ filter types remain Shelving/Peaking/Peaking/Peaking/Shelving. The Q
wheel generated increment/decrement gestures, not a captured absolute
numeric setter. Q is therefore deliberately not writable in this checkpoint.

## Application and safety boundaries

The AI design schema accepts optional `drive`, `compressor`, `geq` and
`peq` per scene. Deterministic compilation selects the corresponding
channel, bypasses while voicing, writes the final level and applies the
requested final bypass state. Omission preserves existing settings.
The browser review shows the extra voicing, optional model and units per scene.

These four blocks must already exist, with Drive/Compressor before Amp and
EQ after Cab. Omitted Drive/Compressor model choices preserve their models;
EQ filter types, Q and modifiers are always preserved. A complete
bulk layout and the mode on every addressed future channel are validated
before the first plan write, and rechecked in each display setter. A failure
stops the batch; partial edits can remain. No guessed fallback opcode,
automatic rebuilding, extra insertion or global controller setup is enabled.

Drive Level is a 0-10 knob, **not dB and not calibrated unity gain**. Only
the pinned captured AFX3 Drive profiles have a 0..5 automation allowance. FM9 generic
unknown-unit level controls retain their refusal. EQ gains and effect dB
levels remain <= 0. Compressor attack/release in the design are milliseconds.
External mute is still mandatory; none of these limits measures loudness,
feedback stability or prevents damage independently of the physical setup.
No audio comparison, positive EQ boost, raw restoration or acoustic match
has been proven by this test. Automatic insertion of these families remains
a separate evidence gate.

## Captured model-selection follow-up, 2026-10-06

The owner manually opened Axe-Edit after TC released its MIDI port. Passive
capture `20261006-125928-drive-comp-models-323.jsonl` recorded five model
selectors and numeric controls in the newly selected profiles:

| First block | Model selector | Captured selectable models |
|---|---|---|
| Drive 1, 118 | 01 09, pid 0 | Rat Distortion (0), T808 OD (6), T808 Mod (8) |
| Compressor 1, 46 | 01 09, pid 12 | Modern VCA Compressor (0), Classic VCA Compressor (13) |

Zero model writes were followed by independently observed return to the
named model, not accepted merely as ambiguous zero/get capture events.
Axe-Edit was closed normally before native TC took the MIDI port. Native
`tone_review.Reviews.prepare/send` verified **81/81 actions**: all five
model transitions, captured numeric values, supported zeros and restoration
of starting display values. Passive bulk independently confirmed return to
Rat/Modern models. Reports are private `models-tc-*.json`.

Full checks preserved Input/Amp/Cab/Output/GEQ/PEQ bulk, modifiers, grid,
names, channel/bypass states and Drive/Compressor channels B-D. Both test
blocks stayed bypassed; no Store or preset reload occurred. Hardware model
acceptance is channel A. A-D addressing and isolation are tested offline,
not claimed as four-channel hardware acceptance.

The design schema has an optional `model` in `drive` and `compressor`.
The compiler uses only the exact captured names. An omitted/null model
adds no reset. A model transition requires an explicit preceding channel
and final level before engage or a transition away. Different profiles or
firmware still fail closed before writes. Model selectors are bulk-read,
never queried using an active SET. Compressor threshold remains numeric
pid 0. Model 13 must never be sent to that threshold address.

Model changes leave the block bypassed and restage its level afterwards.
Drive uses captured Level knob 0, Compressor uses at most -12 dB. This is
not calibrated unity or a limiter. External mute and physical audition are
still necessary. Existing Drive/Compressor placement remains required.
Testing automatic insertion requires a separately approved structural test;
no existing block or shunt was removed in this follow-up.

Final software gates passed **714 tests**, 114.71 seconds, six workers,
including all AFX3 tests and mandatory device-handle/capability/UI-warning
plus invariant safety gates. Report: `models-final-gates-20261006.xml`.
Installed headless Chrome passed the existing workspace checks and new
model-name rendering. TC was restarted disconnected via SIGTERM, then
reconnected to323 with the512-name User1 names-only catalogue restored.
No paid AI generation, Store or acoustic comparison was performed.

## Offline and browser verification

Final 681-test run passed: all `test_axefx3_*.py`, the mandatory device-handle,
capability and UI-warning gates, plus invariant safety tests. Report:
`effects-final-gates-20261006.xml`. Installed headless Chrome passed the
scene table (including new controls), retained request, newline, consent,
failure, XSS and mobile checks. The HTTP review/executor path is also tested
offline for all four optional families.

A freshly built and isolated-installed Python wheel loaded all 75 registry
controls, the new design schema and numeric pid-0 frames without MIDI.
The existing wheel packaging does not contain UI assets; source-tree UI
verification is separate and this is not a proven standalone installer.
