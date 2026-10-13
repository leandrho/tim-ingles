const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');

function setup({opening=true, hidden=false, hash=''}={}) {
  let now=0;
  let nextTimer=0;
  let rejectPlay=null;
  let synthAttempts=0;
  const timers=new Map();
  class Element {
    constructor(classes=[]) {
      this.listeners=new Map();
      this.attributes=new Map();
      this.style={setProperty(name,value){this[name]=value;}};
      const names=new Set(classes);
      this.classList={
        add:name=>names.add(name),
        remove:name=>names.delete(name),
        contains:name=>names.has(name),
        toggle(name,on){if(on) names.add(name); else names.delete(name);},
      };
    }
    addEventListener(name,callback){
      if(!this.listeners.has(name)) this.listeners.set(name,new Set());
      this.listeners.get(name).add(callback);
    }
    emit(name,event={}){this.listeners.get(name)?.forEach(callback=>callback(event));}
    setAttribute(name,value){this.attributes.set(name,value);}
    closest(){return null;}
    appendChild(){}
  }
  const document=new Element();
  document.body=new Element(['hero-active']);
  document.documentElement=new Element();
  document.hidden=hidden;
  const window=new Element();
  window.innerHeight=900;
  window.scrollY=0;
  window.scrollTo=({top})=>{window.scrollY=top;};
  window.requestIdleCallback=()=>{};
  window.matchMedia=()=>Object.assign(new Element(),{matches:false});
  window.AudioContext=class {constructor(){synthAttempts++; throw new Error('Unexpected synth fallback');}};
  window.SlideNavigation=class {};
  window.HeroSnowDelay=class {
    constructor(onReady){this.ready=false; this.onReady=onReady;}
    update({active,visible}){this.active=active; this.visible=visible;}
    finish(){this.ready=true; this.onReady();}
  };
  class SnowSystem {
    constructor(){this.topStarts=0;}
    setIntensity(){}
    setEmitting(){}
    setActive(on){this.active=on;}
    restartFromTop(){this.topStarts++;}
  }
  if(opening) window.OpeningSequence=class {
    constructor(root,callbacks){this.active=true; this.callbacks=callbacks;}
    start(){this.callbacks.onStart();}
    finish(){this.active=false; this.callbacks.onFinish();}
  };
  window.ClosingMemory=class {
    constructor(video,callbacks){this.active=false; this.video=video; this.callbacks=callbacks;}
    setActive(on){
      if(this.active===on) return;
      this.active=on;
      if(on){this.callbacks.onEnter(); this.setMuted(false);}
    }
    setMuted(muted){this.video.muted=muted; this.callbacks.onSoundChange(!muted);}
  };
  const slides=['hero','biography','thanks'].map((id,index)=>{
    const slide=new Element();
    slide.id=id;
    slide.getBoundingClientRect=()=>({top:index*900-window.scrollY,height:900});
    return slide;
  });
  const dots=slides.map((slide,index)=>Object.assign(new Element(index===0?['active']:[]),{
    dataset:{target:slide.id},
  }));
  const audio=Object.assign(new Element(),{
    src:'http://localhost/assets/audio/theme.mp3', paused:true, currentTime:0, playCalls:[],
    play(){
      this.playCalls.push({volume:this.volume});
      if(this.nextError){
        const error=this.nextError;
        this.nextError=null;
        return Promise.reject(error);
      }
      if(this.deferPlay) return new Promise((resolve,reject)=>{rejectPlay=reject;});
      this.paused=false;
      return Promise.resolve();
    },
    pause(){this.paused=true;},
  });
  const audioBtn=new Element();
  audioBtn.closest=selector=>selector==='#audio-btn'?audioBtn:null;
  const scissorOverlay=new Element();
  scissorOverlay.querySelector=()=>new Element();
  const elements={
    progress:new Element(), 'theme-audio':audio, 'audio-btn':audioBtn,
    'scissor-overlay':scissorOverlay, 'transition-artwork':new Element(),
    'snow-canvas':new Element(), 'thanks-video':new Element(),
    opening:opening?new Element():null,
    ...Object.fromEntries(slides.map(slide=>[slide.id,slide])),
  };
  document.getElementById=id=>elements[id]||null;
  document.querySelector=()=>null;
  document.querySelectorAll=selector=>selector==='.dot'?dots:selector==='.slide'?slides:[];
  const context=vm.createContext({
    window,document,SnowSystem, URL,console,
    location:{href:'http://localhost/'+hash,hash},
    IntersectionObserver:class {observe(){}},
    setTimeout(callback,delay){
      const id=++nextTimer;
      timers.set(id,{callback,at:now+delay});
      return id;
    },
    clearTimeout:id=>timers.delete(id),
  });
  vm.runInContext(source,context);
  return {
    audio,audioBtn,document,window,
    get synthAttempts(){return synthAttempts;},
    get snow(){return vm.runInContext('snow',context);},
    get snowDelay(){return vm.runInContext('heroSnowDelay',context);},
    get opening(){return vm.runInContext('openingSequence',context);},
    activate:index=>vm.runInContext(`activate(${index})`,context),
    go:index=>vm.runInContext(`go(${index})`,context),
    reject:error=>rejectPlay(error),
    gesture(target=new Element(),isTrusted=true){document.emit('pointerdown',{target,isTrusted});},
    tick(milliseconds){
      const end=now+milliseconds;
      while(true){
        const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next) break;
        const [id,timer]=next;
        timers.delete(id);
        now=timer.at;
        timer.callback();
      }
      now=end;
    },
  };
}

