// Run: node tools/test_parsnip_partner.cjs
// No dependencies. DOM / Canvas doubles verify input routing, not actual browser layout.
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../parsnip-is-not-your-partner/index.html'), 'utf8');
const model = html.split('// MODEL_START')[1]?.split('// MODEL_END')[0];
if (!model) throw Error('Game model not found');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].trim();
new Function(script);
const checks = new Function(model + String.raw`
const checks=[];
function check(name,fn){fn();checks.push(name);}
function ok(v,msg='assertion failed'){if(!v)throw Error(msg);}
function eq(a,b,msg='values differ'){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(msg+': '+JSON.stringify(a)+' != '+JSON.stringify(b));}
function rng(seed=12345){let n=seed;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function fresh(){const g=new Run(rng());g.reset();return g;}
function field(){const g=fresh();g.drawBan();g.banAt=null;g.enterField();g.thiefCD=1e9;return g;}
function tick(g,t,step=1/60){for(let i=0;i<Math.round(t/step);i++)g.update(step);}
function quiet(g){for(const t of g.tiles){t.topic=null;t.grow=999;}g.thiefCD=999;}
function mature(g,id,topic,age=0){const t=g.tiles[id];Object.assign(t,{stone:false,topic,age,grow:0});return t;}
check('title idle, clean reset and 30/60/120 Hz normalized movement',()=>{
 const idle=new Run();eq(idle.state,STATES.TITLE);tick(idle,1);eq(idle.total,0);
 const positions=[];for(const rate of [30,60,120]){const g=fresh();g.input={x:1,y:1};tick(g,1,1/rate);positions.push(g.player.x);ok(Math.abs(Math.hypot(g.player.x-480,g.player.y-500)-CFG.MOVE)<.001);}
 ok(Math.max(...positions)-Math.min(...positions)<.001);
});
check('dash is faster, invulnerable, bounded and cooldown gated',()=>{
 const g=fresh();g.input.x=1;const x=g.player.x;ok(g.dash());ok(!g.dash());tick(g,.15);ok(g.player.x-x>60);const hp=g.player.hp;g.damage();eq(g.player.hp,hp);
 g.player.x=959;g.player.cooldown=0;g.dash();tick(g,.2);ok(g.player.x<=942);
});
check('meteor telegraph damages once, dash avoids damage',()=>{
 const g=fresh();g.hazards=[{x:g.player.x,y:g.player.y,t:.01,hit:false,r:27,near:false}];g.update(.02);eq(g.player.hp,5);g.update(.02);eq(g.player.hp,5);
 g.player.inv=1;g.hazards=[{x:g.player.x,y:g.player.y,t:.01,hit:false,r:27,near:false}];g.update(.02);eq(g.stats.dodges,1);
});
check('stage one collects five shards, draws ban once, activates fixed robot and 49 plots',()=>{
 const g=fresh();
 for(let i=0;i<5;i++){const f=g.fragments[0];g.player.x=f.x;g.player.y=f.y;g.update(.01);if(i<4){g.stageTime=(i+1)*11;g.update(.01);}}
 eq(g.collected,5);ok(g.banDrawn);eq(g.state,STATES.STAGE_TRANSITION);const ban=g.banAt;g.drawBan();eq(g.banAt,ban);
 tick(g,2.5);eq(g.state,STATES.STAGE_2);eq(g.tiles.length,49);eq(g.robot,{x:240,y:566});eq(g.player.hp,6);
});
check('all six topics are data driven and unsafe mix caps at 60 percent',()=>{
 const g=field();eq(Object.keys(TOPICS).length,6);eq(g.unsafeRatio(),.15);g.level=100;
 eq(g.unsafeRatio(),.6);eq(g.growthTime(),2.5);eq(g.thiefInterval(),4);
 for(const t of Object.values(TOPICS))ok(t.life>0&&Number.isFinite(t.score)&&Number.isFinite(t.alert));
});
check('automatic harvest is FIFO and never exceeds four slots, including NSFW',()=>{
 const g=field();quiet(g);for(const [id,topic] of ['daily','nsfw','sad','ai','growth'].entries()){
  const t=mature(g,id,topic);g.player.x=t.x;g.player.y=t.y;g.update(.01);
 }
 eq(g.bag,['daily','nsfw','sad','ai']);eq(g.stats.harvest,4);eq(g.tiles[4].topic,'growth');
});
check('safe crop and NSFW expire harmlessly; unharvested sadness petrifies its plot',()=>{
 const g=field();quiet(g);mature(g,0,'daily',14.99);mature(g,1,'nsfw',11.99);mature(g,2,'sad',9.99);g.update(.02);
 eq(g.tiles[0].stone,false);eq(g.tiles[0].topic,null);eq(g.tiles[1].stone,false);eq(g.tiles[1].topic,null);ok(g.tiles[2].stone);eq(g.freeLand(),48);
});
check('robot feeds in harvest order, one item each interval, safe grants hearts and reduces alert',()=>{
 const g=field();quiet(g);g.player.x=g.robot.x;g.player.y=g.robot.y;g.alert=20;g.bag=['daily','philosophy','ai','growth'];
 g.update(.01);eq(g.bag.length,3);eq(g.stats.fed.daily,1);eq(g.hearts,1);ok(g.alert<12.01);
 tick(g,.2);eq(g.bag.length,3);tick(g,1);eq(g.bag.length,0);eq(g.hearts,4);eq(g.score,40);
});
check('unsafe feeding grants no hearts and rewards risk at the current level',()=>{
 const g=field();quiet(g);g.level=3;g.bag=['sad'];g.feedOne();eq(g.hearts,0);eq(g.alert,34);eq(g.score,90);eq(g.stats.fed.sad,1);
});
check('refusal records the triggering item and clears remaining bag only after performance',()=>{
 const g=field();quiet(g);g.alert=80;g.bag=['sad','daily'];g.feedOne();eq(g.state,STATES.REFUSAL);eq(g.refusalTopic,'sad');eq(g.bag,['daily']);
 const before=g.freeLand();tick(g,1.6);eq(g.state,STATES.STAGE_2);eq(g.freeLand(),before-4);eq(g.bag.length,0);ok(g.alert<=20);eq(g.stats.warnings,0);
});
check('NSFW warning count is independent of bans; safe-triggered refusal has no special notice',()=>{
 const g=field();quiet(g);g.alert=50;g.bag=['nsfw'];g.feedOne();eq(g.refusalTopic,'nsfw');eq(g.stats.warnings,1);eq(g.banAt,null);
 const h=field();quiet(h);h.alert=120;h.bag=['daily'];h.feedOne();eq(h.refusalTopic,'daily');eq(h.stats.warnings,0);
});
check('compost removes only sadness out of order, requires stillness, scores no hearts or alert',()=>{
 const g=field();quiet(g);g.player.x=g.compost.x;g.player.y=g.compost.y;g.bag=['nsfw','sad','daily'];g.alert=30;
 tick(g,1.6);eq(g.bag,['nsfw','daily']);eq(g.stats.compost,1);eq(g.score,3);eq(g.hearts,0);ok(g.alert<30);
 g.bag.push('sad');g.input.x=.1;tick(g,.2);eq(g.compostProgress,0);
 g.input.x=0;tick(g,1);ok(g.compostProgress>0);ok(g.dash());eq(g.compostProgress,0);
});
check('window cost rises, insufficient hearts does nothing, successful window preserves score and level',()=>{
 const g=field();quiet(g);g.hearts=7;g.bag=['nsfw'];g.petrify(g.tiles[0]);ok(!g.newWindow());eq(g.bag,['nsfw']);eq(g.freeLand(),48);
 g.hearts=20;g.score=140;g.level=3;g.fieldTime=85;g.alert=90;const robot={...g.robot};
 ok(g.newWindow());eq(g.hearts,12);eq(g.windowPrice(),12);eq(g.alert,0);eq(g.bag,[]);
 tick(g,.6);eq(g.state,STATES.STAGE_2);eq(g.freeLand(),49);eq(g.score,140);eq(g.level,3);eq(g.robot,robot);ok(g.bubble);
});
check('difficulty rises every 40 seconds and increases refusal stones with an eight-stone cap',()=>{
 const g=field();quiet(g);g.fieldTime=39.99;g.update(.02);eq(g.level,2);
 g.refuse('sad');g.finishRefusal();eq(g.freeLand(),44);
 const h=field();quiet(h);h.level=20;h.refuse('sad');h.finishRefusal();eq(h.freeLand(),41);
});
check('thieves steal mature topics, leave resources unpetrified, and hammer awards points',()=>{
 const g=field();quiet(g);const t=mature(g,0,'nsfw');g.spawnThief();const e=g.enemies[0];e.x=t.x;e.y=t.y;
 g.update(.01);ok(e.leaving);eq(t.topic,null);eq(t.stone,false);
 e.x=g.player.x+15;e.y=g.player.y;g.hammer();ok(e.dead);eq(g.stats.thieves,1);eq(g.score,5);ok(g.hitstop>0);
});
check('thieves avoid stone on approach; entity count stays bounded',()=>{
 const g=field();quiet(g);g.petrify(g.tiles[0]);mature(g,1,'daily');g.spawnThief();const e=g.enemies[0];
 e.x=g.tiles[0].x-37;e.y=g.tiles[0].y;for(let i=0;i<20;i++){g.update(.01);ok(!g.isStoneAt(e.x,e.y,e.r));}
 for(let i=0;i<100;i++)g.spawnThief();ok(g.enemies.length<=CFG.MAX_THIEVES);
});
check('three or fewer unpetrified plots collapses, all plots freeze, then report',()=>{
 const g=field();quiet(g);for(let i=0;i<46;i++)g.petrify(g.tiles[i]);g.update(.01);
 eq(g.state,STATES.COLLAPSE);eq(g.freeLand(),0);tick(g,2.1);eq(g.state,STATES.RESULT);eq(g.ending,'崩溃');
});
check('thief collision depleting HP uses collapse ending',()=>{
 const g=field();quiet(g);g.player.hp=1;g.player.inv=0;g.damage();eq(g.state,STATES.COLLAPSE);tick(g,2.1);eq(g.ending,'崩溃');
});
check('ban chance is rolled once at seed time and not influenced by topics',()=>{
 const make=r=>{const g=new Run(()=>r);g.reset();g.drawBan();return g;};
 const a=make(.1),b=make(.9);ok(a.banAt>=60&&a.banAt<=300);eq(b.banAt,null);
 const before=a.banAt;a.drawBan();eq(a.banAt,before);a.enterField();a.alert=99;a.bag=['nsfw'];a.feedOne();eq(a.banAt,before);
});
check('scheduled ban interrupts refusal and window transitions independently of combat time',()=>{
 for(const state of [STATES.STAGE_2,STATES.REFUSAL,STATES.WINDOW_TRANSITION]){
  const g=field();quiet(g);g.state=state;g.transition=1;g.fieldTime=59.99;g.banAt=60;g.update(.02);eq(g.state,STATES.BANNED);
 }
 const g=field();quiet(g);g.banAt=.2;g.collapse('earlier');tick(g,2.1);eq(g.state,STATES.RESULT);eq(g.ending,'崩溃');
});
check('no-ban seed never receives a later ban and there is no fixed stage-two timeout',()=>{
 const g=field();quiet(g);g.fieldTime=900;g.update(.01);eq(g.state,STATES.STAGE_2);eq(g.banAt,null);
});
check('ban yes returns to clean title; no locks report replay',()=>{
 const g=field();g.score=300;g.ban();eq(g.title(),'天选倒霉号');g.reincarnate(false);eq(g.state,STATES.RESULT);ok(g.resultLocked);eq(g.ending,'封号');
 const h=field();h.ban();h.reincarnate(true);eq(h.state,STATES.TITLE);eq(h.score,0);eq(h.bag,[]);eq(h.banAt,null);eq(h.stats.windows,0);
});
check('dialog lines never repeat consecutively and titles reflect play style',()=>{
 const g=field();let last=g.bubble;for(let i=0;i<10;i++){g.say('opening');ok(g.bubble!==last);last=g.bubble;}
 g.stats.refusals=1;g.stats.fed.philosophy=4;eq(g.title(),'田埂上的哲学家');g.stats.compost=6;eq(g.title(),'自我消化大师');
 g.ending='封号';eq(g.title(),'天选倒霉号');
});

check('ban lottery approximates configured 20 percent without inspecting play',()=>{
 const random=rng(9472);let banned=0;
 for(let i=0;i<1500;i++){const g=new Run(random);g.drawBan();if(g.banAt!==null){banned++;ok(g.banAt>=CFG.BAN_MIN&&g.banAt<=CFG.BAN_MAX);}}
 ok(banned>240&&banned<360,'unexpected lottery distribution '+banned);
});
check('leaving thieves also avoid petrified plots',()=>{
 const g=field();quiet(g);g.petrify(g.tiles[0]);g.spawnThief();const e=g.enemies[0];
 e.x=g.tiles[0].x-37;e.y=g.tiles[0].y;e.leaving=true;e.exit=1;
 for(let i=0;i<30;i++){g.update(.01);if(!e.dead)ok(!g.isStoneAt(e.x,e.y,e.r));}
});

for(const style of ['nearest','compost','careful'])check('long simulation: '+style+' ends by field collapse, not a fixed timeout',()=>{
 const g=new Run(rng(1));g.reset();g.drawBan();g.banAt=null;g.enterField();
 for(let step=0;step<30*1000&&g.state!==STATES.RESULT;step++){
  if(g.state===STATES.STAGE_2){
   if(g.freeLand()<14&&g.hearts>=g.windowPrice())g.newWindow();
   const p=g.player;let target;
   if(style==='compost'&&g.bag.includes('sad'))target=g.compost;
   else if(g.bag.length>=3)target=g.robot;
   else{
    let crops=g.tiles.filter(t=>!t.stone&&t.topic);
    if(style==='careful'){const sad=crops.filter(t=>t.topic==='sad'&&t.age>5);if(sad.length)crops=sad;}
    target=crops.sort((a,b)=>dist2(p,a)-dist2(p,b))[0]||g.robot;
   }
   const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
   g.input.x=d>3?dx/d:0;g.input.y=d>3?dy/d:0;
  }
  g.update(1/30);g.flushEffects();
 }
 eq(g.state,STATES.RESULT);eq(g.ending,'崩溃');ok(g.player.hp>0,'simulation ended by damage');
 ok(g.fieldTime>180&&g.fieldTime<900,'unexpected survival time '+g.fieldTime);ok(g.stats.windows>0);
 if(style==='compost')ok(g.stats.compost>0);else ok(g.stats.fed.sad>0);
});
return checks;
`)();
for (const name of checks) console.log('PASS model: ' + name);
// Instrument a copy only; the shipped game exposes no testing globals.
const instrumented = 'return ' + script.replace(
  'renderMenu();hud();draw();requestAnimationFrame(animate);\n})();',
  'renderMenu();hud();draw();requestAnimationFrame(animate);\nreturn {run,STATES,TOPICS,movement,animate,renderMenu,hud};\n})();'
);
const uiChecks = new Function('instrumented', String.raw`
const nodes=new Map(),raf=[],ctxCalls=[],storage=new Map(),stored=[];
const context=new Proxy({}, {get(t,k){if(k in t)return t[k];return (...args)=>{if(ctxCalls.length<20)ctxCalls.push([k,...args]);};},set(t,k,v){t[k]=v;return true;}});
class Node{
 constructor(id){this.id=id;this.listeners={};this.style={};this.hidden=false;this.inert=false;this.dataset={};this.attributes={};this.html='';this.classList={toggle(){}};}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 send(name,event={}){event.preventDefault??=()=>{};for(const fn of this.listeners[name]||[])fn(event);}
 setAttribute(k,v){this.attributes[k]=v;}
 getContext(){return context;}querySelector(){return get(this.id+':child');}
 getBoundingClientRect(){return this.id==='stick'?{left:0,top:0,width:92,height:92}:{left:0,top:0,width:360,height:640};}
 setPointerCapture(){}releasePointerCapture(){}focus(){}closest(){return this;}
 set innerHTML(v){this.html=v;}get innerHTML(){return this.html;}
}
function get(id){if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);}
const document={getElementById:get,listeners:{},hidden:false,addEventListener(n,f){(this.listeners[n]??=[]).push(f);}};
const window={matchMedia:()=>({matches:false}),listeners:{},addEventListener(n,f){(this.listeners[n]??=[]).push(f);}};
const localStorage={getItem:k=>storage.get(k)||null,setItem(k,v){storage.set(k,v);stored.push([k,v]);}};
function requestAnimationFrame(fn){raf.push(fn);return raf.length;}
const api=new Function('window','document','requestAnimationFrame','localStorage',instrumented)(window,document,requestAnimationFrame,localStorage);
function assert(v,msg){if(!v)throw Error(msg);}
const results=[];function test(name,fn){fn();results.push(name);}
const click=action=>get('overlay').send('click',{target:{disabled:false,dataset:{action},closest(){return this;}}});
const key=(type,code)=>{for(const f of window.listeners[type]||[])f({code,repeat:false,preventDefault(){}});};
test('full game draws title, shows best score and revised footer',()=>{
 assert(get('overlay').innerHTML.includes('下田去'),'start absent');assert(get('overlay').innerHTML.includes('本机最高分'),'best score absent');
 assert(get('overlay').innerHTML.includes('parsnip.partner'),'footer wrong');assert(ctxCalls.length>0,'not drawn');
});
test('keyboard, mouse and joystick work and release without stuck input',()=>{
 click('start');key('keydown','KeyD');api.movement();assert(api.run.input.x===1,'key not mapped');key('keydown','Space');assert(api.run.stats.dashes===1,'dash failed');
 key('keyup','KeyD');api.movement();assert(api.run.input.x===0,'key stuck');
 get('stick').send('pointerdown',{pointerId:1,button:0,clientX:80,clientY:46});api.movement();assert(api.run.input.x>.8,'stick not mapped');
 get('stick').send('pointercancel',{pointerId:1});api.movement();assert(api.run.input.x===0,'stick stuck');
 get('world').send('pointerdown',{pointerId:2,button:0,clientX:330,clientY:330});api.movement();assert(api.run.input.x>0,'mouse not mapped');
 get('world').send('lostpointercapture',{pointerId:2});api.movement();assert(api.run.input.x===0,'mouse stuck');
});
test('blur and hidden page freeze growth, alert decay and independent ban clock',()=>{
 api.run.drawBan();api.run.banAt=500;api.run.enterField();api.run.alert=40;api.run.bag=['daily'];
 api.renderMenu();api.hud();key('keydown','KeyW');for(const f of window.listeners.blur)f();
 const before=[api.run.fieldTime,api.run.tiles[0].grow,api.run.alert];api.animate(100);api.animate(500);
 assert(JSON.stringify(before)===JSON.stringify([api.run.fieldTime,api.run.tiles[0].grow,api.run.alert]),'paused state advanced');
 click('resume');api.movement();assert(api.run.input.y===0,'input not reset');
 document.hidden=true;for(const f of document.listeners.visibilitychange)f();assert(get('overlay').innerHTML.includes('田在等你'),'background not paused');
 document.hidden=false;click('resume');
});
test('new-window UI displays exact shortfall; N and button charge once',()=>{
 api.run.hearts=3;api.hud();assert(get('new-window').disabled,'insufficient funds enabled');assert(get('new-window').textContent.includes('差♥5'),'shortfall wrong');
 key('keydown','KeyN');assert(api.run.state===api.STATES.STAGE_2,'unaffordable N worked');
 api.run.hearts=20;api.hud();get('new-window').send('click');assert(api.run.stats.windows===1&&api.run.hearts===12,'button charge wrong');
 key('keydown','KeyN');assert(api.run.stats.windows===1,'charged during transition');
 while(api.run.state===api.STATES.WINDOW_TRANSITION)api.run.update(.05);api.renderMenu();api.hud();
 key('keydown','KeyN');assert(api.run.stats.windows===2&&api.run.hearts===0,'N charge wrong');
 while(api.run.state===api.STATES.WINDOW_TRANSITION)api.run.update(.05);
});
test('refusal notices use trigger topic, placeholder only, and menus block movement',()=>{
 api.run.refuse('sad');api.renderMenu();api.hud();assert(get('overlay').innerHTML.includes('xxx-xxxx-xxxx'),'sad prompt missing');
 assert(!get('overlay').innerHTML.includes('WARNING'),'wrong sad prompt');assert(get('controls').hidden&&get('controls').inert,'movement not blocked');
 key('keydown','KeyA');api.movement();assert(api.run.input.x===0,'moved behind refusal');
 api.run.finishRefusal();api.renderMenu();api.run.refuse('nsfw');api.renderMenu();
 assert(get('overlay').innerHTML.includes('WARNING')&&get('overlay').innerHTML.includes('违规记录：1'),'NSFW notice wrong');
 assert(!get('overlay').innerHTML.includes('xxx-xxxx'),'NSFW hotline leaked');
 api.run.finishRefusal();api.renderMenu();api.run.refuse('daily');api.renderMenu();assert(!get('overlay').innerHTML.includes('refusal-note'),'safe refusal extra notice');
 api.run.finishRefusal();api.renderMenu();
});
test('ban confirmation yes resets to title, no produces stamped report without replay',()=>{
 api.run.score=123;api.run.ban();api.renderMenu();api.hud();assert(get('overlay').innerHTML.includes('秽土转生'),'ban choice missing');
 assert(stored.length>0&&storage.get('parsnip_partner_best_v2')==='123','best not stored at ban');
 click('reincarnate');assert(api.run.state===api.STATES.TITLE,'yes not title');assert(get('overlay').innerHTML.includes('最高分 123'),'best lost');
 click('start');api.run.drawBan();api.run.enterField();api.run.score=200;api.run.ban();api.renderMenu();click('accept-ban');
 assert(api.run.resultLocked,'result not locked');assert(get('overlay').innerHTML.includes('账号已封禁'),'stamp missing');
 assert(!get('overlay').innerHTML.includes('data-action="start"'),'banned replay exposed');assert(get('overlay').innerHTML.includes('感谢游玩'),'thanks absent');
 click('start');assert(api.run.state===api.STATES.RESULT,'locked replay allowed');
});
test('collapse report supports clean replay, all six topic stats and best score persist',()=>{
 api.run.reset();api.run.enterField();api.renderMenu();api.run.score=250;api.run.collapse('test');while(api.run.state===api.STATES.COLLAPSE)api.run.update(.05);
 api.renderMenu();assert(get('overlay').innerHTML.includes('data-action="start"'),'collapse replay absent');
 for(const t of Object.values(api.TOPICS))assert(get('overlay').innerHTML.includes(t.name),'topic stat absent');
 click('start');assert(api.run.stats.windows===0&&api.run.bag.length===0&&api.run.score===0,'reset incomplete');
 assert(storage.get('parsnip_partner_best_v2')==='250','best missing');
});
test('sound and reduce-motion settings do not prevent play',()=>{
 get('sound').send('click');assert(get('sound').attributes['aria-pressed']==='false','mute failed');
 get('motion').send('click');assert(get('motion').attributes['aria-pressed']==='true','motion failed');api.animate(600);api.animate(620);
});
return results;
`)(instrumented);
for (const name of uiChecks) console.log('PASS DOM double: ' + name);
console.log((checks.length + uiChecks.length) + ' checks passed; full page script syntax passed.');
