"""USB identity for discovery (#258): which devices are on USB, by maker and
product, read from what the operating system already knows. Nothing is
opened and nothing is sent: on macOS this is ioreg's view of the device tree,
on Linux the files under /sys/bus/usb/devices, on Windows the Plug and Play
device list through PowerShell (#263).

Why USB at all: a device with no MIDI port (the ToneX One is a USB audio
interface plus a serial control port) is invisible to a MIDI-name catalog,
so plugging it in used to produce no response at all.

Serial numbers are dropped while parsing. They identify one person's unit,
and nothing downstream (the page, a DDLP profile, a problem report) needs
them.
"""
from __future__ import annotations

import json
import plistlib
import re
import subprocess
import sys
import time
from pathlib import Path

#: How long one reading is reused. Discovery is asked every poll; ioreg is
#: cheap but not free.
CACHE_SECONDS = 3.0
_cache: dict = {"at": 0.0, "devices": None}


def _device(vid, pid, maker, product, interfaces, serial_port) -> dict:
    return {"vid": int(vid), "pid": int(pid),
            "maker": str(maker or "").strip(), "product": str(product or "").strip(),
            "interfaces": sorted({(int(c), int(s)) for c, s in interfaces}),
            "serial_port": serial_port}


def parse_ioreg(data: bytes) -> list[dict]:
    """Devices from `ioreg -r -c IOUSBHostDevice -l -a` (a plist array of
    device nodes, each with its interfaces and their children)."""
    roots = plistlib.loads(data)
    roots = roots if isinstance(roots, list) else [roots]
    out = []
    for node in roots:
        if not isinstance(node, dict) or "idVendor" not in node or "idProduct" not in node:
            continue
        interfaces, ttys = set(), []

        def walk(n):
            # a downstream USB device (behind a hub) owns its own interfaces
            # and serial port, and ioreg lists it as a device of its own.
            # Interface nodes carry idVendor too; a device node has no
            # interface class.
            if not isinstance(n, dict) or ("idVendor" in n and "bInterfaceClass" not in n):
                return
            if "bInterfaceClass" in n:
                interfaces.add((n["bInterfaceClass"], n.get("bInterfaceSubClass", 0)))
            if isinstance(n.get("IOCalloutDevice"), str):
                ttys.append(n["IOCalloutDevice"])
            for child in n.get("IORegistryEntryChildren", ()) or ():
                walk(child)

        for child in node.get("IORegistryEntryChildren", ()) or ():
            walk(child)
        out.append(_device(node["idVendor"], node["idProduct"],
                           node.get("USB Vendor Name") or node.get("kUSBVendorString"),
                           node.get("USB Product Name") or node.get("kUSBProductString"),
                           interfaces, ttys[0] if ttys else None))
    return out


def read_sysfs(root: Path = Path("/sys/bus/usb/devices")) -> list[dict]:
    """Devices from Linux sysfs: one directory per device (idVendor,
    idProduct, manufacturer, product), interfaces in '<dev>:<cfg>.<n>'
    subdirectories (bInterfaceClass, bInterfaceSubClass, a ttyACM* child)."""
    def text(p: Path) -> str:
        try:
            return p.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            return ""

    out = []
    for dev in sorted(root.glob("*")) if root.is_dir() else ():
        vid, pid = text(dev / "idVendor"), text(dev / "idProduct")
        if not vid or not pid or ":" in dev.name:
            continue
        interfaces, tty = set(), None
        for itf in sorted(dev.glob(f"{dev.name}:*")):
            c, s = text(itf / "bInterfaceClass"), text(itf / "bInterfaceSubClass")
            if c:
                interfaces.add((int(c, 16), int(s or "0", 16)))
            for t in sorted(itf.glob("tty/tty*")) + sorted(itf.glob("ttyACM*")):
                tty = tty or f"/dev/{t.name}"
        out.append(_device(int(vid, 16), int(pid, 16), text(dev / "manufacturer"),
                           text(dev / "product"), interfaces, tty))
    return out


