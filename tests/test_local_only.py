"""#291: the server answers only to this machine, refuses cross-origin
writes, and Gig Lock waits for a write already in progress."""
import threading
import time

import pytest
from fastapi.testclient import TestClient

import server
from fm9.sim import SimFM9

WRITE = {"actions": [{"kind": "set_param", "block": "DISTORT", "instance": 1,
                      "param": "DISTORT_MID", "value": 6.0}]}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(server, "_fm9", SimFM9(server.reg))
    monkeypatch.setattr(server, "_snaps", {"undo": None, "a": None, "b": None})
    monkeypatch.setitem(server._gig_mode, "on", False)
    return TestClient(server.app)


@pytest.mark.parametrize("host", ["127.0.0.1:8909", "localhost:8909", "[::1]:8909",
                                  "127.0.0.1", "LOCALHOST:8909"])
def test_this_machine_is_served(client, host):
    assert client.get("/api/gig", headers={"host": host}).status_code == 200


@pytest.mark.parametrize("host", ["attacker.example:8909", "127.0.0.1.attacker.example",
                                  "192.168.0.10:8909", "", "localhost.attacker.example:8909"])
def test_another_name_is_refused_even_for_a_read(client, host):
    """DNS rebinding: a page on a name its owner points at 127.0.0.1."""
    r = client.get("/api/gig", headers={"host": host})
    assert r.status_code == 403
    assert client.post("/api/apply", json=WRITE, headers={"host": host}).status_code == 403
    assert server._snaps["undo"] is None          # nothing reached the rig


def test_a_cross_origin_write_is_refused_before_it_reaches_the_rig(client):
    for origin in ("http://attacker.example", "http://localhost:8909", "null",
                   "http://127.0.0.1:9999"):
        r = client.post("/api/apply", json=WRITE,
                        headers={"host": "127.0.0.1:8909", "origin": origin})
        assert r.status_code == 403, origin
    assert server._snaps["undo"] is None
    assert client.post("/api/gig", json={"on": True},
                       headers={"host": "127.0.0.1:8909",
                                "origin": "http://attacker.example"}).status_code == 403
    assert server._gig_mode["on"] is False


def test_the_page_itself_and_local_tools_still_write(client):
    same = client.post("/api/apply", json=WRITE,
                       headers={"host": "localhost:8909", "origin": "http://localhost:8909"})
    assert same.status_code == 200 and all(r["ok"] for r in same.json()["results"])
    plain = client.post("/api/apply", json=WRITE, headers={"host": "127.0.0.1:8909"})
    assert plain.status_code == 200 and all(r["ok"] for r in plain.json()["results"])


def test_a_cross_origin_read_is_left_to_the_browser(client):
    """Reads are not state-changing; the browser's same-origin policy already
    keeps their answers from another site's page."""
    r = client.get("/api/gig", headers={"host": "127.0.0.1:8909",
                                        "origin": "http://attacker.example"})
    assert r.status_code == 200


def _in_thread(fn):
    out = {}
    t = threading.Thread(target=lambda: out.setdefault("r", fn()), daemon=True)
    t.start()
    return t, out


def test_gig_lock_waits_for_the_write_in_progress(client):
    server._lock.acquire()                        # a write holding the rig
    try:
        t, out = _in_thread(lambda: client.post("/api/gig", json={"on": True}))
        time.sleep(0.3)
        assert t.is_alive(), "Gig Lock answered while a write was still sending"
        assert server._gig_mode["on"] is True     # nothing new may start
    finally:
        server._lock.release()
    t.join(5)
    assert out["r"].json() == {"gig_mode": True, "settled": True}


def test_gig_lock_says_when_the_write_outlasts_the_wait(client, monkeypatch):
    monkeypatch.setattr(server, "_GIG_SETTLE_SECONDS", 0.1)
    server._lock.acquire()
    try:
        r = client.post("/api/gig", json={"on": True})
    finally:
        server._lock.release()
    assert r.json() == {"gig_mode": True, "settled": False}


def test_switching_gig_lock_off_does_not_wait(client):
    server._gig_mode["on"] = True
    server._lock.acquire()
    try:
        r = client.post("/api/gig", json={"on": False})
    finally:
        server._lock.release()
    assert r.json() == {"gig_mode": False, "settled": True}


@pytest.mark.parametrize("path,body", [
    ("/api/apply", WRITE),
    ("/api/level-adjust", {"text": "turn everything down 3 dB"}),
])
def test_a_write_queued_behind_the_lock_refuses_once_gig_lock_is_on(client, path, body):
    """It passed its own Gig Lock check, then waited for the rig."""
    server._lock.acquire()
    try:
        t, out = _in_thread(lambda: client.post(path, json=body))
        time.sleep(0.3)
        assert t.is_alive()
        server._gig_mode["on"] = True
    finally:
        server._lock.release()
    t.join(5)
    assert out["r"].status_code == 423
    assert "nothing was sent" in out["r"].json()["error"]
    assert server._snaps["undo"] is None


