"""Local cabinet-name imports. These are catalogues, NEVER IR installs."""
import csv
import io
import re


def parse_names(text: str, kind: str) -> dict[tuple[int, int], str]:
    if kind not in {"user", "factory"}:
        raise ValueError("List type must be User or Factory.")
    prefix = "U" if kind == "user" else "F"
    limit = 512 if kind == "user" else 1024
    entries = {}
    for raw in text.splitlines():
        line = raw.strip().lstrip('\ufeff')
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(r"([UF])([1-9])\.(\d{1,4})\s+(.+)", line, re.I)
        if match:
            p, bank, slot, name = match.groups()
            if p.upper() != prefix:
                raise ValueError(f"This is not a {kind} list: {line[:40]}")
        elif ',' in line or ';' in line or '\t' in line:
            delimiter = '\t' if '\t' in line else ';' if ';' in line else ','
            row = next(csv.reader(io.StringIO(line), delimiter=delimiter))
            if row and row[0].strip().lower() == 'bank':
                continue
            if len(row) != 3:
                raise ValueError("CSV columns must be bank,slot,name.")
            bank, slot, name = (x.strip() for x in row)
            bank_type = re.match(r'^(USER|FACTORY|[UF])', bank, re.I)
            if bank_type and bank_type[1].upper()[0] != prefix:
                raise ValueError(f'This is not a {kind} list: {bank}')
            bank = re.sub(r'^(?:USER|FACTORY|[UF])\s*', '', bank, flags=re.I)
        else:
            if re.match(r'[UF]\d', line, re.I):
                raise ValueError(f"Invalid cabinet entry: {line[:60]}")
            continue  # Export headings are not entries.
        try:
            bank, slot = int(bank), int(slot)
        except ValueError:
            raise ValueError("Bank and slot must be whole numbers.") from None
        if bank not in (1, 2) or not 1 <= slot <= limit:
            raise ValueError(f"{kind.title()} banks are 1–2; slots are 1–{limit}.")
        name = re.sub(r'\s+\(\*\)\s*$', '', name).strip()
        if not name or len(name) > 160 or any(ord(c) < 32 for c in name):
            raise ValueError("Cabinet names must contain 1–160 printable characters.")
        key = (bank, slot)
        if key in entries and entries[key] != name:
            raise ValueError(f"Conflicting names for {prefix}{bank}.{slot:04d}.")
        entries[key] = name
    if not entries:
        raise ValueError(f"No {prefix}1.0001-style entries or bank,slot,name CSV found.")
    return entries


def wire_address(kind, bank, slot):
    """Convert explicit display bank/slot, never infer the other device's bank."""
    if kind not in {"factory", "user"} or type(bank) is not int or type(slot) is not int:
        raise ValueError("Explicit list kind and integer bank/slot required")
    limit = 512 if kind == "user" else 1024
    if bank not in (1, 2) or slot not in range(1, limit + 1):
        raise ValueError("Cab bank/slot outside the verified range")
    return (2, (bank - 1) * 512 + slot - 1) if kind == "user" else (bank - 1, slot - 1)


class Catalog:
    """Names are local user-supplied metadata, never evidence an IR is audible."""

    def __init__(self):
        self.names = {}

    def import_text(self, text, kind, *, replace=False):
        if not isinstance(text, str) or len(text.encode("utf-8")) > 2 * 1024 * 1024:
            raise ValueError("Cab name list exceeds 2 MiB or is not text")
        parsed = parse_names(text, kind)
        incoming = {wire_address(kind, b, s): n for (b, s), n in parsed.items()}
        merged = {key: name for key, name in self.names.items()
                  if not replace or (key[0] == 2) != (kind == "user")}
        merged.update(incoming)
        self.names = merged
        return len(incoming)

    def resolve(self, name, bank=None):
        matches = [(b, o, n) for (b, o), n in self.names.items()
                   if n.casefold() == name.strip().casefold() and (bank is None or b == bank)]
        if len(matches) != 1:
            raise ValueError("Cab name is unknown or ambiguous; choose an explicit bank and slot")
        return matches[0]

    def position(self, bank, ordinal):
        if type(bank) is not int or type(ordinal) is not int or bank not in (0, 1, 2) or ordinal not in range(1024):
            raise ValueError("Unknown Axe-Fx III IR address")
        return (f"USER {ordinal // 512 + 1} slot {ordinal % 512 + 1}"
                if bank == 2 else f"FACTORY {bank + 1} slot {ordinal + 1}")
