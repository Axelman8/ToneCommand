"""#244: the four-cable method. A processor in front of the amp AND in its
effects loop is a standard topology, not an unresolved loop: it compiles as
two positions, the amp's onward cables run behind the loop, effects land by
kind, and an unnamed rack unit says exactly why it is not built."""
import pytest

from devices.ir2.adapter import IR2Adapter
from devices.ir2.sim import SimIR2
from fm9 import rigcompile as rc, riggraph as rg


def n(i, role="other", label=None):
    return {"id": i, "role": role, "label": label or i, "provenance": "observed"}


def e(i, f, t, kind="audio"):
    return {"id": i, "from": f, "to": t, "kind": kind, "provenance": "observed"}


def rig(proc_role="rack_fx", proc_label="FX1", with_return=False, amp_to_cab=True, proc_to_cab=False):
    """Guitar -> P -> amp, amp -> P (send), optionally P -> amp (return),
    amp -> cab and/or P -> cab: the ways readers draw the four-cable method."""
    edges = [e("in", "gtr", "p"), e("pa", "p", "amp"), e("send", "amp", "p", "send_return")]
    if with_return:
        edges.append(e("ret", "p", "amp", "send_return"))
    if amp_to_cab:
        edges.append(e("out", "amp", "cab"))
    if proc_to_cab:
        edges.append(e("pcab", "p", "cab"))
    return {"nodes": [n("gtr", "instrument", "Guitar"), n("p", proc_role, proc_label),
                      n("amp", "amp", "Mezzabarba"), n("cab", "cab", "2x12")], "edges": edges}


SHAPES = {"review case: no return, amp feeds the cab": rig(),
          "drawn return": rig(with_return=True),
          "processor feeds the cab": rig(amp_to_cab=False, proc_to_cab=True)}
MODES = ("closest", "faithful", "simplified")


def ids(graph):
    return ({x["id"] for x in graph["nodes"]}, {x["id"] for x in graph["edges"]})


def test_four_cable_is_recognised():
    assert rg.four_cable(rig()) == [{"processor": "p", "amp": "amp"}]


@pytest.mark.parametrize("graph", [
    # a plain chain, a processor only in the loop with no input feed, a loop
    # between two pedals: none is the four-cable method
    {"nodes": [n("gtr", "instrument"), n("p", "rack_fx"), n("amp", "amp"), n("cab", "cab")],
     "edges": [e("a", "gtr", "p"), e("b", "p", "amp"), e("c", "amp", "cab")]},
    {"nodes": [n("gtr", "instrument"), n("p", "rack_fx"), n("amp", "amp"), n("cab", "cab")],
     "edges": [e("a", "gtr", "amp"), e("b", "amp", "p", "send_return"), e("c", "p", "cab")]},
    {"nodes": [n("x", "drive"), n("y", "delay")], "edges": [e("a", "x", "y"), e("b", "y", "x")]},
])
def test_four_cable_is_not_seen_where_it_is_not(graph):
    assert rg.four_cable(graph) == []
    assert rg.split_four_cable(graph)["nodes"] == rg.normalize(graph)["nodes"]


@pytest.mark.parametrize("name", SHAPES)
def test_split_keeps_every_edge_id_and_reads_as_one_chain(name):
    g = SHAPES[name]
    split = rg.split_four_cable(g)
    assert {x["id"] for x in split["edges"]} == ids(g)[1]
    walked = rg.audio_paths(split)
    assert walked["cycles"] == []
    assert [p["nodes"] for p in walked["paths"]] == [["gtr", "p@pre", "amp", "p@loop", "cab"]]


@pytest.mark.parametrize("name", SHAPES)
def test_explain_names_the_method_and_no_loop(name):
    lines = rg.explain(SHAPES[name])
    assert lines[0] == "Four-cable method: FX1 runs before the Mezzabarba and in its effects loop."
    assert "Signal: Guitar -> FX1 (before the amp) -> Mezzabarba -> FX1 (in the amp's loop) -> 2x12" in lines
    assert not any(l.startswith("Unresolved loop") for l in lines)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("name", SHAPES)
def test_compile_rack_unit_one_chain_honest_reason_every_mode(name, mode):
    g = SHAPES[name]
    c = rc.compile(g, mode)
    st = c["status"]
    assert (set(st["nodes"]), set(st["edges"])) == ids(g)     # one state per original id
    assert len(c["scenes"]) == 1
    assert [s["block"] for s in c["scenes"][0]["chain"]] == ["amp", "cab"]
    assert st["nodes"]["p"] == ["not_reproduced", "four-cable method: the source does not say which of "
                                "the FX1's effects sit before the amp and which in its loop"]
    assert not any("loop that cannot be built" in why for _, why in st["edges"].values())
    assert not any("parallel" in why for _, why in st["nodes"].values())
    if "ret" in st["edges"]:
        assert st["edges"]["ret"] == ["kept", "the return from the amp's effects loop"]


@pytest.mark.parametrize("role,label,block,position", [("delay", "TC 2290", "delay", "loop"),
                                                       ("modulation", "CE-2 chorus", "chorus", "loop"),
                                                       ("drive", "TS808", "drive", "pre")])
def test_compile_places_a_single_effect_by_kind(role, label, block, position):
    g = rig(proc_role=role, proc_label=label)
    c = rc.compile(g)
    chain = c["scenes"][0]["chain"]
    names = [s["block"] for s in chain]
    assert names == (["drive", "amp", "cab"] if position == "pre" else ["amp", block, "cab"])
    step = next(s for s in chain if s["block"] == block)
    assert step["node"] == "p" and step["position"] == position and step["label"] == label
    where = "before the amp" if position == "pre" else "in the amp's loop"
    assert c["status"]["nodes"]["p"] == ["kept", f"four-cable method: {block} 1 {where}"]
    assert set(c["status"]["nodes"]) == ids(g)[0]


@pytest.mark.parametrize("mode", ("closest", "faithful"))
@pytest.mark.parametrize("name", SHAPES)
def test_compile_for_params_one_path_and_original_ids(name, mode):
    g = SHAPES[name]
    c = rc.compile_for_params(g, IR2Adapter(client=SimIR2()).named_params(), "BOSS IR-2", mode)
    st = c["status"]
    assert (set(st["nodes"]), set(st["edges"])) == ids(g)
    assert not any("loop that cannot be built" in why for _, why in st["edges"].values())
    assert not any("two paths" in b for b in c["blockers"])


def test_other_loops_are_still_reported():
    g = {"nodes": [n("gtr", "instrument"), n("x", "drive"), n("y", "delay"), n("amp", "amp"), n("cab", "cab")],
         "edges": [e("a", "gtr", "x"), e("b", "x", "y"), e("c", "y", "x"), e("d", "x", "amp"), e("f", "amp", "cab")]}
    assert any(l.startswith("Unresolved loop") for l in rg.explain(g))
    assert any("loop that cannot be built" in why for _, why in rc.compile(g)["status"]["edges"].values())


def test_reader_prompt_says_how_to_draw_it():
    from fm9 import describe
    assert "The four-cable method" in describe.EXTRACT_TASK
    assert "Never draw the unit twice" in describe.EXTRACT_TASK
