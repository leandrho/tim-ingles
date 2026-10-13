const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/opening-sequence.js'), 'utf8');

function setup({reduced=false, gsap=false, videoFrames=false, smoke=false}={}) {
  const timers = new Map();
  const frames = new Map();
  const tweens = [];
  const timelines = [];
  let nextId = 0;
  let starts = 0;
  let finishes = 0;
  let document;

  class Element {
    constructor() {
      this.listeners = new Map();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.inert = false;
      this.textContent = '';
      this.style = {removeProperty(name) { delete this[name]; }};
      const classes = new Set();
      this.classList = {
        add:(...names)=>names.forEach(name=>classes.add(name)),
        remove:(...names)=>names.forEach(name=>classes.delete(name)),
        contains:name=>classes.has(name),
        toggle(name,on) { if(on) classes.add(name); else classes.delete(name); },
      };
    }
    addEventListener(name, callback) {
      if(!this.listeners.has(name)) this.listeners.set(name,new Set());
      this.listeners.get(name).add(callback);
    }
    removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
    emit(name, properties={}) {
      const event = {preventDefault() { this.defaultPrevented=true; },...properties};
      this.listeners.get(name)?.forEach(callback=>callback(event));
      return event;
    }
    setAttribute(name, value) { this.attributes.set(name,String(value)); }
    getAttribute(name) { return this.attributes.get(name); }
    removeAttribute(name) { this.attributes.delete(name); if(name==='src') this.src=''; }
    focus() { document.activeElement = this; }
  }

  document = new Element();
  document.body = new Element();
  document.hidden = false;
  const pageElements = [new Element(),new Element(),new Element()];
  pageElements[1].inert = true;
  document.querySelectorAll = () => pageElements;
  const window = new Element();
  const motion = new Element();
  motion.matches = reduced;
  window.matchMedia = () => motion;
  const root = new Element();
  root.hidden = true;
  const elements = {};
  for(const selector of ['.opening-video','.opening-film','.opening-title',
    '.opening-credit--agustina','.opening-credit--leandro',
    '.opening-gate','#opening-start','#opening-skip','#opening-status']) {
    elements[selector] = new Element();
  }
  root.querySelector = selector => elements[selector] || null;
  root.querySelectorAll = selector => selector==='.opening-credit'
    ? [elements['.opening-credit--agustina'],elements['.opening-credit--leandro']] : [];
  if(smoke) {
    elements['.opening-smoke'] = new Element();
    elements['.opening-artwork'] = new Element();
    window.SmokeSystem = class {
      constructor(canvas, artwork, options) { this.options=options; }
      setActive(on) { this.active=on; }
      setPaused(on) { this.paused=on; }
    };
  }
  const video = elements['.opening-video'];
  video.dataset = {src:'assets/video/this-is-halloween-opening.mp4',duration:'60'};
  video.paused = true;
  video.currentTime = 0;
  video.duration = 60.018;
  video.playCalls = 0;
  video.loadCalls = 0;
  video.play = () => {
    video.playCalls++;
    video.paused = false;
    return video.nextPlay || Promise.resolve();
  };
  video.pause = () => {
    const playing = !video.paused;
    video.paused = true;
    if(playing) video.emit('pause');
  };
  video.load = () => { video.loadCalls++; };
  const requestFrame = callback => { const id=++nextId; frames.set(id,callback); return id; };
  const cancelFrame = id => frames.delete(id);
  if(videoFrames) {
    video.requestVideoFrameCallback = requestFrame;
    video.cancelVideoFrameCallback = cancelFrame;
  }
  if(gsap) {
    window.gsap = {
      timeline(options) {
        const timeline = {
          options, steps:[], clock:0, killed:false,
          fromTo(...args) { this.steps.push(['fromTo',...args]); return this; },
          to(...args) { this.steps.push(['to',...args]); return this; },
          time(value) { this.clock=value; return this; },
          kill() { this.killed=true; },
        };
        timelines.push(timeline);
        return timeline;
      },
      to(target, vars) { tweens.push({target,vars}); },
    };
  }
  vm.runInNewContext(source, {
    window, document,
    requestAnimationFrame:requestFrame, cancelAnimationFrame:cancelFrame,
    setTimeout(callback) { const id=++nextId; timers.set(id,callback); return id; },
    clearTimeout:id=>timers.delete(id),
  });
  const opening = new window.OpeningSequence(root, {
    onStart:()=>starts++, onFinish:()=>finishes++,
  });
  return {
    opening, video, root, document, window, motion, elements, pageElements,
    timers, frames, tweens, timelines,
    get starts() { return starts; }, get finishes() { return finishes; },
    start() { elements['#opening-start'].emit('click'); video.emit('playing'); },
    time(value) { video.currentTime=value; video.emit('timeupdate'); },
    hide() { document.hidden=true; document.emit('visibilitychange'); },
    show() { document.hidden=false; document.emit('visibilitychange'); },
  };
}

