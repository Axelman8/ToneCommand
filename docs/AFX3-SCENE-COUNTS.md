# Bounded one-to-eight scene designs

The AMP/CAB compiler can represent exactly one through eight requested scenes
on the existing measured14-block FW33/MK2 route. It keeps four Amp/Cab voices
A-D; fewer scenes do not create extra channels or authorize another topology.

Every short design requires an explicit ordered scene layout. The compiler,
review grammar, executor proof, private history, cold resumption and separate
Store survey must agree on the same count. A malformed count, missing scene,
duplicate rename, mismatched AI result or stale fingerprint stops before SEND.
Scenes outside the requested prefix retain their mappings, but shared edited
channels can still change their sound; this is not channel isolation.

The backend's `album_scene_counts` list controls which counts the GUI offers.
There is no GUI/environment override for unreleased hardware behavior. New
counts require their own native normal-SEND and independent editor acceptance.
Synthetic tests exercise all counts, history, Store consent and unchanged
outside scene maps without claiming native acceptance.

Refreshing the same target retains the user's route/count choice, but clears
the earlier recommendation and all plan/SEND approval. A fresh route exploration
is required before another plan. Changing device identity, firmware, chassis or
target does not inherit the old choice. Refresh never selects a device scene
or writes effect parameters.
