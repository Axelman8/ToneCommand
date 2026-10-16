"""Read local editor facts and report changes without promoting write domains."""
import hashlib
import os
from pathlib import Path
import re
import sys
from . import amp_inventory,amp_cache,fw33_profile


def cache_directory():
    # No caller-controlled filesystem path, network, editor launch or MIDI.
    if sys.platform=='win32' and os.environ.get('APPDATA'):
        return Path(os.environ['APPDATA'])/'Fractal Audio'/'Axe-Edit III'
    return None


def latest_cache():
    root=cache_directory()
    if root is None or not root.is_dir():return None
    candidates=[]
    for path in root.glob('effectDefinitions_10_*.cache'):
        match=re.fullmatch(r'effectDefinitions_10_(\d{1,5})p(\d{1,5})\.cache',path.name)
        if match and path.is_file() and not path.is_symlink():
            candidates.append((tuple(map(int,match.groups())),path))
        if len(candidates)>64:raise ValueError('Too many editor metadata files')
    return max(candidates,key=lambda item:item[0])[1] if candidates else None


def refresh(reg):
    from .album_planning import MODELS
    active=amp_inventory.roster(reg.firmware)
    if reg.firmware==fw33_profile.KEY and active!=MODELS:
        raise ValueError('De TC-modellenlijst is op schijf gewijzigd. Herstart TC met de gecontroleerde update; refresh wijzigt geen actieve AI-keuzes.')
    usable=reg.firmware==fw33_profile.KEY and getattr(reg,'hardware_variant',None)=='mk2'
    result=dict(inventory=amp_inventory.report(reg) if usable else None,
        firmware=reg.firmware,hardware_written=False,permissions_changed=False,
        live_list_fetched=False,source_count=None,source_file=None,
        added=[],changed=[],removed=[],status='bundled_only',
        message='De meegeleverde modellenlijst is opnieuw geladen. Geen lokale Axe-Edit-cache gevonden; er is geen live modellenlijst van de Fractal opgehaald.')
    if not usable:
        result.update(status='verification_required',message='Deze firmware/uitvoering is niet vrijgegeven voor modelwrites. Refresh kan alleen lokale modelnamen vergelijken; niets wordt automatisch vrijgegeven.')
    try:
        path=latest_cache()
        if path is None:return result
        with path.open(mode='rb') as stream:data=stream.read(amp_cache.MAX_BYTES+1)
        names=amp_cache.amp_names(data)
    except (ValueError,OSError):
        result.update(status='source_unreadable',message='De lokale Axe-Edit-cache kon niet volledig en veilig worden gelezen. De geverifieerde lijst en schrijfbeveiligingen zijn ongewijzigd.')
        return result
    result.update(source_count=len(names),source_file=path.name,source_sha256=hashlib.sha256(data).hexdigest())
    result['added']=[dict(ordinal=k,name=v) for k,v in names.items() if k not in active]
    result['changed']=[dict(ordinal=k,name=v,verified_name=active[k]) for k,v in names.items() if k in active and active[k]!=v]
    result['removed']=[dict(ordinal=k,name=v) for k,v in active.items() if k not in names]
    if usable and names==active:
        result.update(status='up_to_date',message=f'Actueel: alle {len(active)} modelnamen en nummers komen overeen met de lokale Axe-Edit-cache. De AI gebruikt deze volledige geverifieerde lijst. Geen presetinstellingen gewijzigd.')
    else:
        prefix='' if usable else 'Firmware/uitvoering niet vrijgegeven. '
        result.update(status='verification_required',message=prefix+f'Lokale cache: {len(names)} modellen; {len(result["added"])} toegevoegd, {len(result["changed"])} gewijzigd, {len(result["removed"])} ontbrekend ten opzichte van de firmwarelijst. Afwijkingen vereisen onafhankelijke verificatie en een TC-update; de bestaande schrijfbeveiligingen blijven gelden.')
    return result