test('the gate waits for a gesture and never requests the film on page load', ()=>{
  const app = setup();
  assert.equal(app.elements['#opening-start'].textContent,'START');
  assert.equal(app.elements['#opening-status'].textContent,'');
  assert.equal(app.opening.active,true);
  assert.equal(app.root.hidden,false);
  assert.equal(app.video.src,undefined);
  assert.equal(app.video.playCalls,0);
  assert.equal(app.document.activeElement,app.elements['#opening-start']);
  assert.ok(app.pageElements.every(element=>element.inert));
  assert.equal(app.document.body.classList.contains('opening-active'),true);
});

test('Start plays with sound; actual playback leaves only Skip intro accessible', ()=>{
  const app = setup();
  app.elements['#opening-start'].emit('click');
  assert.equal(app.opening.state,'loading');
  assert.equal(app.video.src,app.video.dataset.src);
  assert.equal(app.video.muted,false);
  assert.equal(app.video.volume,.65);
  assert.equal(app.starts,1);
  assert.equal(app.elements['#opening-start'].disabled,true);
  app.video.emit('playing');
  assert.equal(app.opening.state,'playing');
  assert.equal(app.elements['.opening-gate'].hidden,true);
  assert.equal(app.elements['#opening-start'].hidden,true);
  assert.equal(app.elements['#opening-skip'].hidden,false);
  assert.equal(app.document.activeElement,app.elements['#opening-skip']);
  assert.equal(app.timers.size,0);
});

test('the native fallback reveals and dismisses the title using media time', ()=>{
  const app = setup();
  app.start();
  const title = app.elements['.opening-title'];
  app.time(9);
  assert.equal(title.style.opacity,0);
  app.time(11.5);
  assert.equal(title.style.opacity,.5);
  app.time(14);
  assert.equal(title.style.opacity,1);
  assert.equal(title.getAttribute('aria-hidden'),'false');
  app.time(20.5);
  assert.equal(title.style.opacity,.5);
  app.time(22);
  assert.equal(title.style.opacity,0);
  assert.equal(title.getAttribute('aria-hidden'),'true');
});

test('each presenter fades in and out separately after the title, with no overlap', ()=>{
  const app = setup();
  app.start();
  const agustina = app.elements['.opening-credit--agustina'];
  const leandro = app.elements['.opening-credit--leandro'];
  app.time(24);
  assert.equal(agustina.style.opacity,0);
  assert.equal(leandro.style.opacity,0);
  app.time(26.5);
  assert.equal(agustina.style.opacity,.5);
  assert.equal(leandro.style.opacity,0);
  app.time(28);
  assert.equal(agustina.style.opacity,1);
  assert.equal(agustina.getAttribute('aria-hidden'),'false');
  assert.equal(app.elements['.opening-title'].style.opacity,0);
  app.time(34.5);
  assert.equal(agustina.style.opacity,.5);
  app.time(36);
  assert.equal(agustina.style.opacity,0);
  assert.equal(agustina.getAttribute('aria-hidden'),'true');
  assert.equal(leandro.style.opacity,0);
  app.time(40.5);
  assert.equal(leandro.style.opacity,.5);
  assert.equal(agustina.style.opacity,0);
  app.time(42);
  assert.equal(leandro.style.opacity,1);
  assert.equal(leandro.getAttribute('aria-hidden'),'false');
  app.time(48.5);
  assert.equal(leandro.style.opacity,.5);
  app.time(50);
  assert.equal(leandro.style.opacity,0);
  assert.equal(leandro.getAttribute('aria-hidden'),'true');
  app.time(58.5);
  assert.equal(app.root.style.opacity,.5);
  assert.equal(agustina.style.opacity,0);
  assert.equal(leandro.style.opacity,0);
});

