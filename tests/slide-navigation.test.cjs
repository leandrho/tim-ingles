const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/slide-navigation.js'), 'utf8');

function setup({heights=[600,600,600], current=0}={}) {
  let now = 1000;
  let transitioning = false;
  const calls = [];
  const body = {};
  const target = {closest:()=>null, parentElement:body, scrollHeight:0, clientHeight:0};
  const listeners = new Map();
  const window = {
    innerHeight:600,
    scrollY:heights.slice(0,current).reduce((sum,height)=>sum+height,0),
    addEventListener(name, callback) { listeners.set(name,callback); },
    scrollTo({top}) { this.scrollY = top; },
  };
  const slides = heights.map((height,index)=>({
    getBoundingClientRect:()=>({
      top:heights.slice(0,index).reduce((sum,value)=>sum+value,0)-window.scrollY,
      height,
    }),
  }));
  vm.runInNewContext(source, {
    window,
    document:{body},
    performance:{now:()=>now},
    getComputedStyle:()=>({overflowY:'auto'}),
  });
  const navigation = new window.SlideNavigation({
    slides,
    getCurrentIndex:()=>current,
    isTransitioning:()=>transitioning,
    navigate(index, options={}) {
      if(index<0 || index>=slides.length || index===current) return false;
      calls.push({index,align:options.align});
      current=index;
      window.scrollY=heights.slice(0,index).reduce((sum,height)=>sum+height,0)
        +(options.align==='end'?Math.max(0,heights[index]-window.innerHeight):0);
      return true;
    },
  });
  function event(overrides={}) {
    return {
      target, defaultPrevented:false,
      preventDefault() { this.defaultPrevented=true; },
      ...overrides,
    };
  }
  return {
    navigation, window, calls,
    tick:milliseconds=>{ now+=milliseconds; },
    lock:value=>{ transitioning=value; },
    wheel(deltaY, overrides={}) {
      const input=event({deltaY,deltaX:0,deltaMode:0,...overrides});
      listeners.get('wheel')(input);
      return input;
    },
    key(key, overrides={}) {
      const input=event({key,...overrides});
      listeners.get('keydown')(input);
      return input;
    },
    start(y=500, touches) {
      listeners.get('touchstart')(event({touches:touches||[{identifier:1,clientX:100,clientY:y}]}));
    },
    move(y, overrides={}) {
      const input=event({touches:[{identifier:1,clientX:100,clientY:y}],...overrides});
      listeners.get('touchmove')(input);
      return input;
    },
    end() { listeners.get('touchend')(); },
  };
}

test('all presentation keys route to next/previous navigation', ()=>{
  for(const key of ['ArrowDown','ArrowRight','PageDown',' ','Spacebar']) {
    const app=setup();
    assert.equal(app.key(key).defaultPrevented,true);
    assert.equal(app.calls[0].index,1);
  }
  for(const key of ['ArrowUp','ArrowLeft','PageUp']) {
    const app=setup({current:1});
    assert.equal(app.key(key).defaultPrevented,true);
    assert.equal(app.calls[0].index,0);
  }
  const app=setup({current:1});
  app.key(' ',{shiftKey:true});
  assert.equal(app.calls[0].index,0);
});

test('Home and End route directly to the first and last slide', ()=>{
  const app=setup({current:1});
  app.key('Home');
  app.key('End');
  assert.deepEqual(app.calls.map(call=>call.index),[0,2]);
});

test('held keys and inputs during a transition do not queue extra changes', ()=>{
  const app=setup();
  app.key('ArrowRight',{repeat:true});
  app.lock(true);
  app.key(' ');
  app.wheel(500);
  app.start();
  app.move(300);
  assert.equal(app.calls.length,0);
});

