const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/snow.js'), 'utf8');

function setup() {
  let seed=31;
  let nextFrame=0;
  let clears=0;
  const frames=new Map();
  const math=Object.create(Math);
  math.random=()=>{seed=seed*16807%2147483647; return (seed-1)/2147483646;};
  const ctx={
    setTransform(){},
    clearRect(){clears++;},
  };
  const canvas={style:{},getContext:()=>ctx};
  const window={innerWidth:1440,innerHeight:900,addEventListener(){}};
  vm.runInNewContext(source,{
    window,Math:math,document:{getElementById:()=>null},
    requestAnimationFrame(callback){const id=++nextFrame; frames.set(id,callback); return id;},
    cancelAnimationFrame:id=>frames.delete(id),
  });
  const snow=new window.SnowSystem(canvas);
  snow.draw=()=>{};
  return {
    snow,frames,
    get clears(){return clears;},
    frame(time){
      const [id,callback]=frames.entries().next().value;
      frames.delete(id);
      callback(time);
    },
  };
}

test('ordinary snow retains its existing full-scene initialization', ()=>{
  const app=setup();
  assert.equal(app.snow.particles.length,240);
  assert.ok(app.snow.particles.some(particle=>particle.y>450));
});

test('hero snowfall starts entirely above the viewport and preserves its intensity', ()=>{
  const app=setup();
  app.snow.setIntensity(30);
  app.snow.setActive(false);
  app.snow.restartFromTop();
  assert.equal(app.snow.particles.length,270);
  assert.ok(app.snow.particles.every(particle=>particle.y<=-12));
  assert.ok(app.snow.particles.every(particle=>particle.y>=-912));
  assert.equal(app.frames.size,0);
});

test('offscreen flakes are staggered instead of appearing as one solid band', ()=>{
  const app=setup();
  app.snow.restartFromTop();
  assert.ok(app.snow.particles.some(particle=>particle.y>-200));
  assert.ok(app.snow.particles.some(particle=>particle.y<-700));
});

test('early snowfall enters only the upper region, leaving the lower screen empty', ()=>{
  const app=setup();
  app.snow.setActive(false);
  app.snow.restartFromTop();
  app.snow.setActive(true);
  for(let frame=0;frame<120;frame++) app.frame(frame*1000/60);
  const visible=app.snow.particles.filter(particle=>particle.y>=0);
  assert.ok(visible.length>0);
  assert.ok(visible.length<app.snow.particles.length/2);
  assert.ok(visible.every(particle=>particle.y<180));
  assert.equal(app.frames.size,1);
});

test('restarting clears old visible flakes and emitter remnants without duplicating playback', ()=>{
  const app=setup();
  app.snow.emitterParticles.push({y:400});
  app.snow.restartFromTop();
  assert.equal(app.snow.emitterParticles.length,0);
  assert.ok(app.snow.particles.every(particle=>particle.y<0));
  assert.ok(app.clears>0);
  assert.equal(app.frames.size,1);
});

test('a lower snow intensity also stays intact when starting from the top', ()=>{
  const app=setup();
  app.snow.setIntensity(-60);
  app.snow.restartFromTop();
  assert.equal(app.snow.particles.length,180);
});
