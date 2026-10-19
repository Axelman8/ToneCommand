"""#245: a source that describes several rigs (eras, tours) lists each, and
the page asks which one to build instead of silently taking the newest."""
import json
import subprocess
import sys
from pathlib import Path

sys.argv = ["x"]
import pytest
from fastapi.testclient import TestClient

import server
from fm9 import describe

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / "ui" / "index.html").read_text(encoding="utf-8")


def node(i, role, label):
    return {"id": i, "role": role, "label": label, "provenance": "observed"}


def edge(f, t):
    return {"from": f, "to": t, "kind": "audio", "provenance": "observed"}


FM9_RIG = {"nodes": [node("g", "instrument", "Guitar"), node("fm9", "rack_fx", "FM9")],
           "edges": [edge("g", "fm9")]}
BOARD_RIG = {"nodes": [node("g", "instrument", "Guitar"), node("ts", "drive", "TS808"),
                       node("v", "amp", "Victory"), node("c", "cab", "2x12")],
             "edges": [edge("g", "ts"), edge("ts", "v"), edge("v", "c")]}
READER = {"found": True, "summary": "Marco Sfogli's rigs over the years", "scenes": [], "stated": [],
          "vague": [], "quotes": [], "rig": None,
          "rigs": [{"name": "2022-now", "summary": "FM9 straight to the PA", "stated": [], "rig": FM9_RIG},
                   {"name": "2015-16", "summary": "Pedalboard into a Victory",
                    "stated": ["TS808 gain at 9 o'clock"], "rig": BOARD_RIG},
                   {"name": "2005", "summary": "Triaxis rack", "stated": [],
                    "rig": {"nodes": [{"id": "x"}], "edges": [{"from": "x", "to": "nowhere"}]}}]}


def test_several_rigs_are_listed_and_none_is_picked():
    spec = describe._parse_spec(json.dumps(READER))
    assert spec["rig"] is None
    assert [r["name"] for r in spec["rigs"]] == ["2022-now", "2015-16", "2005"]
    assert spec["rigs"][1]["rig"]["nodes"][1]["label"] == "TS808"
    assert spec["rigs"][1]["stated"] == ["TS808 gain at 9 o'clock"]
    # an invalid graph keeps its name and summary, with no graph and its problems
    assert spec["rigs"][2]["rig"] is None and spec["rigs"][2]["rig_problems"]
    assert spec["rigs"][2]["summary"] == "Triaxis rack"


@pytest.mark.parametrize("rigs", [None, [], [{"name": "only", "summary": "s", "rig": BOARD_RIG}],
                                  [{"summary": "no name", "rig": BOARD_RIG}], "not a list"])
def test_one_rig_or_none_keeps_the_single_rig_path(rigs):
    body = dict(READER, rig=None, rigs=rigs) if rigs is not None else dict(READER, rig=BOARD_RIG)
    if rigs is None:
        del body["rigs"]
    spec = describe._parse_spec(json.dumps(body))
    assert "rigs" not in spec
    if rigs is None or (isinstance(rigs, list) and len(rigs) == 1 and "name" in rigs[0]):
        assert spec["rig"]["nodes"][1]["label"] == "TS808"


def test_reader_prompt_asks_for_rigs():
    assert '"rigs": a list, newest first' in describe.EXTRACT_TASK


def test_route_explains_each_rig(monkeypatch):
    monkeypatch.setattr(describe, "read_source", lambda raw, on_stage=None: {
        "text": raw, "kind": "text", "url": None, "title": "", "notes": []})
    monkeypatch.setattr(describe, "extract", lambda text, cancel=None: describe._parse_spec(json.dumps(READER)))
    r = TestClient(server.app).post("/api/describe/read", json={"source": "his gear page"})
    assert r.status_code == 200, r.text
    spec = r.json()
    assert spec["rig"] is None and spec["rig_explain"] == []
    assert spec["rigs"][1]["rig_explain"][0] == "Signal: Guitar -> TS808 -> Victory -> 2x12"
    assert spec["rigs"][2]["rig_explain"] == []


HARNESS = """
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const start = src.indexOf("// #245: a page listing several rigs");
const end = src.indexOf("function askAboutBuild(spec, note) {", start);
if (start < 0 || end < 0) { console.log("EXTRACT FAILED"); process.exit(1); }
const sc = JSON.parse(process.argv[3]);
const els = { srcask: { innerHTML: "", hidden: true, querySelectorAll: () => [] } };
const $ = id => els[id];
const esc = s => String(s).replace(/</g, "&lt;");
const asked = [];
const api = new Function("$", "esc", "askAboutBuild",
  src.slice(start, end) + "\\nreturn {pickRig, askWhichRig};")($, esc, (s, n) => asked.push(s));
api.askWhichRig(sc.spec, "note");
console.log(JSON.stringify({ html: els.srcask.innerHTML, hidden: els.srcask.hidden,
  picked: api.pickRig(sc.spec, 1), none: api.pickRig(sc.spec, 9) === sc.spec, asked }));
"""


def test_page_asks_which_rig_then_builds_the_pick(tmp_path):
    spec = describe._parse_spec(json.dumps(READER))
    spec["rigs"][1]["rig_explain"] = ["Signal: Guitar -> TS808 -> Victory -> 2x12"]
    h = tmp_path / "pick.mjs"
    h.write_text(HARNESS, encoding="utf-8")
    out = subprocess.run(["node", str(h), str(ROOT / "ui" / "index.html"), json.dumps({"spec": spec})],
                         capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    r = json.loads(out.stdout)
    assert "This source describes 3 rigs" in r["html"] and r["hidden"] is False
    assert r["html"].count('class="rigchoice"') == 3 and "Pedalboard into a Victory" in r["html"]
    assert r["asked"] == []                       # nothing built before a pick
    p = r["picked"]
    assert p["summary"] == "Pedalboard into a Victory" and p["picked_rig"] == "2015-16"
    assert p["rig"]["nodes"][2]["label"] == "Victory" and p["stated"] == ["TS808 gain at 9 o'clock"]
    assert p["rig_explain"] == ["Signal: Guitar -> TS808 -> Victory -> 2x12"] and "rigs" not in p
    assert r["none"] is True


def test_page_routes_several_rigs_to_the_chooser():
    i = PAGE.index("// #245: and when it describes several rigs")
    assert "if ((spec.rigs || []).length > 1) askWhichRig(spec, note);" in PAGE[i:i + 200]
    assert "else askAboutBuild(spec, note);" in PAGE[i:i + 200]
