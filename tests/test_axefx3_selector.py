"""Run the shipped selector painter with no browser, server or MIDI access."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

import pytest

PAGE = (Path(__file__).resolve().parents[1] / 'ui/index.html').read_text(encoding='utf-8')


def test_iii_hardware_box_starts_hidden_before_the_first_poll():
    assert re.search(r'<div[^>]*id="axefx3hardware"[^>]*\bhidden>', PAGE)
    assert '[hidden] { display: none !important; }' in PAGE


@pytest.mark.parametrize('dev,visible', [
    (None, False), ({}, False),
    ({'active': 'fm9', 'selected': 'fm9', 'available': [{'kind': 'fm9'}]}, False),
    ({'active': 'fm3', 'selected': 'fm3', 'available': [{'kind': 'fm3'}]}, False),
    ({'active': 'axefx3', 'available': []}, True),
    ({'active': 'fm9', 'selected': 'axefx3', 'available': []}, True),
    ({'active': 'fm9', 'available': [{'kind': 'axefx3'}]}, True),
])
@pytest.mark.parametrize('busy,scanning', [(False, False), (True, False), (False, True)])
def test_only_relevant_iii_context_shows_the_box_without_side_effects(dev, visible, busy, scanning):
    node = shutil.which('node')
    if node is None:
        if os.environ.get('CI'):
            pytest.fail('Node is required for the UI regression check')
        pytest.skip('Node is not installed')
    body = PAGE.split('function renderAxeFxChassis(dev) {', 1)[1].split('\n}', 1)[0]
    script = "const assert=require('node:assert/strict');\n" + (
        "const nodes={axefx3hardware:{hidden:true},axefx3chassis:{value:'turbo'}};\n"
        "const $=id=>{assert(id in nodes);return nodes[id]};\n"
        "const fetch=()=>{throw Error('Rendering attempted network IO')};\n"
        f"let axeFxChassisBusy={json.dumps(busy)},presetScanPromise={json.dumps(scanning)};\n"
        'function renderAxeFxChassis(dev) {' + body + '\n}\n'
        f'renderAxeFxChassis({json.dumps(dev)});\n'
        f'assert.equal(nodes.axefx3hardware.hidden,{json.dumps(not visible)});\n'
        f'assert.equal(nodes.axefx3chassis.disabled,{json.dumps(busy or scanning or not visible)});\n'
        f"assert.equal(nodes.axefx3chassis.value,{json.dumps('turbo' if busy else 'mk1')});\n"
    )
    result = subprocess.run([node, '-e', script], capture_output=True, text=True,
                            encoding='utf-8', timeout=15)
    assert result.returncode == 0, result.stderr
