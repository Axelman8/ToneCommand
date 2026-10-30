# One Axe-Fx III implementation

30 October 2026. MK1 and MK2 use the same control family, planner, protocol
implementation and effect definitions. There is no second MK1 application or
duplicate set of effect encoders. Firmware-operation acceptance is separate
from declared chassis storage capacity.

## Central chassis facts

`devices/axefx3/chassis.py` is the shared source for declared preset capacity
and persistent-memory differences. Both the shared read-only protocol and
the full workspace consume it. The declaration is not automatic detection.

| Declared chassis | Presets | User2 on NAM-era firmware | Persistent FullRes User3 |
|---|---:|---|---:|
|MK1 |512 |Reserved for NAM |None; temporary Scratchpad is not User3 |
|MK2 |1024 |Retained for IRs |64 |

The existing read-only Turbo capacity remains1024; this refactor grants no
Turbo write approval. An unknown declaration keeps conservative512-name
capacity, no persistent FullRes and no NAM-era User2 metadata. Invalid
declarations refuse rather than silently becoming MK2.

The [owner's manual](https://www.fractalaudio.com/downloads/manuals/axe-fx-3/Axe-Fx-III-Owners-Manual.pdf)
documents preset capacities. The
[Blocks Guide](https://www.fractalaudio.com/downloads/manuals/fas-guides/Fractal-Audio-Blocks-Guide.pdf)
documents the MK2 FullRes bank. NAM addressing and installation approval
remain separately tracked in the existing hardware evidence.

## Correct cabinet metadata, without IR writes

Known October6 FW33 and October26 Beta5 builds use the same modern user-name
layout: User1 and User2 have1024 entries, with separate64-entry FullRes User3.
This is a local name-list schema, not a selector or firmware-write alias.
Unknown firmware does not acquire this schema or a writable profile.

Previously Beta5 fell through to the old name layout: User1 slot1024 could
be rejected and User2 names could be mapped using the old combined-bank
address. The shared schema now keeps the banks distinct. Switching to MK1
preserves the upper half of User1 and removes only local names for reserved
User2 and unsupported persistent FullRes. It does not delete device contents.
Invalid mixed imports fail atomically, preserving existing local names.

Private name caches stay separate per exact firmware and chassis. Beta5 never
inherits the October6 cache; MK1 never imports MK2's bank permissions. Validly
checksummed but reserved cache entries are still rejected. These caches contain
names only, not IR data, NAM weights, account tokens or proof of audible IRs.

## Evidence and next stage

Offline tests compare both chassis' complete parameter specifications and
sample exact encoded frames, storage boundaries, normal profile/import API,
cache isolation and refusal paths. These are software parity tests, not a
physical MK1 regression. A native GET-only MK2 full-state comparison also
confirmed that this change did not alter the current preset state.

No firmware fingerprint, writable-family gate, MK1 writer approval, model
selector, memory allowlist or FM9 never-brick guard is broadened. Existing
MK2-only proof gates remain visible rather than being removed as if a local
chassis choice were hardware evidence. New shared operations should consume
one implementation and receive explicit evidence for the intended scope.

Next release work is the same for both chassis: complete the shared reviewed
AMP/CAB workflow, then effects/controllers/scenes, refinement and storage.
NAM/IR installation and MK1 storage need their own separate acceptance. This
foundation is not a declaration that the full Beta5 preset builder is ready.
