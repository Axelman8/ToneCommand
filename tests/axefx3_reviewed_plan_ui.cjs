/* Execute the shipped showPlan and controller, not a copied decision branch. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes={},node=id=>nodes[id]??(nodes[id]={value:'',checked:false,hidden:false,
  replaceChildren(){},remove(){},classList:{add(){}}});
let sweeps=0,tones=0,banner='';
const ctx={console,JSON,Promise,structuredClone,Number,String,Error,
  document:{getElementById:node,querySelectorAll:()=>[]},$:node,
  currentPlan:null,stage:'request',planRecipe:null,sharedMap:null,sharedFor:null,currentPresetNumber:321,
  clearAffected(){},refreshBlastRadius(){},renderTension(){},renderToneCheck(){tones++;},
  planHeadline(){},renderPlanCards(){},renderStageRail(){},log(){},workAnnounce(){},
  planResult(html){banner=html;},devName:()=>'Axe-Fx III',devNamed:()=>false,
  setStage(name){ctx.stage=name;},disarmSend(){},
  ensureShared(){sweeps++;return Promise.resolve(false);},
  fetch:async()=>({ok:true,json:async()=>({stage:'request'})})};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[3],'utf8'),ctx);
const page=fs.readFileSync(process.argv[2],'utf8').replace(/\r\n/g,'\n');
const start=page.indexOf('function showPlan(plan) {');
const end=page.indexOf('\n}\n',start)+3;assert(start>=0&&end>start);
vm.runInContext(page.slice(start,end),ctx);
const plan={afx3_edit:true,plan_digest:'reviewed',summary:'One edit',actions:[{kind:'set_param'}]};
ctx.showPlan(plan);
assert.equal(sweeps,0);assert.equal(tones,0);assert.equal(node('tonecheck').hidden,true);
assert.match(banner,/no automatic Undo/);assert.doesNotMatch(banner,/UNDO puts it back/);
ctx.showPlan({...plan,afx3_edit:false});
assert.equal(sweeps,1);assert.equal(tones,1);assert.match(banner,/UNDO puts it back/);
console.log(JSON.stringify({passed:true,iiiSweeps:0,fm9Sweeps:sweeps}));
