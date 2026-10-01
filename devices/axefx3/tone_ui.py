"""A bounded text-to-preset workspace using TC's selected AI backend."""
import json
import re
import threading
from typing import Literal

from fastapi import HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from fm9 import ai_settings, planner
from fm9.paths import resource_path
from . import planning, route_guard, tone_review
from .controller_ui import Confirmation


class Request(BaseModel):
    model_config = ConfigDict(extra='forbid')
    prompt: str = Field(min_length=3,max_length=12000)
    expected_preset: StrictInt = Field(ge=0,le=511)
    scenes: StrictInt = Field(ge=1,le=4)
    wah_source: Literal['External 1','External 2'] | None = None
    wah_auto_engage: Literal['Off','Fast Pos'] | None = 'Fast Pos'


class CabImport(BaseModel):
    model_config = ConfigDict(extra='forbid')
    kind: Literal['factory','user']
    text: str = Field(min_length=1,max_length=2*1024*1024)


def register(app, host):
    reviews, planning_lock = tone_review.Reviews(), threading.Lock()

    def selected():
        ctx = host.device_context()
        if ctx.kind != 'axefx3' or ctx.adapter is None:
            raise HTTPException(409,'Connect the Axe-Fx III explicitly in Controllers first.')
        return ctx.adapter

    def editable():
        if host._gig_mode['on']:
            raise HTTPException(423,'GIG LOCK is on.')
        if host._plan_revisions or host._audition['open']:
            raise HTTPException(409,'Finish/discard the other plan or cab audition first.')

    @app.get('/axefx3')
    def page():
        return FileResponse(resource_path('ui','axefx3.html'))

    @app.get('/axefx3.js')
    def script():
        return FileResponse(resource_path('ui','axefx3.js'),media_type='text/javascript')

    @app.get('/api/axefx3/state')
    def state():
        with host._lock:
            ctx = host.device_context()
            if ctx.kind != 'axefx3' or ctx.adapter is None:
                return dict(connected=False)
            try:
                dev = selected()
                return dict(connected=True, **tone_review.public_state(tone_review.snapshot(dev),dev.reg))
            except (ValueError,RuntimeError,OSError) as exc:
                raise HTTPException(409,str(exc)) from exc

    @app.post('/api/axefx3/cabs')
    def import_cabs(body: CabImport):
        with host._lock:
            editable()
            try:
                count = selected().reg.import_cab_names(body.text,body.kind)
                reviews.clear()
                return dict(imported=count,hardware_written=False,
                            note='Names only, for this connection. No IR audio uploaded.')
            except (ValueError,RuntimeError,OSError) as exc:
                raise HTTPException(409,str(exc)) from exc

    @app.post('/api/axefx3/plan')
    def build(body: Request):
        if re.search(r'https?://',body.prompt,re.I):
            raise HTTPException(409,'This step accepts text only. Reference audio/web analysis is not integrated yet.')
        if not planning_lock.acquire(blocking=False):
            raise HTTPException(409,'A text plan is already being prepared; no second AI call started.')
        acquired = False
        try:
            with host._lock:
                editable()
                dev = selected()
                reviews.clear()
                initial = tone_review.snapshot(dev)
                if initial['preset'][0] != body.expected_preset:
                    raise ValueError('Target preset changed. Refresh before planning.')
                route = route_guard.serial_route(initial['grid'],initial['blocks'],dev.reg)
                if not dev.reg.cab_catalog.names:
                    raise ValueError('Import an Axe-Fx III Factory or User cab name list first; no guessed cab names.')
                facts = resource_path('config','amp_models.json')
                if facts.exists():
                    dev.reg.load_amp_facts(json.loads(facts.read_text(encoding='utf-8')))
                reference = planning.reference(dev.reg)
                state_text = json.dumps(tone_review.public_state(initial,dev.reg),ensure_ascii=False)
            acquired = host._settings_lock.acquire(blocking=False)
            if not acquired:
                raise HTTPException(423,'AI settings are in use; try after the current request finishes.')
            ai_settings.apply_to_env()
            if not planner._env('PLANNER_BACKEND').strip() or len(planner.candidates()) != 1:
                raise ValueError('Choose one explicit AI backend in TC settings first; no automatic or paid fallback.')
            def validate(raw):
                return planning.compile_design(dev.reg,raw,route,body.scenes,body.wah_source,
                                               body.wah_auto_engage)
            result = planner.plan(
                f'Exactly {body.scenes} scenes. User-selected wah source: {body.wah_source or "preserve"}. '
                f'Wah Auto Engage: {body.wah_auto_engage if body.wah_source and body.wah_auto_engage else "preserve"}. '
                'Do not override these controller choices.\n'+body.prompt,
                state_text,reference,system=planning.SYSTEM,
                shape=json.dumps(planning.Design.model_json_schema()),
                schema=planning.Design.model_json_schema(),validate=validate)
            with host._lock:
                editable()
                if selected() is not dev:
                    raise ValueError('Device connection changed while planning; nothing sent.')
                return reviews.prepare(dev,result,initial)
        except (ValueError,RuntimeError,OSError,KeyError) as exc:
            raise HTTPException(409,str(exc)) from exc
        finally:
            if acquired: host._settings_lock.release()
            planning_lock.release()

    @app.post('/api/axefx3/discard')
    def discard():
        with host._lock:
            reviews.clear()
            return dict(ok=True)

    @app.post('/api/axefx3/send')
    def send(body: Confirmation):
        with host._lock:
            editable()
            try:
                return reviews.send(selected(),**body.model_dump())
            except (ValueError,RuntimeError,OSError,KeyError) as exc:
                raise HTTPException(409,str(exc)) from exc

    return reviews
