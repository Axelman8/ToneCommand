# Axe-Fx III maintenance and publication

## Decision and current state (2026-10-09)

Maintain this as an upstream-compatible device contribution, not a separately
copied FM9 application or an Axe-Edit-dependent addon. The intended architecture
is upstream's shared planner/UI plus `devices/axefx3`, with explicit per-firmware
capabilities. The integration branch includes upstream 1.5.14 and moves the
bounded FW33/NAM protocol, installer, account and design path to
`devices/axefx3`. The owner installation is deliberately unchanged pending
new adapter hardware acceptance. This is NOT an automatic one-click update:
shared interfaces still require regression and hardware changes need review.

There is one user installation, on port 8909. Integration checkouts are source
workspaces, not additional supported/running instances. Never copy account
settings, cab lists, model weights or user presets into a public development
branch. Preserve the successful 2026-10-08 preset test as a hardware baseline;
its audible acceptance was reported by the owner on 2026-10-09. That does not
certify untested firmware, controllers, NAM formats or upstream features.

## Repeatable update check

For a fresh source checkout without a local KB, first run:

```powershell
.\.venv\Scripts\python.exe -X utf8 tools/bootstrap_fx3_kb.py
```

This creates only gitignored `kb/` from the public compatibility/maintenance
facts. It does not reproduce upstream's private knowledge, overwrite an existing
KB, access an account or authorize hardware. Preserve and reconcile an existing
KB manually. Private owner evidence can remain local; distributable facts belong
in the reviewed public docs so another maintainer can bootstrap safely.

From the owner checkout, with the device off:

```powershell
.\Check-ToneCommand-Upstream.ps1
.\Check-ToneCommand-Upstream.ps1 -Fetch
.\Check-ToneCommand-Upstream.ps1 -Json
```

The default is offline. Fetch validates the upstream URL and refreshes Git
objects only. Neither command merges, restarts TC, changes settings, calls AI,
opens MIDI, installs NAM data or writes a preset. The JSON report can be used
by later automation. `config/axefx3_upstream.json` records the audited commit,
the existing integration foundation and ordered ownership/review rules.
An audited version is deliberately NOT labelled integrated or hardware-tested.
The report checks whether the declared foundation is actually in this checkout's
HEAD history; a missing ancestor is a warning, not a passed integration gate.
Unclassified files need review. Local overlaps flag potential reconciliation,
not an exhaustive list of merge conflicts or proof of feature equivalence.

## Branch and release workflow

1. Keep `main` as a clean upstream mirror in the fork. Keep a stable `axefx3`
   release branch and develop each update on an `integration/axefx3-*` branch.
   Use a checkpoint branch/tag before migrating. Do not reset existing work or
   force-push to obtain this layout. The current preparation branch is local.
2. Fetch upstream and inspect changes from the known integration foundation.
   Resolve common planner/UI changes separately from device-specific protocols.
   Keep FW33/TONE3000/NAM behavior in the isolated FX3 adapter before deploying
   the newer foundation. Do not replace it with the FM9 path. The local KB is
   newly built from this fork's evidence, not the upstream author's private KB.
3. Run simulator, parser, validation, browser and package tests. Keep Windows
   and Linux CI required. Unknown hardware behavior must remain blocked even
   if the simulator accepts it. A CI definition is not a remotely passed run.
4. With separately confirmed power/mute/target permissions, verify the integrated
   application on allowed test presets, including readback and stored reload.
   New persistent NAM writes need their own authorization. Do not widen any
   preset/CAB/NAM whitelist. Human listening and physical controllers remain
   separate acceptance checks; there is no physical audio limiter.
5. Review the public diff and licensing, run the release audit, then request
   publication approval. Push a feature branch to the owner's fork and open a
   draft PR to `monzta1/ToneCommand:main`. Small dependency-ordered PRs are easier
   to review than the full legacy fork. Never push directly to upstream main.
6. After accepted CI/hardware evidence, tag a tested source release. Retain
   firmware bounds and caveats in release notes. Do not advertise an installed
   wheel/frozen app until its resources and GUI have passed installed tests.
   If upstream merges the adapter, prefer upstream releases over maintaining
   another permanent UI fork.

## Publication hygiene

```powershell
.\.venv\Scripts\python.exe -X utf8 tools/release_audit.py --staged
.\.venv\Scripts\python.exe -X utf8 tools/release_audit.py --ref HEAD
```

These scan Git blobs, not ignored account files. The index scan includes new
staged files; the committed scan is independent of working-tree edits. Reports
contain paths/rules, never suspected credential values. It blocks known private
artifacts and high-confidence token patterns. It is not an exhaustive secret
scanner or history audit; publication also requires GitHub secret scanning,
review of any previously pushed history and a manual third-party license review.
No NAM weights, private hardware captures or third-party guide prose belong
in the PR. Synthetic test data and facts-only metadata may be distributed only
under their applicable licenses. Do not commit local one-off hardware scripts
as reusable product features without first removing owner-specific assumptions.

## Acceptance gates and remaining work

- Gate A: successful live implementation checkpoint and offline regression.
- Gate B: maintenance tools, release tripwire and cross-platform CI preparation.
- Gate C: latest upstream integrated with isolated FX3 FW33/NAM support; full
  application regression, real mocked-API Chrome workflow and module packaging.
  Source-checkout distribution only; installed wheel GUI is not advertised.
- Gate D: muted hardware regression of that integrated build plus user audition.
- Gate E: public diff/licensing/history review, actual GitHub CI, draft PR.

