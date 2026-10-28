"""Execute the shipped opt-in controller with isolated DOM, clock and HTTP."""
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('scenario', ['lifecycle', 'consent', 'timeout', 'queued-discard',
    'late-proposal', 'late-state', 'target', 'uncertain', 'dirty-input', 'calibration'])
def test_reviewed_edit_controller(scenario):
    node = shutil.which('node')
    if not node:
        if os.environ.get('CI'):
            pytest.fail('Node is required for the reviewed-edit UI regression check')
        pytest.skip('Node is not installed')
    result = subprocess.run([node, str(ROOT / 'tests/axefx3_reviewed_edit_ui.cjs'),
        str(ROOT / 'ui/axefx3-reviewed-edit.js'), scenario], capture_output=True,
        text=True, encoding='utf-8', timeout=15)
    assert result.returncode == 0, result.stderr
    assert '"passed":true' in result.stdout


def test_main_plan_has_no_iii_sweep_undo_or_unrun_tone_check():
    node = shutil.which('node')
    if not node:
        if os.environ.get('CI'):
            pytest.fail('Node is required for the plan-stage regression check')
        pytest.skip('Node is not installed')
    result = subprocess.run([node,str(ROOT / 'tests/axefx3_reviewed_plan_ui.cjs'),
        str(ROOT / 'ui/index.html'),str(ROOT / 'ui/axefx3-reviewed-edit.js')],
        capture_output=True,text=True,encoding='utf-8',timeout=15)
    assert result.returncode == 0, result.stderr
    assert '"passed":true' in result.stdout