test('theme stays silent throughout the intro, including repeated hero activations', ()=>{
  const app=setup();
  app.opening.start();
  app.activate(0);
  app.tick(60000);
  assert.equal(app.audio.volume,.5);
  assert.equal(app.audio.playCalls.length,0);
  assert.equal(app.audio.paused,true);
});

test('theme starts at fifty percent when the intro hands off to the hero, before snowfall', ()=>{
  const app=setup();
  app.opening.finish();
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.playCalls[0].volume,.5);
  assert.equal(app.audio.paused,false);
  assert.equal(app.snow.active,false);
  assert.equal(app.audioBtn.attributes.get('aria-pressed'),'true');
});

test('refreshes never restart the song or override a manual music toggle', ()=>{
  const app=setup();
  app.opening.finish();
  app.audio.currentTime=12;
  app.activate(0);
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.currentTime,12);
  app.audioBtn.emit('click');
  app.activate(0);
  app.document.emit('visibilitychange');
  app.window.emit('pageshow');
  assert.equal(app.audio.paused,true);
  assert.equal(app.audio.playCalls.length,1);
});

test('theme remains background music on other slides and stops for the closing film', ()=>{
  const app=setup();
  app.opening.finish();
  app.activate(1);
  assert.equal(app.audio.paused,false);
  app.activate(2);
  assert.equal(app.audio.paused,true);
});

test('returning to the hero starts the theme only after the curtain finishes opening', ()=>{
  const app=setup();
  app.opening.finish();
  app.activate(2);
  app.go(0);
  app.tick(1920);
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.paused,true);
  app.tick(1719);
  assert.equal(app.audio.playCalls.length,1);
  app.tick(1);
  assert.equal(app.audio.playCalls.length,2);
  assert.equal(app.audio.paused,false);
  assert.equal(app.audio.volume,.5);
});

test('a hidden hero waits until it becomes visible before starting the theme', ()=>{
  const app=setup({hidden:true});
  app.opening.finish();
  assert.equal(app.audio.playCalls.length,0);
  app.document.hidden=false;
  app.document.emit('visibilitychange');
  assert.equal(app.audio.playCalls.length,1);
});

test('hero autoplay also works without the prologue controller', ()=>{
  const app=setup({opening:false});
  app.activate(0);
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.volume,.5);
});

test('a deep link never starts the theme during the initial transient hero activation', ()=>{
  const app=setup({hash:'#thanks'});
  app.activate(0);
  assert.equal(app.audio.playCalls.length,0);
  app.activate(2);
  app.go(0);
  app.tick(3640);
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.volume,.5);
});

test('the delayed hero snow resets above the viewport once, not on every refresh', ()=>{
  const app=setup();
  app.opening.finish();
  assert.equal(app.snow.topStarts,0);
  app.snowDelay.finish();
  assert.equal(app.snow.topStarts,1);
  assert.equal(app.snow.active,true);
  app.activate(0);
  app.document.emit('visibilitychange');
  assert.equal(app.snow.topStarts,1);
});

test('blocked autoplay retries the actual theme on a trusted gesture, never the synth', async ()=>{
  const app=setup();
  app.audio.nextError=Object.assign(new Error('Gesture required'),{name:'NotAllowedError'});
  app.opening.finish();
  await Promise.resolve();
  assert.equal(app.audioBtn.attributes.get('aria-pressed'),'false');
  assert.equal(app.synthAttempts,0);
  app.gesture(undefined,false);
  assert.equal(app.audio.playCalls.length,1);
  app.gesture();
  assert.equal(app.audio.playCalls.length,2);
  assert.equal(app.audio.paused,false);
  assert.equal(app.audio.volume,.5);
});

test('the music button can enable a blocked theme without a duplicate gesture retry', async ()=>{
  const app=setup();
  app.audio.nextError=Object.assign(new Error('Gesture required'),{name:'NotAllowedError'});
  app.opening.finish();
  await Promise.resolve();
  app.gesture(app.audioBtn);
  app.audioBtn.emit('click');
  assert.equal(app.audio.playCalls.length,2);
  assert.equal(app.audio.paused,false);
});

test('a cancelled play rejection cannot resume music after the user turns it off', async ()=>{
  const app=setup();
  app.audio.deferPlay=true;
  app.opening.finish();
  app.audioBtn.emit('click');
  app.reject(Object.assign(new Error('Gesture required'),{name:'NotAllowedError'}));
  await Promise.resolve();
  app.gesture();
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.paused,true);
  assert.equal(app.audioBtn.attributes.get('aria-pressed'),'false');
});

test('the closing film cancels a pending theme gesture retry', async ()=>{
  const app=setup();
  app.audio.nextError=Object.assign(new Error('Gesture required'),{name:'NotAllowedError'});
  app.opening.finish();
  await Promise.resolve();
  app.activate(2);
  app.gesture();
  assert.equal(app.audio.playCalls.length,1);
  assert.equal(app.audio.paused,true);
});
