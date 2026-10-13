document.documentElement.classList.add('js');
let hasGSAP = typeof gsap !== 'undefined' && gsap.registerPlugin;
if(hasGSAP){
  try{ gsap.registerPlugin(ScrollTrigger);}catch(e){ hasGSAP=false; console.warn('GSAP failed',e)}
}

// DOM
const progress = document.getElementById('progress');
const dots = [...document.querySelectorAll('.dot')];
const slides = [...document.querySelectorAll('.slide')];
const audio = document.getElementById('theme-audio');
const audioBtn = document.getElementById('audio-btn');
const scissorOverlay = document.getElementById('scissor-overlay');
const transitionArtwork = document.getElementById('transition-artwork');
let openingSequence = null;
const opening = document.getElementById('opening');
let openingPending = Boolean(opening && window.OpeningSequence && (!location.hash || location.hash==='#hero'));
const transitionCurtains = {
  top: scissorOverlay.querySelector('.scissor-half.top'),
  bottom: scissorOverlay.querySelector('.scissor-half.bottom'),
};
const curtainMotionDuration = 1720;
const curtainHoldDuration = 200;
const scissorTransitionDuration = curtainMotionDuration + curtainHoldDuration;
const transitionIconDuration = .1;
const transitionArtworks = [
  'assets/images/entre-diapositivas/pngwing.com.webp',
  'assets/images/entre-diapositivas/pngwing.com (1).webp',
  'assets/images/entre-diapositivas/pngwing.com (2).webp',
  'assets/images/entre-diapositivas/pngwing.com (3).webp',
  'assets/images/entre-diapositivas/pngwing.com (4).webp',
  'assets/images/entre-diapositivas/pngwing.com (5).webp',
  'assets/images/entre-diapositivas/pngwing.com (6).webp',
];
const transitionArtworkPreloads = [];
const preloadTransitionArtworks = ()=>{
  transitionArtworks.forEach(src=>{
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.src = src;
    image.decode().catch(()=>{});
    transitionArtworkPreloads.push(image);
  });
};
if('requestIdleCallback' in window){
  window.requestIdleCallback(preloadTransitionArtworks,{timeout:1000});
} else {
  window.addEventListener('load',()=>setTimeout(preloadTransitionArtworks,250),{once:true});
}
let transitionArtworkIndex = 0;
const transitionPlacements = [
  { curtain: 'top', left: '8%', right: 'auto', top: '8%', bottom: 'auto' },
  { curtain: 'top', left: 'auto', right: '8%', top: '8%', bottom: 'auto' },
  { curtain: 'bottom', left: '8%', right: 'auto', top: 'auto', bottom: '8%' },
  { curtain: 'bottom', left: 'auto', right: '8%', top: 'auto', bottom: '8%' },
  { curtain: 'top', left: '50%', right: 'auto', top: '8%', bottom: 'auto', transform: 'translateX(-50%)' },
  { curtain: 'bottom', left: '50%', right: 'auto', top: 'auto', bottom: '8%', transform: 'translateX(-50%)' },
];
let transitionPlacementIndex = 0;
let transitionInProgress = false;

// Snow
const snowCanvas = document.getElementById('snow-canvas');
const snow = new SnowSystem(snowCanvas);
snow.setIntensity(30);
const snowMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroSnowDelay = new window.HeroSnowDelay(()=>{
  snow.restartFromTop();
  syncSnow();
});
function syncSnow(){
  const isHero = document.body.classList.contains('hero-active');
  const isOpening = openingPending || Boolean(openingSequence?.active);
  heroSnowDelay.update({
    active:isHero,
    visible:!isOpening && !transitionInProgress && !document.hidden,
  });
  const waiting = isHero && !heroSnowDelay.ready;
  document.body.classList.toggle('hero-snow-waiting', waiting);
  snow.setActive(!isOpening && !waiting && !document.hidden && !snowMotionQuery.matches
    && !document.body.classList.contains('thanks-active'));
}
document.addEventListener('visibilitychange', syncSnow);
window.addEventListener('pagehide', ()=>{
  heroSnowDelay.update({active:heroSnowDelay.active,visible:false});
  snow.setActive(false);
});
window.addEventListener('pageshow', syncSnow);
snowMotionQuery.addEventListener('change', syncSnow);
syncSnow();