test('the GSAP timeline is paused and follows the media clock, not wall-clock timers', ()=>{
  const app = setup({gsap:true});
  app.start();
  app.time(14);
  assert.equal(app.timelines.length,1);
  assert.equal(app.timelines[0].options.paused,true);
  assert.equal(app.timelines[0].clock,14);
  assert.equal(app.timelines[0].steps.length,9);
  assert.deepEqual(app.timelines[0].steps.map(step=>step.at(-1)),[0,10,19,25,33,39,47,56,57]);
  assert.equal(app.timelines[0].steps[3][1],app.elements['.opening-credit--agustina']);
  assert.equal(app.timelines[0].steps[5][1],app.elements['.opening-credit--leandro']);
  app.video.pause();
  app.time(15);
  assert.equal(app.timelines[0].clock,15);
  app.video.emit('playing');
  assert.equal(app.timelines.length,1);
});

test('interrupted playback preserves the film position and stops scheduling frames', ()=>{
  const app = setup({videoFrames:true});
  app.start();
  app.time(16);
  assert.equal(app.frames.size,1);
  app.video.pause();
  assert.equal(app.opening.state,'paused');
  assert.equal(app.frames.size,0);
  app.opening.play();
  app.video.emit('playing');
  assert.equal(app.video.currentTime,16);
  assert.equal(app.frames.size,1);
});

test('Skip before Start restores previous inert states without loading the film', ()=>{
  const app = setup();
  app.elements['#opening-skip'].emit('click');
  assert.equal(app.finishes,1);
  assert.equal(app.opening.active,false);
  assert.equal(app.root.hidden,true);
  assert.deepEqual(app.pageElements.map(element=>element.inert),[false,true,false]);
  assert.equal(app.video.playCalls,0);
  assert.equal(app.document.body.classList.contains('opening-active'),false);
});

test('at 60 seconds the film stops, all listeners clean up, and completion happens once', ()=>{
  const app = setup();
  app.start();
  app.time(60);
  app.video.emit('ended');
  app.opening.finish();
  assert.equal(app.finishes,1);
  assert.equal(app.opening.state,'done');
  assert.equal(app.video.paused,true);
  assert.equal(app.video.muted,true);
  assert.equal(app.video.src,'');
  assert.equal(app.frames.size,0);
  assert.equal(app.timers.size,0);
  assert.equal(app.opening.listeners.length,0);
});

test('skipping during playback fades the video sound and keeps navigation locked until done', ()=>{
  const app = setup({gsap:true});
  app.start();
  app.opening.finish();
  assert.equal(app.opening.active,true);
  assert.equal(app.opening.state,'finishing');
  assert.equal(app.timelines[0].killed,true);
  assert.equal(app.tweens[0].target,app.video);
  assert.equal(app.tweens[0].vars.volume,0);
  app.tweens[1].vars.onComplete();
  assert.equal(app.opening.active,false);
  assert.equal(app.finishes,1);
});

test('hidden tabs pause the film and resume at the same point only if it was playing', ()=>{
  const app = setup();
  app.start();
  app.time(18);
  app.hide();
  assert.equal(app.video.paused,true);
  assert.equal(app.frames.size,0);
  app.show();
  app.video.emit('playing');
  assert.equal(app.video.currentTime,18);
  assert.equal(app.video.playCalls,2);
  app.video.pause();
  app.hide();
  app.show();
  assert.equal(app.video.playCalls,2);
  assert.equal(app.video.paused,true);
});

test('media failures show Retry and Skip instead of advancing or leaving a blank screen', ()=>{
  const app = setup();
  app.start();
  app.time(29);
  app.video.emit('error');
  assert.equal(app.opening.state,'error');
  assert.equal(app.elements['.opening-gate'].hidden,false);
  assert.equal(app.elements['#opening-start'].textContent,'Retry');
  assert.equal(app.root.style.opacity,undefined);
  assert.equal(app.elements['.opening-credit--agustina'].style.opacity,undefined);
  assert.equal(app.elements['.opening-credit--agustina'].getAttribute('aria-hidden'),'true');
  assert.equal(app.elements['.opening-credit--leandro'].getAttribute('aria-hidden'),'true');
  assert.equal(app.finishes,0);
  app.start();
  assert.equal(app.video.playCalls,2);
  assert.equal(app.opening.state,'playing');
});

