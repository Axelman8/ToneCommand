# Axe-Fx III read only review

This is the basic reading slice of [the larger contribution](https://github.com/monzta1/ToneCommand/pull/270).
It lets the existing Devices selector open an Axe-Fx III without enabling
preset writing, NAM installation or account workflows. The full working fork
and the separate MK1 evaluation package do not change when this slice changes.

## What it reads

The adapter queries firmware major/minor, the current preset and scene,
stored preset names in the declared hardware range, eight scene names and block
bypass/channel status. Names are read by number without selecting a preset
or scene. The screen shows status chips, not an inferred signal route.
Unknown effect IDs remain visible by number, rather than borrowing an FM9
effect type or NAM map. No amp, cab or parameter values are inferred.

Firmware major/minor is not an exact beta build identifier or proof that any
write works. MK1 and MK2 are not detected or distinguished by these reads.
In **Devices > Axe-Fx III**, declare Mark I (512 presets), Mark II (1024) or
Turbo (1024). The default is conservatively Mark I. The declaration is local
to this server session and is not an automatic hardware identification.
Only stored-name requests expand: wire slots 0..511 for Mark I, 0..1023 for
Mark II/Turbo. Select the actual chassis, not MK2 as a workaround on a Mark I.
The write boundary is identical for all choices and does not inspect NAM or
User Cab memory. No controller, NAM or write compatibility is inferred.

## Start and compare

1. Install the project normally with Python 3.12 and `pip install -e ".[dev]"`.
2. Close Axe-Edit and any other application holding the unit's MIDI port.
   Keep monitoring muted when changing presets manually during the comparison.
3. Start ToneCommand normally. Open Devices and declare your connected III's
   hardware type. The device picker also connects using the current declaration.
   A Mark II/Turbo loaded above slot 511 needs its type chosen before connection;
   the conservative Mark I default deliberately refuses that out-of-range reply.
   Discovery enumerates names only; it opens no MIDI ports until selection.
4. Check preset, scene and block states against the unit. Scene and preset
   navigation from this UI is disabled in this slice. Make any desired
   changes on the unit, then refresh the reading.
5. Switch TC back to FM9 or stop its console normally before opening Axe-Edit.
   Record exact unit firmware/build, editor version and MK1/MK2 chassis, then
   compare names and bypass/channel status. Do not save or install anything
   for this test. Close Axe-Edit before reconnecting TC.

An occupied port, missing reply, wrong product byte, invalid checksum or a
preset/scene transition during the snapshot must not be reported as a passing
read. A missing individual scene name stays unknown. A different device's
response is ignored. Unplug/reconnect uses the existing reconnect control.
Changing the declared type on an already connected III sends no MIDI message;
it invalidates cached names. Use RESCAN to read the declared range. Names from
another device, adapter connection or chassis declaration are not reused.
Neither the names scan nor the chassis choice selects or saves a preset.

## Higher preset name acceptance

On a real Mark II, read all names with the Mark II declaration, then compare
the upper half against Axe-Edit with TC disconnected first. Record exact
firmware/build and editor version, and specifically compare wire slots 512
and 1023 (the existing UI labels show these as 513 and 1024). Keep monitoring
muted for any manual preset/scene change. Close Axe-Edit before reconnecting TC.
Confirm the selected preset and scene remain unchanged during TC's scan.

The new range is covered by synthetic tests, not yet an independent hardware
acceptance. Do not send above-511 requests to a Mark I to investigate its
unknown response. Missing names remain unknown; a timeout is not an empty slot.

## Read boundary

The final output wrapper accepts only exact product 0x10 checksummed read
forms for functions 08, 0A, 0B, 0C, 0D, 0E and 13. Scene 0C accepts only its
query sentinel. Bypass and channel accept only queries, never values. The
parameter/editor function 01, bulk/memory transfers, CC/PC, clock, notes,
firmware and storage commands are refused before output. A getter is never
implemented as a zero-value setter. The FM9 send guard stays unchanged.

All core write methods decline explicitly. Preset planning for this device stops
before calling the AI. Capability flags remain false for writes, topology,
modifiers, captures, file installation, renaming and Store. No new HTTP
endpoint, account, dependency, write-slot allowlist or FM9 protocol switch is added.

## Review and remaining tests

Offline tests cover strict output forms, malformed and wrong-product replies,
timeout/close behavior, request correlation, scene/preset coherence, adapter
conformance, selection/state endpoints and write refusals. The existing full
suite and mandatory safety/capability checks accompany the draft, with any
platform-specific failures disclosed in its description.
These are not new hardware results: this slice's independent live comparison
is still pending on an actual III, including the external MK1 tester.

Review MIDI partial-open cleanup separately; it is the first small PR and is
recommended before live connection testing. The two PRs both target upstream
main and carry no overlapping implementation commits. Later slices can extend
this adapter with separately reviewed preset writes, NAM and account flows.
