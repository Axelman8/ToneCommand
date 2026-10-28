# Beta5 parameter-family measurements

28 October 2026. This is evidence for a closed developer fixture, not a
normal planner/SEND capability or a general Beta5 write profile. The supported
firmware registry, production output gates and FM9 never-brick guard are
unchanged. Earlier accepted firmware evidence remains retained separately.

## Amp 1, channel A

Exact observed MK2 build: `33.00-beta5.20261026`, full response SHA-256
`15e9277d25e2180599d6d8a9d1fda73373ee592cdc0ce8682a1f7c007b67a616`.
Axe-Edit III1.15.02 independently identified the connected MK2. The owner
confirmed external mute and access. Only disposable preset327/scene1 was used.
The fixture contains one isolated Amp1/A at row1/column1, 59 Bassguy Bright,
with no Input, Output, cables, shunts or assigned modifiers. No Store, global
change, NAM/IR operation or change to reference326/328 was performed.

| Control | Parameter ID | Captured/native target | Separately restored value |
|---|---:|---:|---:|
| Treble Gain |1 |4.6 |5.0 |
| Bass |2 |4.7 |5.0 |
| Mid |3 |5.6 |5.0 |
| Treble |4 |4.8 |5.0 |
| Presence |20 |4.9 |5.0 |
| Master Volume |5 |4.7 |10.0 |
| Depth |16 |1.1 |0.0 |
| Level, dB |21 |-13.0 |-12.0 |

All sixteen literal operations were first observed as outgoing editor frames.
The passive observer captured no incoming buffers; it is not readback evidence.
Independent native display queries and complete bulk reads supplied readback.
The seven knob pairs use subcommand09 with the display value rounded to
float32 before division by10. The quiet Level pair uses direct dB. Depth zero
is the actual captured09 literal, not a guessed zero-as-GET substitution.
These samples do not establish arbitrary values, models or channels.

Each native SET had a fresh exact identity, current preset/scene, all eight
scene names, full grid/status, Amp/controller bulks and all32 complete25-word
modifier records. After settling/repeated reads, only the addressed Amp word
and independent display could differ. All other Amp channels and observed
state were preserved exactly. Fresh Axe-Edit instances independently displayed
the seven changed knobs and their restored values; a separate quiet Level
change/restoration received the same treatment. The final complete native
baseline was restored and a final editor check showed the original knobs
and -12dB level. Exactly16 native parameter SETs were sent, without retries.

The production adapter correctly refused a preliminary attempt before output.
That refusal is retained, not counted as a successful or uncertain write.
The successful experiment used a separate private exact-literal output probe
under the unchanged shared SysEx guard, not a profile override or production
guard relaxation. Other preliminary inspection/schema refusals also sent no
parameter SET. Private captures, state dumps and screenshots remain local.

## What remains before normal app support

Review and implement a bounded family-specific component with software refusal,
single-use review, expiry and uncertainty tests. Run that exact implementation
on the native device and independently compare it with the editor. Repeat for
the required model/channel, CAB, routing, scene, controller, other-effect,
timing/zero, NAM and Store operations. Then exercise the registered normal
REVIEW/CONFIRM/SEND flow on the exact candidate. These closed measurements do
not authorize model resets, full musical rigs or MK1/Turbo parity.

No audible test was performed. External mute and reduced levels are not a
physical limiter or an acoustic-feedback guarantee. Player listening and
pedal tests remain separate acceptance steps.