The existing integration worktree requires a private `kb/` by its AGENTS.md.
It was absent. On 2026-10-09 the owner first requested waiting, then explicitly
authorized building the missing local knowledge base and completing FW33/NAM
adapter integration. Populate it only from inspected sources and recorded
evidence, clearly separating legacy hardware acceptance from new code testing.
No upstream planner change was applied to the working owner installation.
Provide `kb/INDEX.md`, `kb/index.json`, the referenced `always_load` resources
and task-relevant files under the integration checkout. Hardware work additionally
requires `kb/HARDWARE_RULES.md`. Keep the knowledge base local and gitignored;
never publish account credentials or private captures to make this available.

Working source checkpoint: `939e3ef8cab2a64c7ce043c213314b9ebe02539a`, branch
`checkpoint/axefx3-fw33-nam-20261009`. Before any maintenance-code change its
full offline suite passed 2,939 tests, with one skip and four existing Starlette
warnings. Maintenance preparation subsequently passed 2,958 tests and one
skip, with the same warnings. The simulator preset doctor passed all three
checks; listening remains pending for simulated presets. The shipped
JavaScript suites passed 61 and 13 tests. These results
belong to the current working implementation, not the newer integration backend.

Latest audited source: [upstream 1.5.14 changelog](https://github.com/monzta1/ToneCommand/blob/c2dae138272cbfb26096ff7d92e643eacf8c32ab/CHANGELOG.md).
Device evidence and exact bounds: [FW33 compatibility](FW33-COMPATIBILITY.md).

## Proposed review order

Prefer dependency-ordered PRs: independent adapter/discovery and firmware bounds;
FW32.06 review/executor and controller UI; FW33 exact profile/native NAM/account;
then shared reset/UI and maintenance improvements that upstream wants. Keep the
integration branch as the complete tested candidate, not a second live server.
No draft PR, branch protection changes, push or release happened during this
offline preparation. Confirm repository visibility and publication permission
before any remote write. The local raw hardware evidence and account/model
files remain private; public claims must be supportable from reviewed facts.

## Offline candidate evidence, 2026-10-09

- Windows/Python3.12: final full SIM suite **4,022 passed, 16 skipped**, 349.45s,
  eight workers. Mandatory device/capability/UI-warning plus maintenance/NAM
  review/installer gates **126 passed**, 246.72s, four workers.
- Real headless Chrome with shipped HTML/JS and mocked APIs: common layout,
  request retention/reset, review/send consent, text safety and native NAM
  preview/install/one-scene-foundation/two-scenes/separate-Store workflow pass.
  The chain browser test and five shipped reset behavior tests also pass.
- SIM doctor: path, scenes and levels **3/3**, audible result always pending.
- Source wheel built; eleven new adapter/catalog entries verified in its actual
  archive. This is a module packaging check, not an installed/frozen GUI claim.
- Public Git index/tree tripwire passes; no known private account/model/preset
  artifacts. Manual license review, full history security review, actual GitHub
  CI, new muted adapter hardware acceptance and deployment remain open gates.

The device stayed off. No real AI request, NAM install, preset write/Store,
Axe-Edit automation, owner-app restart, remote push or PR creation occurred.

## Subsequent muted hardware evidence, 2026-10-09

The preceding paragraph applies to the offline phase only. The owner later
confirmed power on, external audio off, and explicitly authorized test presets
321-329 including replacement. Candidate `4cc5834` was then tested on declared
MK2 hardware with independently identified `33.00-beta.20261006` firmware.
This is a narrow acceptance result, not general FM9/FX3 feature parity.

- Real configured Codex backend, no substituted AI response or fallback:
  an empty preset327 foundation executes all **40 actions**; a subsequent
  existing-route design executes all **58 actions** for Rhythm/Lead with NAM A/B.
  The actual registered review/send API and live adapter were used via ASGI.
  Every action passes its independent readback, with no remaining skipped actions.
- Separate same-slot Store through the actual API succeeds under the owner's
  already-existing321-329 policy file. After selecting empty328 and returning
  to327, complete block bulks, grid, modifiers, scene names and NAM hash match
  the pre-Store state. The diagnostic bank/PC helper is not a newly enabled
  adapter reload feature; generic preset reload remains deliberately disabled.
- Additional live scene checks and independent Axe-Edit show NAM A/B with
  distinct EQ/levels, the requested per-scene bypass states and shared effect
  timings/mixes/levels. Axe-Edit is opened only after TC releases MIDI and is
  closed gracefully afterwards. It is not used to build or save the preset.
- Empty two-scene requests are refused before the AI call. Unsupported block
  deletion/model selection, feedback95%, Output+12dB and adding a NAM block to
  the occupied route are refused before writes. Complete state stays unchanged.
  No claim is made that FW33 can clear, splice or replace an existing route.
- Stored reference326 retains its complete grid, parameter bulks, modifiers
  and scene names. Native NAM memory reads return all65536bytes with the same
  hash throughout. No NAM installation, capture replacement, global MIDI map,
  firmware, driver or allowlist change is performed.
- The new account service reads the existing encrypted login and downloads the
  selected entitled capture through the actual TONE3000 API. Installation
  preview on empty328 compiles to the exact currently installed payload hash.
  Each of the three missing-consent cases refuses commit; complete device/NAM
  state stays unchanged. This proves preview/consent handling, NOT installation.
- Post-hardware mandatory device/capability/UI-warning, maintenance and FW33/NAM
  workflow regression: **127 passed**, 114.88s, four workers. Public Git tree
  tripwire passes; it is not a complete history/license/security audit.

Preset327 is stored as `AI-FX3 Integration Test`. It is a transport/scene test,
not a claim of a complete cab voicing, matched recording or safe physical
loudness. Cab is intentionally bypassed. External audio remains off. Physical
audition/controller checks, the new native installer's hardware WRITE pass,
manual licensing/history review and actual remote CI remain separate gates.
Local raw reports and owner-specific harnesses are private and gitignored.
No owner-app replacement, remote push or PR publication occurred.
