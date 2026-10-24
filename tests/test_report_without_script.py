"""#282: the version and a problem report survive a page whose script never
runs. #281 was a 1.5.3 page that rendered but did nothing; its version badge
and its Report a problem button both lived in the script that had failed, so
the report was written by hand from a PowerShell screenshot."""
import re
import sys
from pathlib import Path

sys.argv = ["x"]
import pytest
from fastapi.testclient import TestClient

import server
from fm9 import diagnostics, updates

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / "ui" / "index.html").read_text(encoding="utf-8")


@pytest.fixture
def release(monkeypatch):
    monkeypatch.setattr(updates, "current_version", lambda: "1.6.1")
    monkeypatch.setattr(updates, "head_info", lambda root: {"commit": "abc1234", "tags": ["v1.6.1"]})
    monkeypatch.setattr(updates, "repo_state", lambda root: {"git": True, "branch": "main", "clean": True})


def badge(html):
    return re.search(r'id="verbadge"[^>]*>([^<]*)</span>', html).group(1)


def test_the_server_fills_in_the_version_badge(release):
    html = TestClient(server.app).get("/").text
    assert badge(html) == "v1.6.1"


def test_a_dev_build_badge_says_branch_and_commit(monkeypatch, release):
    monkeypatch.setattr(updates, "head_info", lambda root: {"commit": "abc1234", "tags": []})
    monkeypatch.setattr(updates, "repo_state", lambda root: {"git": True, "branch": "fix", "clean": True})
    assert badge(TestClient(server.app).get("/").text) == "v1.6.1 + fix abc1234"


def test_a_broken_version_lookup_still_serves_the_page(monkeypatch):
    def boom():
        raise RuntimeError("no metadata")
    monkeypatch.setattr(updates, "current_version", boom)
    r = TestClient(server.app).get("/")
    assert r.status_code == 200 and badge(r.text) == ""


def test_the_page_is_not_cached(release):
    assert TestClient(server.app).get("/").headers["cache-control"] == "no-cache"


def test_the_not_started_notice_names_the_version_and_the_report(release):
    html = TestClient(server.app).get("/").text
    notice = re.search(r'<div class="bootfail" id="bootfail"[^>]*>(.*?)</div>', html, re.S).group(1)
    assert "v1.6.1" in notice and 'href="/report"' in notice


def test_the_notice_is_removed_by_the_last_statement_of_the_script():
    """A parse error, or a throw anywhere earlier, leaves the notice up."""
    script = PAGE[PAGE.rindex("<script>"):PAGE.rindex("</script>")]
    last = [line for line in script.strip().splitlines() if line.strip()
            and not line.strip().startswith("//")][-1]
    assert last.strip() == "$('bootfail')?.remove();"


def test_the_notice_waits_before_showing():
    """It must not flash while a healthy script is still starting."""
    rule = re.search(r"\.bootfail \{(.*?)\}", PAGE, re.S).group(1)
    assert "visibility: hidden" in rule and "animation: bootfail-show" in rule


def test_a_page_whose_script_does_not_parse_still_points_at_the_report(monkeypatch, tmp_path, release):
    """The issue's definition of done: break the script on purpose."""
    (tmp_path / "ui").mkdir()
    broken = PAGE.replace("setInterval(refresh, 5000);", "setInterval(refresh, 5000); function (", 1)
    (tmp_path / "ui" / "index.html").write_text(broken, encoding="utf-8")
    real = server.resource_path
    monkeypatch.setattr(server, "resource_path",
                        lambda *p: tmp_path.joinpath(*p) if p == ("ui", "index.html") else real(*p))
    client = TestClient(server.app)
    html = client.get("/").text
    assert badge(html) == "v1.6.1" and 'href="/report"' in html
    r = client.get("/report")
    assert r.status_code == 200 and "Environment" in r.text


def test_the_report_page_needs_no_script(release):
    r = TestClient(server.app).get("/report")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "<script" not in r.text.lower()
    assert "ToneCommand v1.6.1" in r.text
    assert "**Environment**" in r.text and "- OS: " in r.text
    assert "github.com/monzta1/ToneCommand/issues/new" in r.text


def test_the_report_page_carries_the_note_escaped(release):
    r = TestClient(server.app).get("/report", params={"note": "<img src=x onerror=alert(1)> clicks do nothing"})
    assert "<img src=x" not in r.text
    assert "&lt;img src=x onerror=alert(1)&gt; clicks do nothing" in r.text


def test_the_report_page_survives_a_broken_package(monkeypatch, release):
    def boom(**kw):
        raise OSError("log unreadable")
    monkeypatch.setattr(diagnostics, "package_for_sharing", boom)
    r = TestClient(server.app).get("/report")
    assert r.status_code == 200 and "could not be built: OSError" in r.text


def test_settings_can_always_open_report_a_problem():
    assert 'id="aboutreport"' in PAGE
    assert "$('aboutreport').onclick = () => openReport();" in PAGE


def test_startup_names_the_version_and_the_report(monkeypatch, capsys):
    monkeypatch.setattr(updates, "current_version", lambda: "1.6.1")
    monkeypatch.setattr(server, "start_bus_watch", lambda: None)
    monkeypatch.setattr(server.ai_settings, "apply_to_env", lambda: None)
    import uvicorn
    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: None)
    monkeypatch.delenv("TONECOMMAND_PORT", raising=False)
    server.main()
    out = capsys.readouterr().out
    assert "ToneCommand 1.6.1: open http://127.0.0.1:8909" in out
    assert "If the page does not respond: http://127.0.0.1:8909/report" in out
