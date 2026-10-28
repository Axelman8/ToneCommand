/* Shipped controller, independent fake DOM/HTTP/clock, no browser or MIDI. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2],'utf8'),scenario=process.argv[3];
const nodes={},calls=[],timers=[];
function element(){return {hidden:false,disabled:false,checked:false,value:'',textContent:'',children:[],
  classList:{add(){}},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}};}
const node=id=>nodes[id]??(nodes[id]=element());
node('afx3control').value='DISTORT_DRIVE';node('afx3value').value='3.3';node('afx3editbox').hidden=true;
let hold=null,sequence=0,sendError=false,calibration=false;
const context={console,structuredClone,JSON,Promise,Error,Number,String,document:{getElementById:node,
  querySelectorAll:()=>[],createElement:()=>element()},currentPlan:null,stage:'request',stageDone:{},
  gigOn:false,armTimer:null,armLeft:0,planSending:false,planSent:0,planTotal:0,
  esc:String,log(){},renderGigLockWhy(){},planResult(){},sendPhase(){},closeDrawer(){},
  setStage(name){context.stage=name;},showPlan(plan){context.currentPlan=plan;},
  disarmSend(){node('apply').hidden=true;node('armbtn').hidden=false;},
  setInterval(fn){timers.push(fn);return timers.length;},clearInterval(){},
  async fetch(url,options={}){
    const path=url.split('/').pop(),body=options.body?JSON.parse(options.body):null;
    calls.push({path,body});
    if(hold?.path===path){const current=hold;hold=null;await current.promise;}
    if(path==='state')return {ok:true,json:async()=>({configured:true,available:true,preset:321,scene:1,
      ...(calibration?{calibration_only:true,allowed_values:{DISTORT_DRIVE:[4.6,5],DISTORT_MID:[5,5.6]}}:{}),
      values:{DISTORT_DRIVE:3,DISTORT_MID:5}})};
    if(path==='discard')return {ok:true,json:async()=>({stage:'request'})};
    if(path==='send')return {ok:!sendError,json:async()=>sendError
      ?{error:'Uncertain: keep external audio muted; no retry'}:{verified:true,sent:true,stored:false}};
    const value={...body,stage:{prepare:'plan',review:'review',confirm:'confirm'}[path]};
    if(path==='prepare')Object.assign(value,{token:'token'+(++sequence),plan_digest:'digest',
      device:{preset:{number:321},scene:{number:1}}});
    return {ok:true,json:async()=>value};
  }};
context.window=context;vm.createContext(context);vm.runInContext(source,context);
const ui=context.AFX3ReviewedEdit;
const III={device:{active:'axefx3'},preset:{number:321},scene:{number:1}};
const count=path=>calls.filter(c=>c.path===path).length;
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function suspend(path){let release;const promise=new Promise(resolve=>{release=resolve;});hold={path,promise};return release;}
async function prepared(){await ui.poll(III);node('afx3value').value='3.3';await ui.prepare();}
async function reviewed(){await prepared();await ui.review();ui.renderConfirm();}
async function armed(){await reviewed();node('ack').checked=true;node('afx3muted').checked=true;await ui.arm();}

(async()=>{
  if(scenario==='lifecycle'){
    await armed();assert.equal(count('send'),0);assert.equal(node('apply').hidden,false);
    await ui.send();assert.equal(count('send'),1);assert.equal(context.currentPlan.afx3_ticket,null);
    assert.equal(node('storeafter').hidden,true);await ui.send();assert.equal(count('send'),1);
  }else if(scenario==='consent'){
    await reviewed();node('ack').checked=true;await ui.arm();assert.equal(count('confirm'),0);
    node('ack').checked=true;node('afx3muted').checked=true;await ui.arm();assert.equal(count('confirm'),1);
    node('afx3muted').checked=false;ui.consentChanged();assert.equal(node('apply').hidden,true);
    assert.equal(node('armbtn').disabled,true);await ui.send();assert.equal(count('send'),0);
  }else if(scenario==='timeout'){
    await armed();for(let i=0;i<8;i++)timers.at(-1)();assert.equal(node('apply').hidden,true);
    await ui.arm();assert.equal(count('confirm'),1);assert.equal(count('send'),0);
    await ui.restart('review');assert.equal(context.currentPlan.afx3_ticket.stage,'review');
    assert.equal(node('ack').checked,false);assert.equal(node('afx3muted').checked,false);
  }else if(scenario==='queued-discard'){
    await armed();const old=context.currentPlan.afx3_ticket.token;
    const release=suspend('discard');ui.invalidate();await wait();
    const pending=ui.prepare();await wait();assert.equal(count('prepare'),1);
    release();await pending;assert.equal(count('prepare'),2);
    assert.notEqual(context.currentPlan.afx3_ticket.token,old);assert.equal(count('send'),0);
  }else if(scenario==='late-proposal'){
    await prepared();const release=suspend('prepare'),pending=ui.prepare();await wait();
    ui.invalidate();release();await pending;await wait();assert.equal(context.currentPlan.afx3_ticket,null);
    assert.equal(count('send'),0);
  }else if(scenario==='late-state'){
    const release=suspend('state'),pending=ui.poll(III);await wait();
    await ui.poll({device:{active:'fm9'}});release();await pending;
    assert.equal(node('afx3editbox').hidden,true);assert.equal(node('afx3prepare').disabled,true);
    await ui.prepare();assert.equal(count('prepare'),0);
  }else if(scenario==='target'){
    await armed();await ui.poll({...III,preset:{number:322}});
    assert.equal(context.currentPlan.afx3_ticket,null);assert.equal(node('apply').hidden,true);
    await ui.send();assert.equal(count('send'),0);
  }else if(scenario==='uncertain'){
    await armed();sendError=true;await ui.send();await ui.send();
    assert.equal(count('send'),1);assert.equal(context.currentPlan.afx3_ticket,null);
    assert.equal(node('apply').hidden,true);assert.equal(node('storeafter').hidden,true);
  }else if(scenario==='dirty-input'){
    await ui.poll(III);node('afx3value').value='3.7';node('afx3value').oninput();
    await ui.poll(III);assert.equal(node('afx3value').value,'3.7');
    node('afx3control').value='DISTORT_MID';node('afx3control').onchange();
    assert.equal(node('afx3value').value,5);
  }else if(scenario==='calibration'){
    calibration=true;await ui.poll(III);
    node('afx3value').value='4.1';node('afx3value').oninput();assert.equal(node('afx3prepare').disabled,true);
    node('afx3value').value='4.6';node('afx3value').oninput();assert.equal(node('afx3prepare').disabled,false);
    assert.match(node('afx3editlimits').textContent,/No general preset writing/);
    node('afx3control').value='DISTORT_MID';node('afx3control').onchange();
    assert.equal(node('afx3value').value,5);assert.equal(node('afx3prepare').disabled,false);
  }else throw Error('Unknown scenario');
  console.log(JSON.stringify({passed:true,scenario,requests:calls.map(c=>c.path)}));
})().catch(error=>{console.error(error);process.exitCode=1;});