// Mist belongs to the closing landscape, not the other slides.
const smokeAssetVersion = '20261012-smoke-1';
const thanksArtwork = document.querySelector('.thanks-artwork');
let smokeCanvas = document.getElementById('smoke-canvas');
let smoke = null;

// An older cached HTML shell may be missing the canvas, stylesheet rules and smoke script.
// Repair that shell without stopping navigation or leaving the snow visible on this slide.
const stylesheet = document.querySelector('link[href*="css/style.css"]');
const stylesheetAssetVersion = '20261012-credits-1';
if(stylesheet && new URL(stylesheet.href).searchParams.get('v') !== stylesheetAssetVersion){
  stylesheet.href = 'css/style.css?v=' + stylesheetAssetVersion;
}
if(!smokeCanvas && thanksArtwork){
  smokeCanvas = document.createElement('canvas');
  smokeCanvas.id = 'smoke-canvas';
  smokeCanvas.className = 'thanks-smoke';
  smokeCanvas.setAttribute('aria-hidden', 'true');
  thanksArtwork.after(smokeCanvas);
}
function initSmoke(){
  if(!smokeCanvas || !thanksArtwork) return;
  smokeCanvas.classList.remove('is-fallback');
  smoke = new window.SmokeSystem(smokeCanvas, thanksArtwork);
  smoke.setActive(document.body.classList.contains('thanks-active'));
}
if(smokeCanvas){
  if(window.SmokeSystem?.assetVersion === smokeAssetVersion){
    initSmoke();
  } else {
    smokeCanvas.classList.add('is-fallback');
    const script = document.createElement('script');
    script.src = 'js/smoke.js?v=' + smokeAssetVersion;
    script.onload = initSmoke;
    document.body.appendChild(script);
  }
}

// Keep the closing film's playback separate from the landscape's mist.
const thanksVideo = document.getElementById('thanks-video');
const closingMemory = thanksVideo && window.ClosingMemory
  ? new window.ClosingMemory(thanksVideo, {
      onEnter:()=>setAudio(false, true),
      onSoundChange:on=>updateAudioButton(on),
    })
  : null;

// Audio synth fallback (celesta-like)
let audioCtx, gainNode, isSynthPlaying=false;
function initSynth(){
  try{
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(audioCtx.destination);
  }catch(e){console.warn(e)}
}
function playSynth(){
  if(!audioCtx) initSynth();
  if(!audioCtx || isSynthPlaying) return;
  isSynthPlaying=true;
  gainNode.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime+1.2);
  const notes = [261.63,329.63,392.00,523.25,392.00,329.63];
  let t = audioCtx.currentTime;
  const schedule = ()=>{
    if(!isSynthPlaying) return;
    notes.forEach((freq,i)=>{
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type='triangle';
      o.frequency.value=freq;
      g.gain.setValueAtTime(0, t+i*0.55);
      g.gain.linearRampToValueAtTime(0.18, t+i*0.55+0.08);
      g.gain.exponentialRampToValueAtTime(0.01, t+i*0.55+1.6);
      o.connect(g); g.connect(gainNode);
      o.start(t+i*0.55); o.stop(t+i*0.55+1.7);
    });
    t+= notes.length*0.55+1.2;
    setTimeout(schedule, (notes.length*0.55+1.2)*1000);
  };
  schedule();
}
function stopSynth(immediate=false){
  if(!audioCtx||!isSynthPlaying) return;
  if(immediate){
    gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    isSynthPlaying=false;
    return;
  }
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime+0.6);
  setTimeout(()=>isSynthPlaying=false,700);
}
let audioOn=false;
let audioRequest=0;
let awaitingThemeGesture=false;
let heroThemeStarted=false;
let themeDeepLinkPending=slides.some(slide=>slide.id!=='hero' && location.hash==='#'+slide.id);
function updateAudioButton(on){
  audioBtn.classList.toggle('playing', on);
  audioBtn.setAttribute('aria-pressed', String(on));
}
function setAudio(on, immediate=false){
  const request=++audioRequest;
  awaitingThemeGesture=false;
  if(on && closingMemory?.active){
    closingMemory.setMuted(false);
    return;
  }
  audioOn=on;
  if(on) closingMemory?.setMuted(true);
  updateAudioButton(on);
  if(on){
    if(audio.src && audio.src!==location.href){
      audio.play().catch(error=>{
        if(request!==audioRequest || !audioOn || closingMemory?.active || error.name==='AbortError') return;
        if(error.name==='NotAllowedError'){
          // A cold visit may still need a gesture; don't replace the song with a silent synth.
          awaitingThemeGesture=true;
          audioOn=false;
          updateAudioButton(false);
        } else playSynth();
      });
    } else {
      if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
      playSynth();
    }
  } else {
    audio.pause();
    stopSynth(immediate);
  }
}
audioBtn.addEventListener('click', ()=>{
  if(closingMemory?.active) closingMemory.setMuted(!thanksVideo.muted);
  else setAudio(!audioOn);
});
audio.volume = .5;