_VIDPID = re.compile(r"^USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})(&MI_[0-9A-F]{2})?\\", re.I)
#: an interface's class; a composite device's own DevClass_EF is not one
_CLASS = re.compile(r"(?<![A-Za-z])Class_([0-9A-F]{2})(?:&SubClass_([0-9A-F]{2}))?", re.I)
_COM = re.compile(r"\((COM\d+)\)")
#: The Windows reader: USB Plug and Play entries, the fields it needs, as JSON.
PS_COMMAND = ("Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPDeviceID -like 'USB\\*' } | "
              "Select-Object PNPDeviceID, Name, Manufacturer, PNPClass, CompatibleID | "
              "ConvertTo-Json -Depth 3 -Compress")


def parse_windows(text: str) -> list[dict]:
    """Devices from PowerShell's Win32_PnPEntity JSON (#263). The device ID
    gives vendor and product (USB\\VID_1963&PID_00D1\\<instance>); the
    instance part, which can be a serial number, is never kept. A composite
    device's interfaces (&MI_nn) fold into it, each giving its class from
    CompatibleID (USB\\Class_01&SubClass_03); a Ports entry gives (COMn)."""
    try:
        rows = json.loads(text or "[]")
    except ValueError:
        return []
    rows = rows if isinstance(rows, list) else [rows]
    devices: dict[tuple, dict] = {}
    for r in rows:
        if not isinstance(r, dict):
            continue
        m = _VIDPID.match(str(r.get("PNPDeviceID") or ""))
        if not m:
            continue
        key = (int(m.group(1), 16), int(m.group(2), 16))
        d = devices.setdefault(key, {"maker": "", "product": "", "interfaces": set(), "serial_port": None})
        compat = r.get("CompatibleID") or []
        compat = compat if isinstance(compat, list) else [compat]
        for c in compat:
            cm = _CLASS.search(str(c))
            if cm:
                d["interfaces"].add((int(cm.group(1), 16), int(cm.group(2) or "0", 16)))
                break
        if str(r.get("PNPClass") or "").lower() == "ports":
            com = _COM.search(str(r.get("Name") or ""))
            d["serial_port"] = d["serial_port"] or (com.group(1) if com else None)
        elif not m.group(3):
            # the parent device names the product; an interface names itself
            d["product"] = str(r.get("Name") or d["product"])
            d["maker"] = str(r.get("Manufacturer") or d["maker"])
    return [_device(v, p, d["maker"], d["product"], d["interfaces"], d["serial_port"])
            for (v, p), d in sorted(devices.items())]


def read_windows() -> list[dict]:
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", PS_COMMAND],
                       capture_output=True, text=True, timeout=15)
    return parse_windows(r.stdout) if r.returncode == 0 and r.stdout.strip() else []


def _read() -> list[dict]:
    if sys.platform == "darwin":
        r = subprocess.run(["ioreg", "-r", "-c", "IOUSBHostDevice", "-l", "-a"],
                           capture_output=True, timeout=5)
        return parse_ioreg(r.stdout) if r.returncode == 0 and r.stdout else []
    if sys.platform.startswith("linux"):
        return read_sysfs()
    if sys.platform == "win32":
        return read_windows()
    return []


def list_usb(now: float | None = None, fresh: bool = False) -> list[dict]:
    """Every USB device the system reports, read at most every CACHE_SECONDS
    unless `fresh`. Never raises: a reader that fails means no USB identity,
    not an error."""
    now = time.monotonic() if now is None else now
    if not fresh and _cache["devices"] is not None and 0 <= now - _cache["at"] < CACHE_SECONDS:
        return _cache["devices"]
    try:
        devices = _read()
    except Exception:      # noqa: BLE001  discovery must never fail the page
        devices = []
    _cache.update(at=now, devices=devices)
    return devices


def usb_id(vid: int, pid: int) -> str:
    """The id a USB-only device is known by on the page: 'usb:1963:00d1'."""
    return f"usb:{vid:04x}:{pid:04x}"
