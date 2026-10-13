const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/eyes.js'), 'utf8');

function element(d='') {
  return {
    style:{}, dataset:{}, attributes:{d},
    getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name]=value; },
    getTotalLength() { return 100; },
  };
}

function setup({reduced=false, hasGSAP=true, hasEyes=true, legacy=false, hidden=false}={}) {
  const eyes = [element(),element()];
  const lids = eyes.map((eye,index)=>{
    const lid=element(legacy?`closed-${index}`:`angry-${index}`);
    lid.dataset[legacy?'angry':'closed']=legacy?`angry-${index}`:`closed-${index}`;
    eye.querySelector=()=>element(`open-${index}`);
    return lid;
  });
  const smile=element();
  const curves=[element(),element()];
  const stitches=[element(),element(),element()];
  const root={
    querySelector:()=>smile,
    querySelectorAll:selector=>({
      '.fearful-eye':eyes,
      '.eye-lid':lids,
      '.smile-curve':curves,
      '.smile-stitch':stitches,
    })[selector],
  };
  const listeners=new Map();
  const document={
    hidden,
    querySelector:()=>hasEyes?root:null,
    addEventListener(name, callback) { listeners.set(name,callback); },
    removeEventListener(name, callback) {
      if(listeners.get(name)===callback) listeners.delete(name);
    },
  };
  const timelines=[];
  let observer, cleanup;
  const gsap={
    matchMedia:()=>({
      add(conditions, callback) { cleanup=callback({conditions:{reduce:reduced,animate:!reduced}}); },
    }),
    set(targets, vars) {
      for(const target of Array.isArray(targets)?targets:[targets]) {
        if('autoAlpha' in vars) {
          target.style.opacity=vars.autoAlpha;
          target.style.visibility=vars.autoAlpha?'visible':'hidden';
        }
        if('strokeDashoffset' in vars) target.style.strokeDashoffset=vars.strokeDashoffset;
      }
    },
    timeline(options) {
      const timeline={
        options, steps:[], killed:false,
        set(target, vars, position) { this.steps.push({method:'set',target,vars,position}); return this; },
        to(target, vars, position) { this.steps.push({method:'to',target,vars,position}); return this; },
        kill() { this.killed=true; },
      };
      timelines.push(timeline);
      return timeline;
    },
  };
  class IntersectionObserver {
    constructor(callback) { this.callback=callback; this.disconnected=false; observer=this; }
    observe(target) { this.target=target; }
    disconnect() { this.disconnected=true; }
  }
  vm.runInNewContext(source, {
    document, IntersectionObserver, ...(hasGSAP?{gsap}:{}),
  });
  return {
    eyes, lids, smile, curves, stitches, timelines, listeners,
    get observer() { return observer; },
    intersect(ratio) { observer.callback([{isIntersecting:ratio>0,intersectionRatio:ratio}]); },
    visibility(value) { document.hidden=value; listeners.get('visibilitychange')(); },
    cleanup:()=>cleanup(),
  };
}

test('pages without the spectral scene do not install observers', ()=>{
  const app=setup({hasEyes:false});
  assert.equal(app.observer,undefined);
  assert.equal(app.listeners.size,0);
});

test('the no-GSAP fallback shows a complete static expression', ()=>{
  const app=setup({hasGSAP:false});
  app.lids.forEach((lid,index)=>assert.equal(lid.getAttribute('d'),`angry-${index}`));
  app.eyes.forEach(eye=>assert.equal(eye.style.visibility,'visible'));
  assert.equal(app.smile.style.visibility,'visible');
  app.curves.forEach(curve=>assert.equal(curve.style.strokeDasharray,'100 100'));
  assert.equal(app.observer,undefined);
});

test('the first appearance is early, with a slow expression and a long quiet interval', ()=>{
  const app=setup();
  app.intersect(.8);
  const timeline=app.timelines[0];
  assert.equal(timeline.options.delay,2.4);
  assert.equal(timeline.options.repeatDelay,22);
  const opening=timeline.steps.find(step=>step.vars.attr?.d==='open-0');
  assert.equal(opening.vars.duration,.86);
  const smile=timeline.steps.find(step=>step.target===app.curves[0] && step.vars.strokeDashoffset===0);
  assert.ok(Math.abs(smile.position-7.22)<1e-6);
  assert.equal(smile.vars.duration,1.1);
});