// Start with the uncovered hero, not with the prologue or the delayed snowfall.
// Refreshes must not restart playback or undo the user's music toggle.
function syncHeroTheme(){
  const isHero=document.body.classList.contains('hero-active');
  if(!isHero){
    heroThemeStarted=false;
    themeDeepLinkPending=false;
    return;
  }
  if(themeDeepLinkPending || heroThemeStarted || openingPending || openingSequence?.active || transitionInProgress || document.hidden) return;
  heroThemeStarted=true;
  setAudio(true);
}
document.addEventListener('visibilitychange', syncHeroTheme);
window.addEventListener('pageshow', syncHeroTheme);
const unlockTheme = event=>{
  if(!event.isTrusted || event.target?.closest?.('#audio-btn') || !awaitingThemeGesture
    || document.hidden || openingPending || openingSequence?.active || transitionInProgress || closingMemory?.active) return;
  setAudio(true);
};
document.addEventListener('pointerdown', unlockTheme, {passive:true});
document.addEventListener('keydown', unlockTheme);

// Progress + dots
if(hasGSAP){
  slides.forEach((sec,i)=>{
    ScrollTrigger.create({
      trigger: sec,
      start:'top center',
      end:'bottom center',
      onEnter:()=>activate(i),
      onEnterBack:()=>activate(i)
    });
  });
} else {
  // fallback: intersection for dots
  const dotObs = new IntersectionObserver(entries=>{
    entries.forEach(ent=>{
      if(ent.isIntersecting){
        const idx = slides.indexOf(ent.target);
        if(idx>=0) activate(idx);
      }
    });
  },{threshold:.5});
  slides.forEach(s=>dotObs.observe(s));
}
function activate(i){
  if(openingSequence?.active && i!==0) return;
  dots.forEach(d=>d.classList.remove('active'));
  if(dots[i]) dots[i].classList.add('active');
  const id = slides[i]?.id;
  document.body.classList.toggle('hero-active', id==='hero');
  const isThanks = id==='thanks';
  closingMemory?.setActive(isThanks);
  if(!isThanks) updateAudioButton(audioOn);
  document.body.classList.toggle('thanks-active', isThanks);
  snowCanvas.style.visibility = isThanks ? 'hidden' : '';
  if(smoke) smoke.setActive(isThanks);
  else if(smokeCanvas) smokeCanvas.classList.toggle('is-active', isThanks);
  if(isThanks){
    snow.setEmitting(false);
    snowCanvas.style.opacity='0';
  } else if(id==='hero'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.42';
  } else if(id==='career'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.12';
  } else if(id==='conclusion'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.22';
  } else if(id==='impact'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.28';
  } else if(id==='style'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.18';
  } else {
    snow.setEmitting(false);
    snowCanvas.style.opacity='.52';
  }
  syncSnow();
  syncHeroTheme();
}
window.addEventListener('scroll', ()=>{
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = window.scrollY / Math.max(1,max);
  progress.style.width = (p*100)+'%';
});

