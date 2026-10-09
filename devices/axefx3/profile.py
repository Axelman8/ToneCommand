"""User-declared chassis and conservative cab/NAM memory policy, not write evidence."""


def memory_policy(firmware, variant=None):
    # Only the old verified profile is known to retain both user IR banks.
    # Unknown/beta firmware is treated as NAM-era for storage protection.
    old = firmware == '32.06'
    user2 = old or variant == 'mk2'
    return dict(variant=variant, variant_verified=False,
                user2_cabs=user2, nam_storage='user2' if variant == 'mk1' and not old else
                'separate' if variant == 'mk2' and not old else 'unverified',
                nam_writes=False, write_supported=old,
                warning='MK-keuze is door de gebruiker opgegeven, niet door het apparaat bewezen. '
                'NAM plaatsen/installeren is nog niet geverifieerd. '
                + ('User2 is beschikbaar als cabnamenlijst.' if user2 else
                   'User2 niet als cabbank gebruiken: op MK1 met NAM-firmware is dit NAM-geheugen.'))


def apply(reg, variant):
    if variant not in (None, 'mk1', 'mk2'):
        raise ValueError('Choose Axe-Fx III MK1 or MK2.')
    reg.hardware_variant = variant
    policy = memory_policy(reg.firmware, variant)
    reg.cab_catalog.user2_enabled = policy['user2_cabs']
    if not policy['user2_cabs']:
        reg.cab_catalog.names = {k: v for k, v in reg.cab_catalog.names.items()
                                 if not (k[0] == 2 and k[1] >= 512)}
    reg.cab_rosters = {str(b): {str(o): n for (bank, o), n in reg.cab_catalog.names.items()
                              if bank == b} for b in (0, 1, 2)}
    return policy