test('visibility reports within the same threshold do not restart the expression', ()=>{
  const app=setup();
  app.intersect(.6);
  app.intersect(.9);
  app.intersect(1);
  assert.equal(app.timelines.length,1);
  assert.equal(app.timelines[0].killed,false);
});

test('both eyes blink exactly three times before the macabre grin appears', ()=>{
  const app=setup();
  app.intersect(.8);
  const timeline=app.timelines[0];
  const grin=timeline.steps.find(step=>step.target===app.smile && step.vars.autoAlpha===1);
  app.lids.forEach((lid,index)=>{
    const eyelidSteps=timeline.steps.filter(step=>step.target===lid && step.vars.attr);
    const closings=eyelidSteps.filter(step=>step.vars.attr.d===`closed-${index}` && step.position<grin.position);
    const openings=eyelidSteps.filter(step=>step.vars.attr.d===`open-${index}` && step.position>0.1);
    assert.equal(closings.length,3);
    assert.equal(openings.length,3);
    closings.forEach((closing,count)=>{
      assert.equal(closing.vars.duration,.22);
      assert.equal(openings[count].vars.duration,.36);
      const hold=openings[count].position-(closing.position+closing.vars.duration);
      assert.ok(Math.abs(hold-.1)<1e-6);
      assert.ok(openings[count].position+openings[count].vars.duration<grin.position);
      if(count<2) {
        const gap=closings[count+1].position-(openings[count].position+openings[count].vars.duration);
        assert.ok(Math.abs(gap-1.5)<1e-6, `Expected a 1.5s pause, got ${gap}`);
      }
    });
    const expression=eyelidSteps.find(step=>step.vars.attr.d===`angry-${index}`);
    assert.ok(expression.position>=grin.position);
  });
  assert.equal(timeline.options.repeat,-1);
  const end=timeline.steps.at(-1);
  assert.ok(Math.abs(end.position-(grin.position+10))<1e-6);
});

test('leaving the scene stops playback and re-entry starts with closed eyelids', ()=>{
  const app=setup();
  app.intersect(.8);
  app.intersect(.2);
  assert.equal(app.timelines[0].killed,true);
  app.eyes.forEach(eye=>assert.equal(eye.style.visibility,'hidden'));
  app.lids.forEach((lid,index)=>assert.equal(lid.getAttribute('d'),`closed-${index}`));
  app.intersect(.8);
  assert.equal(app.timelines.length,2);
  assert.equal(app.timelines[1].killed,false);
});

test('reduced motion shows the static face without creating a timeline', ()=>{
  const app=setup({reduced:true});
  app.intersect(.8);
  assert.equal(app.timelines.length,0);
  app.lids.forEach((lid,index)=>assert.equal(lid.getAttribute('d'),`angry-${index}`));
  app.eyes.forEach(eye=>assert.equal(eye.style.visibility,'visible'));
  assert.equal(app.smile.style.visibility,'visible');
  app.curves.forEach(curve=>assert.equal(curve.style.strokeDashoffset,0));
  app.stitches.forEach(stitch=>assert.equal(stitch.style.visibility,'visible'));
});

test('a hidden tab does not animate and resumes only when visible', ()=>{
  const app=setup({hidden:true});
  app.intersect(.8);
  assert.equal(app.timelines.length,0);
  app.visibility(false);
  assert.equal(app.timelines.length,1);
  app.visibility(true);
  assert.equal(app.timelines[0].killed,true);
  app.visibility(false);
  assert.equal(app.timelines.length,2);
});

test('media cleanup removes listeners, disconnects the observer and stops playback', ()=>{
  const app=setup();
  app.intersect(.8);
  app.cleanup();
  assert.equal(app.observer.disconnected,true);
  assert.equal(app.listeners.size,0);
  assert.equal(app.timelines[0].killed,true);
});

test('the older cached eyelid markup remains compatible', ()=>{
  const app=setup({legacy:true,reduced:true});
  app.intersect(.8);
  app.lids.forEach((lid,index)=>assert.equal(lid.getAttribute('d'),`angry-${index}`));
  app.intersect(0);
  app.lids.forEach((lid,index)=>assert.equal(lid.getAttribute('d'),`closed-${index}`));
});
