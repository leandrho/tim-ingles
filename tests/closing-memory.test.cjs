const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/closing-memory.js'), 'utf8');

function setup({reduced=false}={}) {
  class Element {
    constructor() {
      this.listeners = new Map();
      this.attributes = new Map();
      const classes = new Set();
      this.classList = {
        add:(...names)=>names.forEach(name=>classes.add(name)),
        remove:(...names)=>names.forEach(name=>classes.delete(name)),
        contains:name=>classes.has(name),
      };
    }
    addEventListener(name, callback) {
      if(!this.listeners.has(name)) this.listeners.set(name,new Set());
      this.listeners.get(name).add(callback);
    }
    removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
    emit(name, event={}) { this.listeners.get(name)?.forEach(callback=>callback(event)); }
    setAttribute(name, value) { this.attributes.set(name,String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name); }
  }
  const document = new Element();
  document.hidden = false;
  const window = new Element();
  const motion = new Element();
  motion.matches = reduced;
  window.matchMedia = ()=>motion;
  const title = new Element();
  const memory = new Element();
  const video = new Element();
  video.closest = selector=>selector==='.thanks-memory' ? memory : {querySelector:()=>title};
  video.dataset = {start:'0'};
  video.readyState = 2;
  video.duration = 66.04;
  video.currentTime = 0;
  video.paused = true;
  video.loop = true;
  video.playCalls = 0;
  video.loadCalls = 0;
  video.play = ()=>{
    video.playCalls++;
    video.paused = false;
    return video.nextPlay || Promise.resolve();
  };
  video.pause = ()=>{ video.paused = true; };
  video.load = ()=>{ video.loadCalls++; };
  const timers = new Map();
  let timerId = 0;
  const sounds = [];
  vm.runInNewContext(source, {
    window, document,
    setTimeout(callback,delay) { timers.set(++timerId,{callback,delay}); return timerId; },
    clearTimeout:id=>timers.delete(id),
  });
  const closing = new window.ClosingMemory(video, {onSoundChange:on=>sounds.push(on)});
  return {
    closing, video, title, memory, window, document, motion, timers, sounds,
    async flush() { for(let i=0;i<8;i++) await Promise.resolve(); },
    fireTimer(delay) {
      const timer = [...timers].find(([,value])=>value.delay===delay);
      assert.ok(timer, `Missing ${delay}ms timer`);
      timers.delete(timer[0]);
      timer[1].callback();
    },
  };
}

test('the closing plays once, disables native looping and retains its first title sequence', async ()=>{
  const app=setup();
  app.closing.setActive(true);
  await app.flush();
  assert.equal(app.video.loop,false);
  assert.equal(app.video.playCalls,1);
  app.fireTimer(12000);
  assert.equal(app.title.classList.contains('is-visible'),true);
  app.fireTimer(10000);
  assert.equal(app.title.classList.contains('is-dismissed'),true);
  app.video.emit('ended');
  assert.equal(app.closing.completed,true);
  assert.equal(app.video.paused,true);
  assert.equal(app.memory.classList.contains('is-finished'),true);
  assert.equal(app.title.classList.contains('is-visible'),true);
  assert.equal(app.title.classList.contains('is-dismissed'),false);
  assert.equal(app.title.getAttribute('aria-hidden'),undefined);
  assert.equal(app.timers.size,0);
  assert.equal(app.sounds.at(-1),false);
  assert.equal(app.video.playCalls,1);
});

test('an early ending cancels the title timer and stale callbacks cannot dismiss the final title', async ()=>{
  const app=setup();
  app.closing.setActive(true);
  await app.flush();
  app.fireTimer(12000);
  const staleCallback=[...app.timers.values()][0].callback;
  app.video.emit('ended');
  staleCallback();
  assert.equal(app.title.classList.contains('is-visible'),true);
  assert.equal(app.title.classList.contains('is-dismissed'),false);
  assert.equal(app.timers.size,0);
});

test('visibility, page restoration and music toggles never replay a completed ending', async ()=>{
  const app=setup();
  app.closing.setActive(true);
  await app.flush();
  app.video.emit('ended');
  app.document.hidden=true;
  app.document.emit('visibilitychange');
  app.document.hidden=false;
  app.document.emit('visibilitychange');
  app.window.emit('pagehide');
  app.window.emit('pageshow');
  app.closing.setMuted(false);
  app.video.emit('ended');
  await app.flush();
  assert.equal(app.video.playCalls,1);
  assert.equal(app.title.classList.contains('is-visible'),true);
  assert.equal(app.timers.size,0);
  assert.equal(app.sounds.at(-1),false);
});

test('a deliberate new visit resets the final state and plays the film again', async ()=>{
  const app=setup();
  app.closing.setActive(true);
  await app.flush();
  app.video.emit('ended');
  app.closing.setActive(false);
  assert.equal(app.title.classList.contains('is-visible'),false);
  app.closing.setActive(true);
  await app.flush();
  assert.equal(app.closing.completed,false);
  assert.equal(app.memory.classList.contains('is-finished'),false);
  assert.equal(app.video.playCalls,2);
  assert.equal(app.title.classList.contains('is-visible'),false);
});

test('reduced motion shows the permanent final title without requesting the film', async ()=>{
  const app=setup({reduced:true});
  app.closing.setActive(true);
  await app.flush();
  assert.equal(app.closing.completed,true);
  assert.equal(app.video.loadCalls,0);
  assert.equal(app.video.playCalls,0);
  assert.equal(app.title.classList.contains('is-visible'),true);
  assert.equal(app.timers.size,0);
});

test('switching to reduced motion ends the film without restarting if motion is restored', async ()=>{
  const app=setup();
  app.closing.setActive(true);
  await app.flush();
  app.motion.matches=true;
  app.motion.emit('change');
  app.motion.matches=false;
  app.motion.emit('change');
  await app.flush();
  assert.equal(app.video.playCalls,1);
  assert.equal(app.video.paused,true);
  assert.equal(app.title.classList.contains('is-visible'),true);
});

test('a pending play promise cannot restart the film after completion', async ()=>{
  const app=setup();
  let resolvePlay;
  app.video.nextPlay=new Promise(resolve=>{ resolvePlay=resolve; });
  app.closing.setActive(true);
  await app.flush();
  app.video.emit('ended');
  resolvePlay();
  await app.flush();
  assert.equal(app.video.paused,true);
  assert.equal(app.video.playCalls,1);
  assert.equal(app.title.classList.contains('is-visible'),true);
});
