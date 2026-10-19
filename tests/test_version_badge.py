"""#264: the running version is always visible on the main screen, and a
build that is not the tagged release of its own version says so."""
import json
import subprocess
import sys
from pathlib import Path

sys.argv = ["x"]
import pytest
from fastapi.testclient import TestClient

import server
from fm9 import updates

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / "ui" / "index.html").read_text(encoding="utf-8")


@pytest.fixture
def version(monkeypatch):
    monkeypatch.setattr(updates, "current_version", lambda: "1.5.15")
    monkeypatch.setattr(updates, "latest_release", lambda root: {"version": "1.5.15", "url": "u"})
    monkeypatch.setattr(updates, "can_auto_update", lambda root: (False, ""))

    def get(head, state=None):
        monkeypatch.setattr(updates, "head_info", lambda root: head)
        monkeypatch.setattr(updates, "repo_state", lambda root: state or
                            {"git": True, "branch": "main", "clean": True})
        return TestClient(server.app).get("/api/version").json()
    return get


def test_version_release_build(version):
    d = version({"commit": "9ed8751", "tags": ["v1.5.15"]})
    assert (d["current"], d["commit"], d["release"]) == ("1.5.15", "9ed8751", True)


@pytest.mark.parametrize("head", [{"commit": "a2b2314", "tags": []},
                                  {"commit": "a2b2314", "tags": ["v1.5.14", "nightly"]}])
def test_version_not_the_release_tag(version, head):
    assert version(head)["release"] is False


def test_version_outside_git(version):
    d = version({"commit": None, "tags": []}, {"git": False, "branch": None, "clean": False})
    assert d["commit"] is None and d["release"] is False and d["git"] is False


def test_version_head_info_never_raises(monkeypatch, tmp_path):
    assert updates.head_info(tmp_path) == {"commit": None, "tags": []}     # not a checkout
    monkeypatch.setattr(updates, "is_git_checkout", lambda root: True)
    monkeypatch.setattr(updates.subprocess, "run", lambda *a, **k: 1 / 0)
    assert updates.head_info(tmp_path) == {"commit": None, "tags": []}


HARNESS = """
import { readFileSync } from "node:fs";
const src = readFileSync(process.argv[2], "utf8");
const start = src.indexOf("function versionBadgeText(d) {");
const end = src.indexOf("\\n}\\n", start) + 3;
const f = new Function(src.slice(start, end) + "\\nreturn versionBadgeText;")();
console.log(JSON.stringify(JSON.parse(process.argv[3]).map(f)));
"""


def test_version_badge_text(tmp_path):
    cases = [
        {"current": "1.5.15", "git": True, "release": True, "branch": "main", "commit": "9ed8751"},
        {"current": "1.5.15", "git": True, "release": False, "branch": "main", "commit": "a2b2314"},
        {"current": "1.5.15", "git": True, "release": False, "branch": "claude/lane-re", "commit": "1234567"},
        {"current": "1.5.15", "git": False, "release": False, "branch": None, "commit": None},
        {}, None]
    h = tmp_path / "badge.mjs"
    h.write_text(HARNESS, encoding="utf-8")
    out = subprocess.run(["node", str(h), str(ROOT / "ui" / "index.html"), json.dumps(cases)],
                         capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    assert json.loads(out.stdout) == ["v1.5.15", "v1.5.15 + main a2b2314",
                                      "v1.5.15 + claude/lane-re 1234567", "v1.5.15", "", ""]


def test_version_badge_is_on_the_main_screen():
    header = PAGE[PAGE.index('<header id="hwbar">'):PAGE.index('<div class="hwtarget">')]
    assert 'id="verbadge"' in header
    i = PAGE.index("function renderVersion(d) {")
    assert "badge.textContent = versionBadgeText(d)" in PAGE[i:i + 400]
