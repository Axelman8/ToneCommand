# Axe-Fx III FW33 Amp catalog, facts only

This is the FW33 model-data slice of #270, independent of preset writing,
NAM, accounts, controllers and the III planner. It bundles **336 exact Amp
labels and ordinals (0-335)** for the explicit profile
`33.00-beta.20261006`. It does not add a model selector or connect anything
to the ordinary app. The III adapter remains read-only.

```python
from devices.axefx3 import amp_catalog

names = amp_catalog.roster('33.00-beta.20261006')
number = amp_catalog.ordinal('33.00-beta.20261006', 'Brit 800 2204 High')
# number == 14, but that fact is NOT permission to send a selector write.
description = amp_catalog.report('33.00-beta.20261006')
```

An unknown profile returns no roster; exact-label resolution then refuses.
Generic `33.00` and raw `97.00` do not identify this catalog. No fuzzy labels,
FM9 ordinals, fallback catalogs, downloaded algorithms or live enumeration.
The caller's profile string is a lookup key, not device identification.

## Source and integrity

The factual JSON comes unchanged in meaning from the contributor's existing
[full-fork snapshot](https://github.com/Axelman8/ToneCommand/blob/b76019983fba2e699db7fc4fdeab85d2be3f7413/devices/axefx3/data/fw33_amp_models.json).
It records only names/IDs and provenance from the exact product-0x10 FW33
Axe-Edit definition enum (section 10, parameter 0). No editor executable,
definition binary, amp algorithms, account, private IR table or NAM weights
are included. The source cache SHA-256 is recorded as provenance, not read
from the user's filesystem at runtime.

The loader checks the exact metadata, all contiguous IDs, unique printable
labels, a pinned normalized mapping digest, duplicate JSON keys and resource
size. Missing/corrupt data or a changed label/ordinal fails visibly rather
than silently yielding a partial roster. Each lookup returns a fresh map.
The JSON is included in non-editable packages through package data.

## Evidence and limits

Historical MK2 work on 2026-10-16 correlated every exact name with Axe-Edit
and separately replayed the 336 model choices through the full fork with
native ordinal readback. The [original inventory notes](https://github.com/Axelman8/ToneCommand/blob/b76019983fba2e699db7fc4fdeab85d2be3f7413/docs/AFX3-AMP-INVENTORY.md)
state that work's precise scope. Those results are historical provenance,
**not a fresh hardware regression of an upstream model writer**. This slice
has no writer to test and performs no MIDI, editor, account or network call.

No MK1/Turbo selector, future firmware, all model/channel combinations, audio
match or safe physical volume is implied. The report explicitly states
`live_list_fetched=False`, `generic_setter_enabled=False` and
`hardware_verified_in_this_slice=False`. Later selector/registry/planner
integration must supply its own honest capabilities, reviewed permissions,
quiet staging and independent native/editor acceptance. Merely resolving a
name to an ID must never widen a guard or activate a planner action.
