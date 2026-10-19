"""DDLP, the Dynamic Device Learning Protocol (#239), first slice (#261): the
probe process that turns an unknown device into a learned profile.

A profile is data, not code: what the device is (USB identity), how it can
be reached (its MIDI ports, USB audio, a serial control port) and what was
heard from it, every entry stamped with where it came from. It is the seed
a later lane grows into an adapter; this slice controls nothing.

Rule zero, by construction: the probe SENDS NOTHING. There is no code path
here that opens a MIDI output or a serial port. A serial port's presence is
recorded from the USB tree; opening it would raise DTR, which some devices
take as a signal (a reset, a bootloader), so its contents are not read. A
MIDI input is opened only when it provably belongs to the device
(catalog.owned_ports), and only to listen.

Nothing is probed without consent; the route refuses otherwise.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

from devices import catalog
from devices.usb import usb_id

SCHEMA = 1
LISTEN_SECONDS = 3.0
LEARNED_DIR = catalog.DEVICES_DIR / "learned"
TOOL = "ToneCommand DDLP probe, schema 1"


class ProbeRefused(ValueError):
    pass


def _observed(source: str) -> dict:
    return {"kind": "observed", "source": source}


def slug(dev: dict) -> str:
    text = f"{dev['maker']} {dev['product']}".strip() or usb_id(dev["vid"], dev["pid"])
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def read_usb_audio(product: str) -> dict | None:
    """The USB audio device of this name, from CoreAudio's own report
    (macOS). None when it has none, or on another system."""
    if sys.platform != "darwin" or not product:
        return None
    r = subprocess.run(["system_profiler", "SPAudioDataType", "-json"],
                       capture_output=True, timeout=20)
    if r.returncode != 0:
        return None
    for group in json.loads(r.stdout or b"{}").get("SPAudioDataType", ()):
        for item in group.get("_items", ()):
            if item.get("_name", "").lower() == product.lower():
                return {"inputs": int(item.get("coreaudio_device_input", 0) or 0),
                        "outputs": int(item.get("coreaudio_device_output", 0) or 0),
                        "sample_rate": int(item.get("coreaudio_device_srate", 0) or 0)}
    return None


def listen(open_input, ports: list[str], seconds: float = LISTEN_SECONDS) -> list[dict]:
    """What the device sends by itself on its own inputs, for `seconds`.
    Opening an input sends nothing."""
    heard = []
    for name in ports:
        port = open_input(name)
        try:
            end = time.monotonic() + seconds
            while time.monotonic() < end:
                for msg in port.iter_pending():
                    heard.append({"port": name, "message": msg.hex(),
                                  "provenance": _observed("listened on the device's MIDI input")})
                time.sleep(0.05)
        finally:
            port.close()
    return heard


def probe(kind: str, *, port_names, out_names, usb_devices, open_input,
          audio_reader=None, seconds: float = LISTEN_SECONDS) -> dict:
    """The profile of the unknown USB device `kind` ('usb:1963:00d1')."""
    dev = next((d for d in usb_devices if usb_id(d["vid"], d["pid"]) == kind), None)
    if dev is None:
        raise ProbeRefused(f"{kind} is not on USB now; plug it in and try again.")
    if not any(u["kind"] == kind for u in catalog.unrecognised(port_names, usb_devices)):
        raise ProbeRefused(f"{kind} is not an unknown instrument; nothing to learn.")
    ins = catalog.owned_ports(dev, port_names, usb_devices)
    outs = catalog.owned_ports(dev, out_names, usb_devices)
    audio = (audio_reader or read_usb_audio)(dev["product"])
    heard = listen(open_input, ins, seconds) if ins else []
    usb_src = _observed("USB descriptors reported by the operating system")
    label = catalog._label(dev)
    known = [f"USB identity: {label} ({dev['vid']:04x}:{dev['pid']:04x})"]
    known.append(f"USB audio: {audio['inputs']} in, {audio['outputs']} out, running at {audio['sample_rate']} Hz"
                 if audio else "No USB audio device reported")
    known.append("Serial control port present (not opened, contents not read)"
                 if dev["serial_port"] else "No serial control port")
    known.append(f"MIDI: in {', '.join(ins) or 'none'}; out {', '.join(outs) or 'none'}"
                 if ins or outs else "No MIDI port")
    if ins:
        known.append(f"Heard {len(heard)} message(s) in {seconds:g} s of listening")
    known.append("No controls known yet: nothing can be changed from ToneCommand")
    return {
        "schema": SCHEMA, "id": slug(dev), "label": label,
        "identity": {"vid": dev["vid"], "pid": dev["pid"], "maker": dev["maker"],
                     "product": dev["product"], "provenance": usb_src},
        "transports": {
            "midi_in": {"value": ins, "provenance": _observed("MIDI ports owned by the device")},
            "midi_out": {"value": outs, "provenance": _observed("MIDI ports owned by the device")},
            "usb_audio": {"value": audio,
                          "provenance": _observed("CoreAudio device report (the current sample rate)")},
            "serial_control": {"value": bool(dev["serial_port"]), "provenance": usb_src},
            "interfaces": {"value": [list(i) for i in dev["interfaces"]], "provenance": usb_src},
        },
        "observed": heard, "parameters": [], "verified_writes": [], "known": known,
        "probe": {"tool": TOOL, "bytes_sent": 0, "listened_seconds": seconds if ins else 0},
    }


def validate(profile: dict) -> list[str]:
    """Problems with a profile against schema 1; empty when it is sound."""
    errs = []
    for key in ("schema", "id", "label", "identity", "transports", "observed",
                "parameters", "verified_writes", "known", "probe"):
        if key not in profile:
            errs.append(f"missing {key}")
    if errs:
        return errs
    if profile["schema"] != SCHEMA:
        errs.append(f"schema {profile['schema']!r} is not {SCHEMA}")
    if profile["probe"].get("bytes_sent") != 0:
        errs.append("a probe profile must record zero bytes sent")
    entries = [profile["identity"], *profile["transports"].values(), *profile["observed"],
               *profile["parameters"], *profile["verified_writes"]]
    for e in entries:
        if not isinstance(e, dict) or not isinstance(e.get("provenance"), dict) or \
                e["provenance"].get("kind") not in ("observed", "documented", "verified"):
            errs.append(f"entry without provenance: {str(e)[:60]}")
    if re.search(r"serial.?number|kUSBSerial|iSerial|/Users/|/home/", json.dumps(profile), re.I):
        errs.append("a profile must not carry a serial number or a user path")
    return errs


def save(profile: dict, directory: Path | None = None) -> Path:
    errs = validate(profile)
    if errs:
        raise ProbeRefused("profile not saved: " + "; ".join(errs))
    directory = Path(LEARNED_DIR if directory is None else directory)
    directory.mkdir(parents=True, exist_ok=True)
    path = Path(directory) / f"{profile['id']}.json"
    path.write_text(json.dumps(profile, indent=1) + "\n", encoding="utf-8")
    return path