test('Space preserves focused controls; editable fields and shortcuts stay native', ()=>{
  const app=setup();
  const control={closest:selector=>selector.startsWith('button')?{}:null};
  const editable={closest:()=>({})};
  assert.equal(app.key(' ',{target:control}).defaultPrevented,false);
  assert.equal(app.key('ArrowRight',{target:editable}).defaultPrevented,false);
  assert.equal(app.key('ArrowRight',{ctrlKey:true}).defaultPrevented,false);
  assert.equal(app.key('ArrowLeft',{metaKey:true}).defaultPrevented,false);
  assert.equal(app.calls.length,0);
});

test('Space on a regular link routes its native page scroll through navigation', ()=>{
  const app=setup();
  const link={closest:selector=>selector==='a'?{}:null};
  assert.equal(app.key(' ',{target:link}).defaultPrevented,true);
  assert.equal(app.calls[0].index,1);
  assert.equal(app.key('Enter',{target:link}).defaultPrevented,false);
});

test('wheel input accumulates a threshold and consumes trackpad momentum once', ()=>{
  const app=setup();
  app.wheel(20);
  app.wheel(20);
  assert.equal(app.calls.length,0);
  app.wheel(20);
  app.wheel(500);
  app.tick(100);
  app.wheel(500);
  assert.equal(app.calls.length,1);
  app.tick(300);
  app.wheel(500);
  assert.equal(app.calls.length,2);
});

test('wheel line/page deltas normalize and browser zoom remains available', ()=>{
  for(const deltaMode of [1,2]) {
    const app=setup();
    app.wheel(3,{deltaMode});
    assert.equal(app.calls.length,1);
  }
  const app=setup();
  assert.equal(app.wheel(500,{ctrlKey:true}).defaultPrevented,false);
  assert.equal(app.wheel(20,{deltaX:100}).defaultPrevented,false);
  assert.equal(app.calls.length,0);
});

test('a wheel gesture reads a tall slide without crossing its boundary', ()=>{
  const app=setup({heights:[1000,600,600]});
  app.wheel(300);
  app.wheel(300);
  app.wheel(300);
  assert.equal(app.window.scrollY,400);
  assert.equal(app.calls.length,0);
  app.tick(300);
  app.wheel(100);
  assert.equal(app.calls[0].index,1);
});

test('vertical swipes navigate once; reverse swipes enter the previous slide at its end', ()=>{
  const app=setup();
  app.start();
  app.move(470);
  assert.equal(app.calls.length,0);
  app.move(400);
  app.move(200);
  assert.equal(app.calls.length,1);
  app.end();
  app.start(300);
  app.move(500);
  assert.deepEqual(app.calls[1],{index:0,align:'end'});
});

test('a swipe on a tall slide reads to its end and needs a new gesture to leave', ()=>{
  const app=setup({heights:[1000,600,600]});
  app.start();
  app.move(200);
  app.move(0);
  app.move(-200);
  assert.equal(app.window.scrollY,400);
  assert.equal(app.calls.length,0);
  app.end();
  app.start();
  app.move(300);
  assert.equal(app.calls[0].index,1);
});

test('multi-touch gestures do not navigate or disable pinch zoom', ()=>{
  const app=setup();
  const touches=[{identifier:1,clientX:100,clientY:400},{identifier:2,clientX:200,clientY:400}];
  app.start(400,touches);
  assert.equal(app.move(300,{touches}).defaultPrevented,false);
  app.start();
  assert.equal(app.move(300,{touches}).defaultPrevented,false);
  assert.equal(app.navigation.touch,null);
  assert.equal(app.calls.length,0);
});

test('nested scrollable content can scroll without switching slides', ()=>{
  const app=setup();
  const target={closest:()=>null,scrollHeight:500,clientHeight:200,scrollTop:0,parentElement:null};
  assert.equal(app.wheel(100,{target}).defaultPrevented,false);
  assert.equal(app.calls.length,0);
});

test('first/last boundaries do not run redundant navigation', ()=>{
  const first=setup();
  first.key('ArrowLeft');
  first.wheel(-100);
  assert.equal(first.calls.length,0);
  const last=setup({current:2});
  last.key('ArrowRight');
  last.wheel(100);
  assert.equal(last.calls.length,0);
});
