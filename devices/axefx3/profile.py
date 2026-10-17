"""User-declared chassis and conservative cab/NAM memory policy, not write evidence."""
from . import fw33_profile


def memory_policy(firmware, variant=None):
    # Only the old verified profile is known to retain both user IR banks.
    # Unknown/beta firmware is treated as NAM-era for storage protection.
    old = firmware == '32.06'
    user2 = old or variant == 'mk2'
    return dict(variant=variant, variant_verified=False,
                user2_cabs=user2, nam_storage='user2' if variant == 'mk1' and not old else
                'separate' if variant == 'mk2' and not old else 'unverified',
                nam_writes=firmware == fw33_profile.KEY and variant == 'mk2',
                write_supported=old or firmware == fw33_profile.KEY,
                warning='MK-keuze is door de gebruiker opgegeven, niet door het apparaat bewezen. '
                + ('NAM: gemeten FW33/MK2/Windows-profiel, installatie in slots 001-256 na slotkeuze. Presetbouw kiest expliciet een volledig uitgelezen geinstalleerd slot; selectie en installatie zijn aparte stappen. '
                 if firmware == fw33_profile.KEY else 'NAM plaatsen/installeren is niet geverifieerd.')
                + ('User2 is beschikbaar als cabnamenlijst.' if user2 else
                   'User2 niet als cabbank gebruiken: op MK1 met NAM-firmware is dit NAM-geheugen.'))


def apply(reg, variant):
    if variant not in (None, 'mk1', 'mk2'):
        raise ValueError('Choose Axe-Fx III MK1 or MK2.')
    reg.hardware_variant = variant
    policy = memory_policy(reg.firmware, variant)
    reg.cab_catalog.restrict_user2(policy['user2_cabs'])
    from . import cab_metadata
    try:
        policy['cab_names_restored']=cab_metadata.restore_if_empty(reg)
    except (OSError,ValueError,TypeError,KeyError):
        policy['cab_names_restored']=0
        reg.cab_catalog.cache_note='Lokale cabnamen niet leesbaar; importeer de actuele namenlijst opnieuw.'
    reg.cab_rosters = reg.cab_catalog.rosters()
    return policy