test('a loading timeout provides a usable recovery state', ()=>{
  const app = setup();
  app.elements['#opening-start'].emit('click');
  [...app.timers.values()][0]();
  assert.equal(app.opening.state,'error');
  assert.equal(app.elements['#opening-start'].disabled,false);
});

test('a rejected play promise after Skip cannot reopen the gate', async ()=>{
  const app = setup();
  let reject;
  app.video.nextPlay = new Promise((resolve,failure)=>{ reject=failure; });
  app.elements['#opening-start'].emit('click');
  app.elements['#opening-skip'].emit('click');
  reject(new Error('Playback interrupted'));
  await Promise.resolve();
  assert.equal(app.opening.state,'done');
  assert.equal(app.finishes,1);
});

test('a pending play interrupted by a hidden tab is not reported as a video error', async ()=>{
  const app = setup();
  let reject;
  app.video.nextPlay = new Promise((resolve,failure)=>{ reject=failure; });
  app.elements['#opening-start'].emit('click');
  app.hide();
  reject(Object.assign(new Error('Interrupted'),{name:'AbortError'}));
  await Promise.resolve();
  assert.equal(app.opening.state,'paused');
  assert.equal(app.opening.resumeWhenVisible,true);
});

test('reduced motion presents static credits and enters the slides without playing media', ()=>{
  const app = setup({reduced:true,gsap:true});
  assert.equal(app.root.classList.contains('is-reduced'),true);
  assert.equal(app.elements['#opening-start'].textContent,'Start presentation');
  assert.equal(app.elements['.opening-title'].getAttribute('aria-hidden'),'false');
  assert.equal(app.elements['.opening-credit--agustina'].getAttribute('aria-hidden'),'false');
  assert.equal(app.elements['.opening-credit--leandro'].getAttribute('aria-hidden'),'false');
  app.elements['#opening-start'].emit('click');
  assert.equal(app.video.playCalls,0);
  assert.equal(app.timelines.length,0);
  assert.equal(app.finishes,1);
});

test('turning reduced motion on during playback immediately ends the animated opening', ()=>{
  const app = setup({gsap:true});
  app.start();
  app.motion.matches=true;
  app.motion.emit('change');
  assert.equal(app.video.paused,true);
  assert.equal(app.opening.active,false);
});

test('Tab stays inside the prologue controls; Escape skips it', ()=>{
  const app = setup();
  app.elements['#opening-skip'].focus();
  assert.equal(app.root.emit('keydown',{key:'Tab'}).defaultPrevented,true);
  assert.equal(app.document.activeElement,app.elements['#opening-start']);
  app.root.emit('keydown',{key:'Tab',shiftKey:true});
  assert.equal(app.document.activeElement,app.elements['#opening-skip']);
  assert.equal(app.root.emit('keydown',{key:'Escape'}).defaultPrevented,true);
  assert.equal(app.finishes,1);
});

test('the opening mist moves before Start without fetching or playing the film', ()=>{
  const app = setup({smoke:true});
  assert.equal(app.opening.smoke.options.profile,'opening');
  assert.equal(app.opening.smoke.active,true);
  assert.equal(app.opening.smoke.paused,false);
  assert.equal(app.video.playCalls,0);
  assert.equal(app.video.src,undefined);
  app.elements['#opening-skip'].emit('click');
  assert.equal(app.opening.smoke.active,false);
});

test('video Pause freezes the mist in place; finishing the intro stops it', ()=>{
  const app = setup({smoke:true});
  app.start();
  app.video.pause();
  assert.equal(app.opening.smoke.active,true);
  assert.equal(app.opening.smoke.paused,true);
  app.opening.play();
  app.video.emit('playing');
  assert.equal(app.opening.smoke.paused,false);
  app.time(60);
  assert.equal(app.opening.smoke.active,false);
});

test('reduced motion keeps the opening mist static until entering the presentation', ()=>{
  const app = setup({smoke:true,reduced:true});
  assert.equal(app.opening.smoke.active,true);
  assert.equal(app.opening.smoke.paused,true);
  app.elements['#opening-start'].emit('click');
  assert.equal(app.opening.smoke.active,false);
});

test('a playing event at the end cannot reactivate the completed opening mist', ()=>{
  const app = setup({smoke:true});
  app.elements['#opening-start'].emit('click');
  app.video.currentTime=60;
  app.video.emit('playing');
  assert.equal(app.opening.active,false);
  assert.equal(app.opening.smoke.active,false);
});
