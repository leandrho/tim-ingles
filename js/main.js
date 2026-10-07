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
const transitionCurtains = {
  top: scissorOverlay.querySelector('.scissor-half.top'),
  bottom: scissorOverlay.querySelector('.scissor-half.bottom'),
};
const curtainMotionDuration = 1720;
const curtainHoldDuration = 200;
const scissorTransitionDuration = curtainMotionDuration + curtainHoldDuration;
const transitionIconDuration = .1;
const transitionArtworks = [
  'assets/images/entre-diapositivas/pngwing.com.png',
  'assets/images/entre-diapositivas/pngwing.com (1).png',
  'assets/images/entre-diapositivas/pngwing.com (2).png',
  'assets/images/entre-diapositivas/pngwing.com (3).png',
  'assets/images/entre-diapositivas/pngwing.com (4).png',
  'assets/images/entre-diapositivas/pngwing.com (5).png',
  'assets/images/entre-diapositivas/pngwing.com (6).png',
];
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
function stopSynth(){
  if(!audioCtx||!isSynthPlaying) return;
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime+0.6);
  setTimeout(()=>isSynthPlaying=false,700);
}
let audioOn=false;
function setAudio(on){
  audioOn=on;
  audioBtn.classList.toggle('playing', on);
  audioBtn.setAttribute('aria-pressed', String(on));
  audioBtn.querySelector('.label').textContent = on ? 'Sound on' : 'Sound off';
  if(on){
    if(audio.src && audio.src!==location.href){
      audio.play().catch(()=>playSynth());
    } else {
      if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
      playSynth();
    }
  } else {
    audio.pause();
    stopSynth();
  }
}
audioBtn.addEventListener('click', ()=> setAudio(!audioOn));
audio.volume = 0.18;

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
  dots.forEach(d=>d.classList.remove('active'));
  if(dots[i]) dots[i].classList.add('active');
  const id = slides[i]?.id;
  document.body.classList.toggle('hero-active', id==='hero');
  if(id==='hero'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.42';
  } else if(id==='career'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.12';
  } else if(id==='conclusion' || id==='thanks'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.22';
  } else if(id==='impact'){
    snow.setEmitting(false);
    snowCanvas.style.opacity='.28';
  } else {
    snow.setEmitting(false);
    snowCanvas.style.opacity='.52';
  }
}
window.addEventListener('scroll', ()=>{
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const p = window.scrollY / Math.max(1,max);
  progress.style.width = (p*100)+'%';
});

// Navigation
dots.forEach(d=>{
  d.addEventListener('click', ()=>{
    const target = document.getElementById(d.dataset.target);
    if(!target) return;
    scissorTransition(()=> target.scrollIntoView({behavior:'smooth'}));
  });
});
document.querySelectorAll('a[href^="#"]').forEach(a=>{
  a.addEventListener('click',e=>{
    e.preventDefault();
    const target=document.querySelector(a.getAttribute('href'));
    if(target) scissorTransition(()=> target.scrollIntoView({behavior:'smooth'}));
  });
});
function scissorTransition(cb){
  if(transitionInProgress) return;
  transitionInProgress = true;
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
    setTimeout(()=>{ transitionInProgress = false; }, curtainMotionDuration);
  }, scissorTransitionDuration);
}

// Keyboard nav
window.addEventListener('keydown', e=>{
  const cur = dots.findIndex(d=>d.classList.contains('active'));
  if(e.key==='ArrowDown' || e.key==='PageDown'){ e.preventDefault(); go(cur+1); }
  if(e.key==='ArrowUp' || e.key==='PageUp'){ e.preventDefault(); go(cur-1); }
});
function go(i){
  if(i<0) i=0; if(i>=slides.length) i=slides.length-1;
  scissorTransition(()=> slides[i].scrollIntoView({behavior:'smooth'}));
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