// Navigation
const navigationMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function currentSlideIndex(){
  const index = dots.findIndex(dot=>dot.classList.contains('active'));
  return index < 0 ? 0 : index;
}
dots.forEach(d=>{
  d.addEventListener('click', ()=>{
    const target = document.getElementById(d.dataset.target);
    if(!target) return;
    go(slides.indexOf(target));
  });
});
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',e=>{
    e.preventDefault();
    const target=document.querySelector(a.getAttribute('href'));
    if(target) go(slides.indexOf(target));
  });
});
function scissorTransition(cb){
  if(transitionInProgress) return;
  if(navigationMotionQuery.matches){
    cb && cb();
    return;
  }
  transitionInProgress = true;
  syncSnow();
  transitionArtwork.src = transitionArtworks[transitionArtworkIndex];
  transitionArtworkIndex = (transitionArtworkIndex + 1) % transitionArtworks.length;
  const placement = transitionPlacements[transitionPlacementIndex];
  transitionPlacementIndex = (transitionPlacementIndex + 1) % transitionPlacements.length;
  transitionCurtains[placement.curtain].appendChild(transitionArtwork);
  transitionArtwork.style.setProperty('--transition-left', placement.left);
  transitionArtwork.style.setProperty('--transition-right', placement.right);
  transitionArtwork.style.setProperty('--transition-top', placement.top);
  transitionArtwork.style.setProperty('--transition-bottom', placement.bottom);
  transitionArtwork.style.setProperty('--transition-transform', placement.transform || 'none');
  scissorOverlay.classList.add('active');
  if(hasGSAP){
    gsap.fromTo('.transition-icon',{scale:0,rotation:-45},{scale:1,rotation:0,duration:transitionIconDuration,ease:'back.out(1.7)'});
    setTimeout(()=>{
      gsap.to('.transition-icon',{scale:0,rotation:-45,duration:transitionIconDuration,ease:'power2.in'});
    }, curtainMotionDuration - transitionIconDuration * 1000);
  }
  setTimeout(()=>{
    cb && cb();
    scissorOverlay.classList.remove('active');
    setTimeout(()=>{
      transitionInProgress = false;
      syncSnow();
      syncHeroTheme();
    }, curtainMotionDuration);
  }, scissorTransitionDuration);
}

function go(i, {align='start'}={}){
  if(openingSequence?.active || transitionInProgress || i<0 || i>=slides.length || i===currentSlideIndex()) return false;
  scissorTransition(()=>{
    const rect = slides[i].getBoundingClientRect();
    const offset = align==='end' ? Math.max(0,rect.height-window.innerHeight) : 0;
    // Change position only while the curtain is closed, without crossing other slides.
    window.scrollTo({top:rect.top+window.scrollY+offset,behavior:'instant'});
    activate(i);
  });
  return true;
}
let slideNavigation = null;
function initSlideNavigation(){
  slideNavigation = new window.SlideNavigation({
    slides,
    getCurrentIndex:currentSlideIndex,
    navigate:go,
    isTransitioning:()=>transitionInProgress || Boolean(openingSequence?.active),
  });
}
if(window.SlideNavigation){
  initSlideNavigation();
} else {
  // An older cached HTML shell may not include the new input controller yet.
  const script = document.createElement('script');
  script.src = 'js/slide-navigation.js?v=20261010-navigation-1';
  script.onload = initSlideNavigation;
  document.body.appendChild(script);
}

// Reveal observer
const observer = new IntersectionObserver(entries=>{
  entries.forEach(ent=>{
    if(ent.isIntersecting) ent.target.classList.add('is-visible');
  });
},{threshold:.15});
document.querySelectorAll('.reveal').forEach(el=> observer.observe(el));
// fallback: if after 1.5s some reveals still hidden, force them if near viewport
setTimeout(()=>{
  document.querySelectorAll('.reveal:not(.is-visible)').forEach(el=>{
    const rect=el.getBoundingClientRect();
    if(rect.top < window.innerHeight*1.1) el.classList.add('is-visible');
  });
}, 1200);
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches && hasGSAP){
  gsap.globalTimeline.clear();
}

// Deep links remain direct; an ordinary visit starts with the film prologue.
if(openingPending){
  window.scrollTo({top:0,behavior:'instant'});
  openingSequence = new window.OpeningSequence(opening, {
    onStart:()=>setAudio(false, true),
    onFinish:()=>{
      window.scrollTo({top:0,behavior:'instant'});
      activate(0);
      if(hasGSAP) ScrollTrigger.refresh();
    },
  });
  openingPending = false;
  activate(0);
}