def test_every_gig_checked_write_rechecks_under_the_lock_by_name():
    """A route that checks Gig Lock and then takes the device lock must check
    again inside it, or a write queued behind another can land after Gig Lock
    said on. Read from the source so a new write route cannot skip it."""
    import inspect
    import re
    src = inspect.getsource(server)
    for name in ("api_sound_check", "api_sound_check_remeasure", "api_tone_match",
                 "api_preset", "api_level_adjust", "api_copy_effects", "api_reorder",
                 "api_compose", "api_rename_slot", "api_clear_slot", "api_build_scratch",
                 "api_new_preset", "_apply_for"):
        body = inspect.getsource(getattr(server, name))
        after = body.split("with _lock:", 1)[1]
        assert re.match(r'\s*if _gig_mode\["on"\]', after), name
    assert src.count("return _gig_came_on()") >= 13


def test_no_route_checks_gig_lock_then_takes_the_lock_without_checking_again():
    """Every function, not a fixed list: a new write route written in the old
    shape (check, then wait for the lock, then write) fails here."""
    import inspect
    import re
    for name, fn in vars(server).items():
        if not inspect.isfunction(fn) or fn.__module__ != "server":
            continue
        body = inspect.getsource(fn)
        if "with _lock:" not in body:
            continue
        before, after = body.split("with _lock:", 1)
        if '_gig_mode["on"]' in before:
            assert re.match(r'\s*if _gig_mode\["on"\]', after), name


def _asgi(headers, method="POST", kind="http"):
    """Drive the middleware with raw headers, duplicates included."""
    import asyncio
    reached, sent = [], []

    async def inner(scope, receive, send):
        reached.append(scope)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    scope = {"type": kind, "method": method, "path": "/api/apply",
             "headers": [(k.encode(), v.encode()) for k, v in headers]}
    asyncio.run(server._LocalOnly(inner)(scope, receive, send))
    return bool(reached)


@pytest.mark.parametrize("headers", [
    [("host", "attacker.example"), ("host", "localhost:8909")],
    [("host", "localhost:8909"), ("host", "localhost:8909")],
    [("host", "localhost:8909"), ("origin", "http://attacker.example"),
     ("origin", "http://localhost:8909")],
    [("host", "localhost:8909"), ("origin", "https://localhost:8909")],
    [("host", "[::1].attacker.example:8909")],
    [("host", "localhost:garbage")],
    [("host", "localhost.:8909")],
    [],
])
def test_ambiguous_or_malformed_headers_are_refused(headers):
    assert _asgi(headers) is False


@pytest.mark.parametrize("headers", [
    [("host", "127.0.0.1:8909"), ("origin", "http://127.0.0.1:8909")],
    [("host", "[::1]:8909"), ("origin", "http://[::1]:8909")],
    [("host", "localhost:8909")],
])
def test_the_exact_local_shapes_pass(headers):
    assert _asgi(headers) is True


def test_gig_lock_waits_for_a_routing_recovery_too(client, monkeypatch):
    monkeypatch.setattr(server, "_GIG_SETTLE_SECONDS", 0.1)
    server._journal_lock.acquire()
    try:
        r = client.post("/api/gig", json={"on": True})
    finally:
        server._journal_lock.release()
    assert r.json() == {"gig_mode": True, "settled": False}


def test_a_routing_recovery_during_a_set_is_kept_for_later(monkeypatch):
    from fm9 import routing
    def forbidden(fm9):
        pytest.fail("routing journal written while Gig Lock was on")
    monkeypatch.setattr(routing, "restore_outstanding", forbidden)
    monkeypatch.setitem(server._gig_mode, "on", True)
    server._restore_routing_journal(object())


def test_a_cab_audition_is_not_put_back_during_a_set(monkeypatch):
    monkeypatch.setitem(server._gig_mode, "on", True)
    monkeypatch.setattr(server, "_audition", {"open": True, "original": (1, 2),
                                              "last_error": None})
    def forbidden(*a):
        pytest.fail("cab written while Gig Lock was on")
    monkeypatch.setattr(server, "_select_cab", forbidden)
    ok, detail = server._audition_restore(object())
    assert ok is False and "Gig Lock" in detail
    assert server._audition["open"] is True       # retried after the set


def test_the_debug_poke_respects_gig_lock(client, monkeypatch):
    monkeypatch.setenv("TONECOMMAND_DEBUG", "1")
    server._gig_mode["on"] = True
    r = client.post("/api/_moddebug", json={"slot": 1, "op": "poke", "pid": 1, "value": 0.5})
    assert r.status_code == 423


def test_the_page_says_when_gig_lock_is_on_but_not_settled():
    from pathlib import Path
    page = (Path(server.__file__).parent / "ui" / "index.html").read_text(encoding="utf-8")
    fn = page.split("async function toggleGig()", 1)[1].split("\n}\n", 1)[0]
    assert "d.settled === false" in fn and "still sending" in fn
