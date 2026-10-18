"""Read-only request clarification, never hardware capability or write consent."""
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

from . import fw33_profile


class Resolution(BaseModel):
    model_config = ConfigDict(extra='forbid')
    pitch_meaning: Literal['filter', 'pitch'] | None = None
    accepted_omissions: list[Literal['wah_controller', 'pitch', 'reverb']] = Field(default_factory=list, max_length=3)
    scene_count_override: StrictBool = False


LABELS = dict(wah_controller='Wah-bediening (filter/pedaal), nieuwe controllerkoppeling en Auto Engage',
              pitch='Echte pedaalgestuurde pitchverhoging', reverb='Nieuwe reverb-instellingen')
WORDS = dict(zip('een one twee two drie three vier four vijf five zes six zeven seven acht eight negen nine tien ten'.split(),
                 (1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10)))


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))


def scene_counts(prompt):
    text = normalized(prompt)
    number = r'(-?\d{1,3}|' + '|'.join(WORDS) + r')'
    hits = re.findall(r'(?<![\w-])' + number + r'\s+scenes?\b', text)
    hits += re.findall(r'\bscenes\s*[:=]\s*' + number + r'\b', text)
    return sorted({WORDS[x] if x in WORDS else int(x) for x in hits})


def _positive(text, pattern):
    # Narrow explicit exclusions are not a demand to add the feature.
    text = re.sub(r'\b(?:geen|zonder|no|without)\s+(?:nieuwe?\s+|new\s+)?(?:wah|reverb|pitch)(?:\s+(?:controller|shift))?\b', '', text)
    text = re.sub(r'\b(?:wah|reverb|pitch)\s+(?:(?:staat|is)\s+)?(?:uit|off|bypassed|bypass)\b', '', text)
    return bool(re.search(pattern, text))


def analyze(prompt, reg, mode, scenes, resolution=None, *, refining=False, wah_source=None):
    resolution = resolution or Resolution()
    text = normalized(prompt)
    counts = scene_counts(prompt)
    count = scenes if resolution.scene_count_override or refining or len(counts) != 1 else counts[0]
    questions, missing = [], []
    if (not refining and not resolution.scene_count_override and
            (len(counts) > 1 or any(not 1 <= n <= 8 for n in counts))):
        questions.append(dict(id='scene_count', kind='scenes', text='Je tekst noemt tegenstrijdige of niet-beschikbare sceneaantallen. Kies expliciet 1 tot 8 scenes.'))
    fw33 = reg.firmware == fw33_profile.KEY
    if (mode == 'serial' and count != 1) or (fw33 and mode == 'nam' and count > 2):
        questions.append(dict(id='route_scenes', kind='scenes', text='Deze bouwroute ondersteunt dit sceneaantal niet. Kies AMP/CAB voor maximaal acht scenes, of kies bewust minder scenes. Vanuit een lege NAM-preset is eerst een scene nodig.'))
    wah = _positive(text, r'\bwah\b')
    pitch = _positive(text, r'\b(?:pitch(?:ed|\s*-?\s*shift(?:er|ing)?)?|whammy|toonhoogte(?:verhoging)?)\b')
    ambiguous = wah and pitch and bool(re.search(r'\b(?:high|hoge?|hoog|toe\s*-?\s*down|teen)\b', text))
    if ambiguous and resolution.pitch_meaning is None:
        questions.append(dict(id='pitch_meaning', kind='choice', text='Met hoge pitch bij toe-down: bedoel je een helderdere/hogere wah-filterstand, of echte verhoging van de gespeelde toonhoogte?',
                              options=[dict(value='filter', label='Hogere, helderdere wah-filterstand'), dict(value='pitch', label='Echte pitchverhoging (Whammy/Pitch)')]))
    actual_pitch = pitch and (not ambiguous or resolution.pitch_meaning == 'pitch')
    controller = bool(wah_source) or (wah and bool(re.search(r'\b(?:external\s*[12]|auto\s*-?\s*engag\w*|pedaal|pedal|controller)\b', text)))
    # auto is route exploration, not permission to drop requirements. Recheck
    # against the actual selected route before any design call.
    if mode != 'auto':
        if fw33 and (wah or controller):
            missing.append('wah_controller')
        if actual_pitch:
            missing.append('pitch')
        if fw33 and mode in ('amp', 'serial') and _positive(text, r'\breverb\b'):
            missing.append('reverb')
    approved = [f for f in missing if f in resolution.accepted_omissions]
    for feature in missing:
        if feature not in approved:
            questions.append(dict(id=feature, kind='omission', text=LABELS[feature] + ' is niet geverifieerd voor deze bouwroute. Wil je alleen het ondersteunde deel laten ontwerpen en dit onderdeel expliciet uitstellen? Dit voegt geen controller of effect toe.'))
    return dict(ready=not questions, questions=questions, requested_scene_counts=counts,
                scenes=count if 1 <= count <= 8 else scenes, approved_omissions=approved,
                pitch_meaning=resolution.pitch_meaning, readonly=True, hardware_written=False,
                notice='Verzoek gecontroleerd; nog geen AI-ontwerp, SEND of opslag. Een uitgesteld onderdeel wordt niet uitgevoerd.')


def context(intake):
    """Trusted scope rules: typed answers, not a second untrusted prompt."""
    omitted = ', '.join(intake['approved_omissions']) or 'none'
    meaning = intake['pitch_meaning'] or 'not specified'
    return ('\nSERVER-VALIDATED REQUEST SCOPE: pitch meaning=' + meaning +
            '; explicitly deferred requirements=' + omitted +
            '. Deferred requirements must be listed as NOT implemented, not promised or included '
            'in scene_goals.required_features. All other explicit requirements remain mandatory. '
            'Filter means wah-filter frequency only, NEVER musical pitch transposition. '
            'These scope answers do not enable hardware actions or authorize SEND/Store.\n')


def annotate(plan, intake):
    plan['request_intake'] = intake
    for feature in intake['approved_omissions']:
        plan['warnings'].append('Expliciet uitgesteld, NIET uitgevoerd: ' + LABELS[feature] + '.')
