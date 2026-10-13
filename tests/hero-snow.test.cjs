const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/snow.js'), 'utf8');

function setup() {
  let now = 0;
  let nextId = 0;
  let calls = 0;
  const timers = new Map();
  const window = {};
  vm.runInNewContext(source, {
    window, performance:{now:()=>now},
    setTimeout(callback,delay) {
      const id=++nextId;
      timers.set(id,{callback,at:now+delay});
      return id;
    },
    clearTimeout:id=>timers.delete(id),
  });
  const delay = new window.HeroSnowDelay(()=>calls++);
  return {
    delay, timers,
    get calls() { return calls; },
    show:()=>delay.update({active:true,visible:true}),
    cover:()=>delay.update({active:true,visible:false}),
    leave:()=>delay.update({active:false,visible:false}),
    tick(milliseconds) {
      now+=milliseconds;
      for(const [id,timer] of [...timers]) {
        if(timer.at<=now) { timers.delete(id); timer.callback(); }
      }
    },
  };
}

test('hero snow starts after ten seconds, never earlier', ()=>{
  const app = setup();
  app.show();
  app.tick(9999);
  assert.equal(app.delay.ready,false);
  assert.equal(app.calls,0);
  app.tick(1);
  assert.equal(app.delay.ready,true);
  assert.equal(app.calls,1);
});

test('the opening film and transition curtain do not count as visible hero time', ()=>{
  const app = setup();
  app.cover();
  app.tick(65000);
  assert.equal(app.timers.size,0);
  assert.equal(app.delay.remaining,10000);
  app.show();
  app.tick(9999);
  assert.equal(app.calls,0);
  app.tick(1);
  assert.equal(app.calls,1);
});

test('repeated hero activations and refreshes do not restart the countdown', ()=>{
  const app = setup();
  app.show();
  app.tick(4000);
  app.show();
  app.tick(5999);
  assert.equal(app.calls,0);
  app.tick(1);
  assert.equal(app.calls,1);
  app.show();
  app.tick(20000);
  assert.equal(app.calls,1);
});

test('hidden time is paused and only the remaining visible time counts on return', ()=>{
  const app = setup();
  app.show();
  app.tick(3000);
  app.cover();
  assert.equal(app.delay.remaining,7000);
  app.tick(30000);
  assert.equal(app.calls,0);
  app.show();
  app.tick(6999);
  assert.equal(app.calls,0);
  app.tick(1);
  assert.equal(app.calls,1);
});

test('leaving early cancels the delay; re-entry starts a fresh ten seconds', ()=>{
  const app = setup();
  app.show();
  app.tick(9000);
  app.leave();
  app.tick(20000);
  assert.equal(app.calls,0);
  app.show();
  app.tick(9999);
  assert.equal(app.calls,0);
  app.tick(1);
  assert.equal(app.calls,1);
});

test('revisiting after the snow started also gets a fresh delay', ()=>{
  const app = setup();
  app.show();
  app.tick(10000);
  app.leave();
  assert.equal(app.delay.ready,false);
  app.show();
  app.tick(9999);
  assert.equal(app.calls,1);
  app.tick(1);
  assert.equal(app.calls,2);
});

test('a stale cancelled callback cannot start the snow during a later visit', ()=>{
  const app = setup();
  app.show();
  const callback = [...app.timers.values()][0].callback;
  app.leave();
  app.show();
  callback();
  assert.equal(app.delay.ready,false);
  assert.equal(app.calls,0);
  app.tick(10000);
  assert.equal(app.calls,1);
});
