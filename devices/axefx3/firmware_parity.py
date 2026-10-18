"""Read-only migration inventory. A registry entry is not write permission.

Every FW32.06 parameter must survive in FW33 or have an explicit migration
record. Encoders, block instances, controller operations and planner routes
are separate contracts; copying metadata never releases a device operation.
"""
from . import fw33_profile
from .evidence import AXE_FX_III_PARAM_DEFINITIONS as LEGACY

PENDING = {
    **{f'PEQ_{field}{i}': 'FW33 PEQ numeric/model/channel measurement and planner integration'
       for field in ('FREQ','GAIN') for i in range(1,6)},
    'PEQ_LEVEL': 'FW33 PEQ numeric/model/channel measurement and planner integration',
    'PITCH_LEVEL': 'FW33 Pitch numeric measurement; level does not implement pitch shifting',
    'WAH_CONTROL': 'Scalar Control SET awaits FW33 display/bulk measurement; modifier binding is separate',
}
ENCODER_MIGRATIONS = frozenset({
    'DISTORT_DRIVE','DISTORT_BASS','DISTORT_MID','DISTORT_TREBLE',
    'DISTORT_MASTER','DISTORT_DEPTH','DISTORT_PRESENCE','WAH_LEVEL',
})
INSTANCE_MIGRATIONS = frozenset({
    ('DISTORT',2),
    *((family,i) for family in ('CABINET','DELAY','OUTPUT','REVERB','WAH') for i in (2,3,4)),
})
ENCODING_FIELDS = ('pid','min','max','scale','set_opcode','set_divisor','wire_min','kind','enum_count')


def parameters(current):
    """Compare actual loaded definitions, without opening MIDI or changing them."""
    rows = []
    for family, definitions in LEGACY.items():
        for name, old in definitions.items():
            new = current.get(family,{}).get(name)
            changed = [field for field in ENCODING_FIELDS if new is not None and
                old.get(field, 'float' if field=='kind' else None) != new.get(field, 'float' if field=='kind' else None)]
            rows.append(dict(family=family,parameter=name,
                status='pending' if new is None else 'migrated_encoding' if changed else 'retained_definition',
                changed_fields=changed,
                reason=PENDING.get(name,'Unaccounted firmware regression') if new is None else None))
    return rows


def report(reg):
    if reg.firmware not in ('32.06',fw33_profile.KEY):
        return dict(baseline='32.06',firmware=reg.firmware,recognized=False,
                    automatically_enables_writes=False)
    rows = parameters(reg.definitions)
    old_names = {name for controls in LEGACY.values() for name in controls}
    added = sorted(name for controls in reg.definitions.values() for name in controls if name not in old_names)
    pending = [r for r in rows if r['status']=='pending']
    retained = [r for r in rows if r['status']!='pending']
    from . import pedal_fw33
    return dict(baseline='32.06',firmware=reg.firmware,recognized=True,
        baseline_parameters=len(rows),retained_parameters=len(retained),
        added_parameters=added,pending_parameters=pending,
        migrated_encodings=[r for r in rows if r['status']=='migrated_encoding'],
        wah_controller_workspace=(reg.firmware=='32.06' or
            (pedal_fw33.RELEASED and getattr(reg,'hardware_variant',None)=='mk2')),
        wah_in_fw33_tone_planner=False,
        note='Definitions are not model/channel/instance/route permissions. Independent hardware acceptance remains required.',
        automatically_enables_writes=False)
