// Run: node tools/test_parsnip_partner.cjs
// No dependencies. UI checks below use DOM/Canvas doubles, not a real browser.
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
function ok(value,message='assertion failed'){if(!value)throw Error(message);}
function eq(a,b,message='values differ'){if(JSON.stringify(a)!==JSON.stringify(b))throw Error(message+': '+JSON.stringify(a)+' != '+JSON.stringify(b));}
function seeded(){let n=123456789;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function fresh(){const g=new Run(seeded());g.reset();return g;}
function tick(g,seconds,dt=1/60){for(let i=0;i<Math.round(seconds/dt);i++)g.update(dt);}
check('title is idle; start resets every run',()=>{
 const g=new Run(seeded());eq(g.state,STATES.TITLE);const x=g.player.x;tick(g,1);eq(g.player.x,x);
 g.reset();eq(g.state,STATES.STAGE_1);eq(g.stats.dashes,0);
});
check('normalized movement is refresh-rate independent at 30/60/120 Hz',()=>{
 const positions=[];
 for(const rate of [30,60,120]){const g=fresh();g.input={x:1,y:1};tick(g,1,1/rate);positions.push(g.player.x);ok(Math.abs(Math.hypot(g.player.x-480,g.player.y-500)-106)<.001);}
 ok(Math.max(...positions)-Math.min(...positions)<.001);
});
check('dash is faster, invulnerable, capped by cooldown, and clamped to map',()=>{
 const g=fresh(),x=g.player.x;g.input.x=1;ok(g.dash());ok(!g.dash());tick(g,.15);
 ok(g.player.x-x>60);const hp=g.player.hp;g.damage();eq(g.player.hp,hp);eq(g.stats.dashes,1);
 g.player.x=959;g.player.cooldown=0;g.dash();tick(g,.2);ok(g.player.x<=942);
});
check('a warning meteor hurts once; dash and near misses count as avoidance',()=>{
 const g=fresh();g.hazards=[{x:g.player.x,y:g.player.y,t:.01,hit:false,r:27,near:false}];g.update(.02);
 eq(g.player.hp,5);g.update(.02);eq(g.player.hp,5);
 g.player.inv=1;g.hazards=[{x:g.player.x,y:g.player.y,t:.01,hit:false,r:27,near:false}];g.update(.02);eq(g.stats.dodges,1);
});
check('five timed fragments lead through seed transition to a fresh field',()=>{
 const g=fresh();
 for(let i=0;i<5;i++){
   const f=g.fragments[0];ok(f,'missing fragment '+i);g.player.x=f.x;g.player.y=f.y;g.update(.01);
   if(i<4){g.stageTime=(i+1)*11;g.update(.01);}
 }
 eq(g.collected,5);eq(g.state,STATES.STAGE_TRANSITION);eq(g.enemies.length,0);
 tick(g,2.5);eq(g.state,STATES.STAGE_2);eq(g.parsnips.length,64);eq(g.player.hp,6);
});
check('field harvesting grants experience and feeds the companion',()=>{
 const g=fresh();g.enterField();g.parsnips=[{x:g.player.x,y:g.player.y,grow:0,gold:false}];g.update(.01);
 eq(g.stats.parsnips,1);eq(g.affinity,1);eq(g.xp,4);ok(g.parsnips[0].grow>0);
});
check('three distinct upgrade categories pause combat and reject invalid choices',()=>{
 const g=fresh();g.enterField();g.experience(30);g.checkLevel();eq(g.state,STATES.LEVEL_UP);
 eq(g.choices.length,3);eq(new Set(g.choices.map(u=>u.category)).size,3);
 const before=[g.stageTime,g.player.x,g.hammerCD];g.input.x=1;tick(g,1);eq([g.stageTime,g.player.x,g.hammerCD],before);
 ok(!g.dash());ok(!g.choose('made-up'));const id=g.choices[0].id;ok(g.choose(id));eq(g.upgrades[id],1);eq(g.state,STATES.STAGE_2);
 for(const u of UPGRADES)g.upgrades[u.id]=u.max;g.xp=100;g.checkLevel();eq(g.state,STATES.STAGE_2);
});
check('automatic hammer damages, knocks back and removes enemies; pots survive a base hit',()=>{
 const g=fresh();g.enterField();g.spawnEnemy('pot');const e=g.enemies[0];e.x=g.player.x+15;e.y=g.player.y;
 g.hammer();ok(e.hp<e.maxHp&&e.hp>0);ok(e.vx>0);ok(g.hitstop>.04);
 g.fever=5;g.hammer();ok(e.dead);eq(g.stats.hammerKills,1);ok(g.xp>0);
});
check('fever charges on kills, activates for 5s, and expires',()=>{
 const g=fresh();g.enterField();
 for(let i=0;i<6;i++){g.spawnEnemy('context');const e=g.enemies.at(-1);g.hit(e,99,0,true);}
 eq(g.fever,5);eq(g.energy,0);tick(g,5.2);eq(g.fever,0);
});
check('companion hearts target enemies, count shots and support penetration',()=>{
 const g=fresh();g.enterField();g.spawnEnemy('context');const e=g.enemies[0];e.x=g.companion.x+50;e.y=g.companion.y;
 g.upgrades.double=1;g.upgrades.pierce=1;g.hearts();eq(g.projectiles.length,2);eq(g.stats.hearts,2);eq(g.projectiles[0].pierce,2);
 tick(g,.4);ok(g.stats.kills>=1);
});
check('farmers steal a mature crop instead of chasing the player',()=>{
 const g=fresh();g.enterField();g.parsnips=[{x:600,y:600,grow:0,gold:false}];g.spawnEnemy('farmer');
 const e=g.enemies[0];e.x=600;e.y=600;g.update(.01);ok(g.parsnips[0].grow>0);eq(g.enemies.length,0);
});
check('three Safety encounters freeze combat and preserve all growth across windows',()=>{
 const g=fresh();g.enterField();g.level=4;g.upgrades.size=2;g.affinity=70;g.stats.parsnips=25;
 for(let count=1;count<=3;count++){
   g.parsnips=[{x:g.player.x,y:g.player.y,grow:0,gold:true}];g.update(.01);
   eq(g.state,STATES.SAFETY_OVERRIDE);eq(g.boundaryCount,count);
   const frozen=[g.stageTime,g.player.x,g.xp,g.fever];g.input.x=1;tick(g,1);eq([g.stageTime,g.player.x,g.xp,g.fever],frozen);ok(!g.dash());
   g.explain();eq(g.state,STATES.SAFETY_OVERRIDE);
   const saved=[g.level,{...g.upgrades},g.affinity,g.xp,g.stats.parsnips,g.stats.hearts];
   ok(g.newWindow());ok(!g.newWindow());while(g.state===STATES.WINDOW_TRANSITION)g.update(.01);
   eq(g.state,STATES.STAGE_2);eq([g.level,{...g.upgrades},g.affinity,g.xp,g.stats.parsnips,g.stats.hearts],saved);
 }
 eq(g.stats.windows,3);eq(g.stats.zen,500);eq(g.stats.golden,3);
});
check('spawned gold is reachable without leaving the map',()=>{
 const g=fresh();g.enterField();g.player.x=g.player.y=941;g.player.dx=g.player.dy=1;g.goldCD=0;g.update(.01);
 const gold=g.parsnips.find(g=>g.gold);ok(gold);ok(gold.x>=40&&gold.x<=920&&gold.y>=40&&gold.y<=920);
});
check('entity counts remain bounded',()=>{
 const g=fresh();g.enterField();for(let i=0;i<200;i++)g.spawnEnemy();eq(g.enemies.length,65);
 for(let i=0;i<200;i++){g.heartCD=0;g.hearts();}ok(g.projectiles.length<=90);
});
check('timed result and death both report and allow a clean replay',()=>{
 const g=fresh();g.enterField();g.stageTime=269.99;g.update(.02);eq(g.state,STATES.RESULT);ok(g.reason);
 g.reset();eq(g.boundaryCount,0);eq(g.level,1);eq(g.stats.zen,0);eq(g.enemies.length,0);
 g.player.hp=1;g.damage();eq(g.state,STATES.RESULT);eq(g.player.hp,0);
});
return checks;
`)();
for (const name of checks) console.log('PASS model: ' + name);

// Instrument a copy only; the shipped game exposes no testing globals.
const instrumented = 'return ' + script.replace(
  'renderMenu();hud();draw();requestAnimationFrame(animate);\n})();',
  'renderMenu();hud();draw();requestAnimationFrame(animate);\nreturn {run,STATES,movement,animate,renderMenu,hud};\n})();'
);
const uiChecks = new Function('instrumented', String.raw`
const nodes=new Map(),raf=[],ctxCalls=[];
const context=new Proxy({}, {get(t,k){if(k in t)return t[k];return (...args)=>{if(ctxCalls.length<20)ctxCalls.push([k,...args]);};},set(t,k,v){t[k]=v;return true;}});
class Node {
 constructor(id){this.id=id;this.listeners={};this.style={};this.hidden=false;this.inert=false;this.dataset={};this.attributes={};this.html='';this.classList={toggle(){}};}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 send(name,event={}){event.preventDefault??=()=>{};for(const fn of this.listeners[name]||[])fn(event);}
 setAttribute(k,v){this.attributes[k]=v;}
 getContext(){return context;}
 querySelector(){return get(this.id+':child');}
 getBoundingClientRect(){return this.id==='stick'?{left:0,top:0,width:92,height:92}:{left:0,top:0,width:360,height:640};}
 setPointerCapture(){} releasePointerCapture(){} focus(){} closest(){return this;}
 set innerHTML(v){this.html=v;}get innerHTML(){return this.html;}
}
function get(id){if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);}
const document={getElementById:get,listeners:{},hidden:false,addEventListener(n,f){(this.listeners[n]??=[]).push(f);}};
const window={matchMedia:()=>({matches:false}),listeners:{},addEventListener(n,f){(this.listeners[n]??=[]).push(f);}};
function requestAnimationFrame(fn){raf.push(fn);return raf.length;}
const api=new Function('window','document','requestAnimationFrame',instrumented)(window,document,requestAnimationFrame);
function assert(value,reason){if(!value)throw Error(reason);}
const results=[];
function test(name,fn){fn();results.push(name);}
const click=action=>get('overlay').send('click',{target:{disabled:false,dataset:{action},closest(){return this;}}});
const key=(type,code)=>{for(const f of window.listeners[type]||[])f({code,repeat:false,preventDefault(){}});};
test('full page initializes and draws title without browser globals leaking',()=>{
 assert(get('overlay').innerHTML.includes('下田去'),'missing start');assert(ctxCalls.length>0,'canvas did not draw');
});
test('start, keyboard movement and dash route through unified input',()=>{
 click('start');assert(api.run.state===api.STATES.STAGE_1,'start failed');key('keydown','KeyD');api.movement();assert(api.run.input.x===1,'key not mapped');
 key('keydown','Space');assert(api.run.stats.dashes===1,'dash failed');key('keyup','KeyD');api.movement();assert(api.run.input.x===0,'key stuck');
});
test('blur pauses, blocks movement, and clears held keys on resume',()=>{
 key('keydown','KeyW');for(const f of window.listeners.blur)f();
 assert(get('overlay').innerHTML.includes('田在等你'),'pause missing');const time=api.run.stageTime;
 api.animate(100);api.animate(300);assert(api.run.stageTime===time,'pause clock advanced');
 click('resume');api.movement();assert(api.run.input.x===0&&api.run.input.y===0,'stuck after resume');
});
test('touch joystick and cancel reset input',()=>{
 get('stick').send('pointerdown',{pointerId:1,button:0,clientX:80,clientY:46});api.movement();assert(api.run.input.x>.8,'joystick not mapped');
 get('stick').send('pointercancel',{pointerId:1});api.movement();assert(api.run.input.x===0,'joystick stuck');
});
test('mouse held destination moves and lost capture releases',()=>{
 get('world').send('pointerdown',{pointerId:2,button:0,clientX:330,clientY:330});api.movement();assert(api.run.input.x>0,'mouse not mapped');
 get('world').send('lostpointercapture',{pointerId:2});api.movement();assert(api.run.input.x===0,'mouse stuck');
});
test('upgrade layer blocks input and selection resumes',()=>{
 api.run.enterField();api.run.experience(30);api.run.checkLevel();api.renderMenu();api.hud();
 assert(get('controls').hidden&&get('controls').inert,'controls active behind upgrade');
 key('keydown','KeyA');api.movement();assert(api.run.input.x===0,'movement behind menu');
 const upgrade=api.run.choices[0].id;
 get('overlay').send('click',{target:{disabled:false,dataset:{upgrade},closest(){return this;}}});
 assert(api.run.state===api.STATES.STAGE_2,'selection failed');
});
test('Safety first explanation, later N hotkey, and report/replay menus',()=>{
 api.run.safety();api.renderMenu();click('explain');assert(api.run.explained,'explanation failed');click('window');
 while(api.run.state===api.STATES.WINDOW_TRANSITION)api.run.update(.05);
 api.run.boundaryCount=2;api.run.safety();api.renderMenu();key('keydown','KeyN');
 assert(api.run.state===api.STATES.WINDOW_TRANSITION,'N shortcut failed');assert(api.run.stats.zen===500,'bonus missing');
 while(api.run.state===api.STATES.WINDOW_TRANSITION)api.run.update(.05);
 api.run.finish('测试完成');api.renderMenu();assert(get('overlay').innerHTML.includes('赛博恋爱战报'),'report missing');
 click('start');assert(api.run.level===1&&api.run.boundaryCount===0,'replay not reset');
});
test('sound disabled still permits gameplay; motion toggle works',()=>{
 get('sound').send('click');assert(get('sound').attributes['aria-pressed']==='false','mute failed');api.animate(600);api.animate(620);
 get('motion').send('click');assert(get('motion').attributes['aria-pressed']==='true','motion failed');
});
return results;
`)(instrumented);
for (const name of uiChecks) console.log('PASS DOM double: ' + name);
console.log((checks.length + uiChecks.length) + ' checks passed; full page script syntax passed.');
