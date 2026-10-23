# Axe-Fx III edit buffer names

This draft isolates the first edit-buffer writes for review: preset and
scene names on one measured MK2 firmware profile. The opt-in developer
component is not registered in the application. The normal GUI, shared
planner and MK1 tester remain read-only for Axe-Fx III.

## Scope

`devices.axefx3.name_edits.NameEdit` represents one current-preset rename or
one scene rename, pinned to an explicit wire preset. Names use printable
ASCII without outer spaces, at most 31 characters. A preset name must not be
empty; a scene name may be explicitly cleared. Invalid input is refused rather than
trimmed, replaced, truncated or automatically prefixed.

The existing Gen-3 name packing is reused with product 0x10. A preview neither
reads nor writes the unit. The expected-state comparison requires a complete
connected snapshot, coherent scene naming and the declared capacity. It allows
only the requested name to differ; preset/scene selection, other scene names,
block status and all other supplied fields must match. This is not a backup,
restore function, physical audio check or proof about unread parameters.

The normal adapter's final output guard still refuses every compiled SET.
The frame builder is not permission to send it. There is no endpoint, UI
action, new dependency, shared FM9 change or capability promotion.

## Controlled developer use

`NameWriter` in `devices.axefx3.name_writer` must be constructed explicitly.
It refuses MK1/Turbo before opening MIDI. `review_name(NameEdit(...))` reads
a coherent current snapshot and checks the entire measured firmware reply,
not just the ambiguous raw `97.00` fields. The supported identity is MK2
`33.00-beta.20261006`. Another identity stops without promoting compatibility.

`apply_name(review, external_audio_muted=True)` requires that exact
connection-owned review, within 60 seconds, and fresh unchanged observed
state. No other program or controller may edit the unit during the operation.
The host lock does not make hardware edits atomic. Only the exact reviewed
single-use frame is allowed at the separate final output boundary, bound
to the executing thread. The permit is consumed before transport IO, even
if the port raises. Direct SET calls, modified frames and replays fail.

After one write, it settles and retries read queries only, comparing the
requested name and unchanged observed context. Any other observed change
stops immediately. Failed or uncertain writes invalidate further reviews on
that connection. There is no write retry, automatic rollback or preset reload.
An unchanged name is a verified no-op. A newly reviewed manual restoration
is a separate operation, not automatic recovery.

Close the adapter before an independent Axe-Edit comparison. This component
neither selects presets/scenes nor stores anything to flash. Store and normal
review/SEND UI integration are separate future contributions.

## Verification and limits

Independent fake-port tests cover both rename forms, all eight scene indices,
explicit scene-name clearing, no-ops, target/state/identity changes, expiry,
foreign and copied reviews, frame mutation, threads, replay and uncertain IO.
The unchanged normal adapter still refuses all writes.

On the owner's MK2, the extracted component renamed preset 323, active scene 1
and inactive scene 8. Native readback matched; independent Axe-Edit III 1.15.01
displayed all three exact names while scene 1 remained selected. New reviews
then restored the original preset name and cleared both scene names, with
native observed-state equality. No Store or navigation was used. This is a
names-only check on an empty grid, not parameter or routing preservation
proof for a populated rig. Raw captures and private screenshots are excluded.

MK1/Turbo writes, other firmware, parameter/model changes, routing, controllers,
NAM, IR, permanent storage and automatic firmware-version correction are
outside this draft. These name tests make no musical-quality claim.
