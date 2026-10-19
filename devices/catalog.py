"""DPDP, the Dynamic Processor Discovery Protocol (#208, phase 1 #209): what
ToneCommand knows about a device before it has, or even could have, any code
for it. DPDP finds the device; it then hands off to DDCP, the Dynamic Device
Control Protocol, which is the adapter contract in fm9/adapter.py that every
device's code implements.

Data, not code. `catalog.json` says, per device, how to recognise it from
the MIDI port list, which adapter drives it (or that none does yet) and the
issue tracking that adapter. Recognition is a pure function over port NAMES:
it opens nothing and sends nothing, so a device ToneCommand cannot drive is
named to the player without a single byte reaching it.

A pattern marked `verified` was seen on real hardware (the FM9's
'FM9 MIDI In 0' from #193, the IR-2's 'IR-2' on the bench, the ToneX
Pedal's 'ToneX' and USB 0x1963:0x0068 from kb/TONEX_PROTOCOL.md). The rest
are inferred from Fractal's naming and say "looks like" when they match.

#258: an entry may also name USB [vendor, product] IDs, and a device the
catalog does not know is reported as unknown when it is an instrument by
evidence (a known maker's vendor ID, or a MIDI streaming interface), so
plugging it in is answered instead of ignored. #261: a DDLP profile, a
learned description of a device written by the probe (devices/ddlp.py),
makes it recognised by USB ID from then on.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from importlib import resources
from pathlib import Path

ISSUES_URL = "https://github.com/monzta1/ToneCommand/issues/"
FIELDS = ("kind", "label", "ports", "adapter", "issue", "verified")
#: Instrument makers by USB vendor ID, only IDs read off real hardware:
#: IK Multimedia from the ToneX One (#258), Roland from the IR-2
#: (kb/IR2_PROTOCOL.md). Fractal's goes here once read off a unit.
KNOWN_MAKERS = {0x1963: "IK Multimedia", 0x0582: "Roland"}
#: USB audio class, MIDI streaming subclass.
MIDI_STREAMING = (1, 3)
DEVICES_DIR = Path(__file__).resolve().parent
#: Reviewed profiles ship in the repo; learned ones stay on this machine.
PROFILE_DIRS = (DEVICES_DIR / "profiles", DEVICES_DIR / "learned")


class CatalogError(ValueError):
    pass


def _check(entry: dict) -> dict:
    missing = [f for f in FIELDS if f not in entry]
    if missing:
        raise CatalogError(f"catalog entry {entry.get('kind')!r} lacks {missing}")
    if entry["adapter"] is None and not isinstance(entry["issue"], int):
        raise CatalogError(f"{entry['kind']!r} has no adapter and no issue to point at")
    usb = {(int(v), int(p)) for v, p in entry.get("usb", ())}
    return dict(entry, patterns=[re.compile(p, re.I) for p in entry["ports"]], usb_ids=usb)


@lru_cache(maxsize=1)
def load() -> tuple[dict, ...]:
    """Every catalog entry, validated, in file order."""
    raw = json.loads(resources.files("devices").joinpath("catalog.json")
                     .read_text(encoding="utf-8"))
    entries = tuple(_check(e) for e in raw["devices"])
    kinds = [e["kind"] for e in entries]
    if len(kinds) != len(set(kinds)):
        raise CatalogError(f"duplicate kinds in the catalog: {kinds}")
    return entries


def public(entry: dict) -> dict:
    """What the page is told about one entry."""
    return {"kind": entry["kind"], "label": entry["label"],
            "supported": entry["adapter"] is not None,
            "verified": bool(entry["verified"]),
            "issue": entry["issue"],
            "issue_url": f"{ISSUES_URL}{entry['issue']}" if entry["issue"] else None,
            # #212: supported for reading only (the FM3 through the FM9 module).
            "read_only": bool(entry.get("read_only"))}


def recognise(port_names, usb_devices=()) -> list[dict]:
    """The catalog entries whose patterns match a port in `port_names` or
    whose USB IDs match a device in `usb_devices`, in catalog order, one per
    kind (an FM9 exposes several ports). Pure: names in, entries out."""
    names = [str(n) for n in port_names or ()]
    ids = {(d["vid"], d["pid"]) for d in usb_devices or ()}
    return [public(e) for e in load()
            if any(p.search(n) for p in e["patterns"] for n in names) or e["usb_ids"] & ids]


def load_profiles(dirs=None) -> dict[tuple[int, int], dict]:
    """#261: DDLP profiles by USB ID, reviewed ones first so a learned copy
    never shadows a reviewed one. A file that does not parse is skipped:
    a damaged local profile must not take discovery down."""
    out: dict[tuple[int, int], dict] = {}
    for d in PROFILE_DIRS if dirs is None else dirs:
        for f in sorted(Path(d).glob("*.json")) if Path(d).is_dir() else ():
            try:
                prof = json.loads(f.read_text(encoding="utf-8"))
                key = (int(prof["identity"]["vid"]), int(prof["identity"]["pid"]))
            except (OSError, ValueError, KeyError, TypeError):
                continue
            out.setdefault(key, dict(prof, reviewed=Path(d).name == "profiles"))
    return out


def _has_midi(dev: dict) -> bool:
    return tuple(MIDI_STREAMING) in {tuple(i) for i in dev["interfaces"]}


def _is_instrument(dev: dict) -> bool:
    return dev["vid"] in KNOWN_MAKERS or _has_midi(dev)


def owned_ports(dev: dict, port_names, usb_devices) -> list[str]:
    """The MIDI ports that belong to `dev`. A port is attributed only when
    the device has a MIDI streaming interface and it is the ONLY such device
    whose product name appears in the port name; anything ambiguous is
    attributed to nobody. So a software port that happens to share a name
    (a virtual 'ToneX One') is never taken for a device that has no MIDI."""
    product = dev["product"].lower()
    if not product or not _has_midi(dev):
        return []
    rivals = [d for d in usb_devices or () if _has_midi(d) and d["product"]]
    out = []
    for name in (str(n) for n in port_names or ()):
        claim = [d for d in rivals if d["product"].lower() in name.lower()]
        if len(claim) == 1 and claim[0] is dev:
            out.append(name)
    return out


def _label(dev: dict) -> str:
    maker = dev["maker"] or KNOWN_MAKERS.get(dev["vid"], "")
    product = dev["product"] or f"device {dev['vid']:04x}:{dev['pid']:04x}"
    return f"{maker} {product}".strip() if not product.lower().startswith(maker.lower()) else product


def unrecognised(port_names, usb_devices, profiles=None) -> list[dict]:
    """#258, #261: instruments on USB that the catalog does not know, as
    learned (a profile describes them) or unknown. A device counts when its
    maker is a known instrument maker or it has a MIDI streaming interface;
    a MIDI port the catalog does not know only ever counts through the USB
    device it belongs to, so a software port (a DAW's virtual port) never
    does."""
    from devices.usb import usb_id
    profiles = load_profiles() if profiles is None else profiles
    known_ids = set().union(*(e["usb_ids"] for e in load()))
    names = [str(n) for n in port_names or ()]
    out = []
    for dev in usb_devices or ():
        key = (dev["vid"], dev["pid"])
        if key in known_ids:
            continue
        ports = owned_ports(dev, names, usb_devices)
        # a device the catalog recognises by its own port name is already listed
        if ports and recognise(ports):
            continue
        prof = profiles.get(key)
        if prof is None and not _is_instrument(dev):
            continue
        entry = {"kind": usb_id(*key), "label": prof["label"] if prof else _label(dev),
                 "supported": False, "verified": False, "issue": 239,
                 "issue_url": f"{ISSUES_URL}239", "read_only": False,
                 "unknown": prof is None, "learned": prof is not None}
        if prof is not None:
            entry["known"] = list(prof.get("known", ()))
        out.append(entry)
    return out
