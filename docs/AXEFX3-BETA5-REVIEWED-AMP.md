# Separate Beta5 Gain/Mid experiment

This draft does not enable general Axe-Fx III or Beta5 preset writing.
Default connections remain read-only. The older `AmpWriter` keeps its own
unchanged identity pin and continues to refuse this Beta5 response.

## Explicit scope

- MK2 only, full firmware-response SHA-256
  `15e9277d25e2180599d6d8a9d1fda73373ee592cdc0ce8682a1f7c007b67a616`,
  measured as `33.00-beta5.20261026`. Raw97.00 or a version label is not approval.
- Existing Amp1/channel A/model0, 59 Bassguy Bright. Other models refuse;
  nothing is silently loaded. No new block, model, channel, scene, bypass,
  level, controller, naming, CAB/NAM/global or permanent-storage operation.
- One Gain or Mid value, 0.1..8.0 in tenths, at most one displayed unit from
  the independently read current value. No zero or clamp.
- Same native review and complete observed-state preservation as the older
  writer. Inactive/unassigned modifier records remain exact, including unused
  metadata. Unknown results stop without retry, rollback, reload or Undo.

Developer selection: set `TONECOMMAND_AXEFX3_REVIEWED_AMP_BETA5=1` and leave
`TONECOMMAND_AXEFX3_REVIEWED_AMP` unset. Both together refuse connection.
Modes cannot share an armed review. The app still requires the existing
review/confirm stages, explicit target/external-mute acknowledgements and a
deliberate SEND within the existing arm window. Preparation does not transmit.
The retained ordinary-plan revision cache can conservatively block preparation
after a prior plan; this draft does not clear authorization history to hide it.

## Evidence and remaining acceptance

The owner's maintained fork at `77e2ded` completed four registered native API
edits with this bounded design: Gain4.4->4.6->4.4 and Mid5.0->5.6->5.0,
each separately reviewed. A separate six-literal boundary test covered
Gain0.1/8.0/4.4 and Mid0.1/8.0/5.0. Independent native displays, complete
observed-state comparisons and fresh Axe-Edit checks passed on isolated,
bypassed327 with no Input/Output/cables. No Store, globals or shared-memory
writes. Those captures and full state remain private.

This small upstream port uses the upstream read-only adapter/protocol names
and a self-contained fingerprint constant instead of the fork's firmware
registry import. Its own software, browser, CI and installation results must
be recorded separately. Native acceptance of this exact upstream candidate
is still pending; earlier fork results are not relabelled as that acceptance.
The shared guard and memory allowlists are unchanged. No native browser SEND,
physical limiter, audible quality, MK1/Turbo parity or broader family claim.
