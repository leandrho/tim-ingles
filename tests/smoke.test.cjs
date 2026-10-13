const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/smoke.js'), 'utf8');

function setup({profile, reduced=false, webgl=true, loaded=true, width=1440, height=900}={}) {
  const frames = new Map();
  const uniforms = new Map();
  const shaders = [];
  let nextFrame = 0;
  let draws = 0;
  let contexts = 0;
  class Element {
    constructor() {
      this.listeners = new Map();
      const classes = new Set();
      this.classList = {
        add:name=>classes.add(name),
        toggle(name,on) { if(on) classes.add(name); else classes.delete(name); },
        contains:name=>classes.has(name),
      };
    }
    addEventListener(name, callback) {
      if(!this.listeners.has(name)) this.listeners.set(name,new Set());
      this.listeners.get(name).add(callback);
    }
    emit(name) { this.listeners.get(name)?.forEach(callback=>callback({preventDefault(){}})); }
  }
  const gl = new Proxy({
    VERTEX_SHADER:'vertex', FRAGMENT_SHADER:'fragment',
    createShader:type=>({type}),
    shaderSource(shader, code) { shaders.push({type:shader.type,code}); },
    getShaderParameter:()=>true,
    createProgram:()=>({}),
    getProgramParameter:()=>true,
    getUniformLocation:(program,name)=>name,
    uniform1f:(name,value)=>uniforms.set(name,value),
    uniform1i:(name,value)=>uniforms.set(name,value),
    uniform2f:(name,x,y)=>uniforms.set(name,[x,y]),
    drawArrays() { draws++; },
  }, {get:(target,name)=>name in target ? target[name] : ()=>{}});
  const canvas = new Element();
  canvas.parentElement = new Element();
  canvas.clientWidth = width;
  canvas.clientHeight = height;
  canvas.getContext = () => { contexts++; return webgl ? gl : null; };
  const artwork = new Element();
  artwork.complete = loaded;
  artwork.naturalWidth = loaded ? 1920 : 0;
  artwork.naturalHeight = loaded ? 1080 : 0;
  const motion = new Element();
  motion.matches = reduced;
  const document = new Element();
  document.hidden = false;
  const window = new Element();
  window.matchMedia = () => motion;
  vm.runInNewContext(source, {
    window, document,
    ResizeObserver:class { observe(){} },
    requestAnimationFrame(callback) { const id=++nextFrame; frames.set(id,callback); return id; },
    cancelAnimationFrame:id=>frames.delete(id),
  });
  const smoke = new window.SmokeSystem(canvas, artwork, profile ? {profile} : {});
  return {
    smoke, canvas, artwork, motion, document, window, frames, uniforms, shaders,
    get draws() { return draws; }, get contexts() { return contexts; },
    frame(time) {
      const [id,callback] = frames.entries().next().value;
      frames.delete(id);
      callback(time);
    },
  };
}

test('closing remains the default profile and prepares WebGL only when active', ()=>{
  const app = setup();
  assert.equal(app.smoke.profile,'closing');
  assert.equal(app.contexts,0);
  app.smoke.setActive(true);
  assert.equal(app.uniforms.get('u_opening'),0);
  assert.equal(app.contexts,1);
  assert.equal(app.frames.size,1);
});

test('the opening uses its own dark-scene mist profile without changing the closing default', ()=>{
  const app = setup({profile:'opening'});
  app.smoke.setActive(true);
  assert.equal(app.smoke.profile,'opening');
  assert.equal(app.uniforms.get('u_opening'),1);
  assert.ok(app.shaders.find(shader=>shader.type==='fragment').code.includes('openingArea'));
});

test('mist waits for the artwork and starts after its load event', ()=>{
  const app = setup({loaded:false});
  app.smoke.setActive(true);
  assert.equal(app.contexts,0);
  app.artwork.complete=true;
  app.artwork.naturalWidth=1920;
  app.artwork.naturalHeight=1080;
  app.artwork.emit('load');
  assert.equal(app.contexts,1);
  assert.ok(app.draws>0);
});

test('the mist clock progresses while visible and freezes without disappearing on pause', ()=>{
  const app = setup();
  app.smoke.setActive(true);
  app.frame(1000);
  app.frame(1050);
  const time = app.smoke.time;
  assert.ok(time>28);
  app.smoke.setPaused(true);
  assert.equal(app.frames.size,0);
  assert.equal(app.canvas.classList.contains('is-active'),true);
  assert.equal(app.canvas.classList.contains('is-paused'),true);
  assert.equal(app.smoke.time,time);
  app.smoke.setPaused(false);
  assert.equal(app.frames.size,1);
  assert.equal(app.smoke.time,time);
});

test('hidden tabs and inactive scenes stop rendering and resume without jumping in time', ()=>{
  const app = setup();
  app.smoke.setActive(true);
  app.document.hidden=true;
  app.document.emit('visibilitychange');
  assert.equal(app.frames.size,0);
  assert.equal(app.canvas.classList.contains('is-active'),false);
  app.document.hidden=false;
  app.document.emit('visibilitychange');
  assert.equal(app.frames.size,1);
  assert.equal(app.smoke.time,28);
  app.smoke.setActive(false);
  assert.equal(app.frames.size,0);
});

test('reduced motion draws a static mist frame without an animation loop', ()=>{
  const app = setup({reduced:true});
  app.smoke.setActive(true);
  assert.ok(app.draws>0);
  assert.equal(app.frames.size,0);
  assert.equal(app.canvas.classList.contains('is-active'),true);
});

test('the no-WebGL fallback stays available and can be paused', ()=>{
  const app = setup({webgl:false});
  app.smoke.setActive(true);
  assert.equal(app.canvas.classList.contains('is-fallback'),true);
  assert.equal(app.canvas.classList.contains('is-active'),true);
  assert.equal(app.frames.size,0);
  app.smoke.setPaused(true);
  assert.equal(app.canvas.classList.contains('is-paused'),true);
});

test('large viewports keep the mist buffer capped instead of allocating a retina-sized canvas', ()=>{
  const app = setup({width:3000,height:2000});
  app.smoke.setActive(true);
  assert.equal(app.canvas.width,1100);
  assert.equal(app.canvas.height,733);
});
