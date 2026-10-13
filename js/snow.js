// Snow system - global canvas + emitter for Ice Dance
class SnowSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.emitterParticles = [];
    this.w = 0; this.h = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    this.baseCount = 240;
    this.extra = 0; // controlled by buttons
    this.wind = 0; // -1 to 1 based on mouse
    this.emitting = false;
    this.emitter = { x: 0.5, y: 0.32 }; // normalized
    this.lastEmit = 0;
    this.active = true;
    this.frameId = null;
    this.init();
  }
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', e => {
      const nx = (e.clientX / this.w - 0.5) * 2;
      this.wind = nx * 0.9;
    });
    window.addEventListener('touchmove', e => {
      if(e.touches[0]) this.wind = (e.touches[0].clientX / this.w - 0.5) * 1.4;
    }, {passive:true});
    this.spawnBase();
    this.frameId = requestAnimationFrame(t=>this.frame(t));
  }
  resize(){
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = this.w+'px';
    this.canvas.style.height = this.h+'px';
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.updateEmitterPos();
  }
  updateEmitterPos(){
    const el = document.getElementById('emit-point');
    if(!el) return;
    const rect = el.getBoundingClientRect();
    this.emitter.x = rect.left / this.w;
    this.emitter.y = rect.top / this.h;
  }
  spawnBase(){
    this.particles = [];
    for(let i=0;i<this.baseCount;i++) this.particles.push(this.makeParticle(true));
  }
  restartFromTop(){
    // Stagger the flakes over an offscreen viewport, avoiding a dense band at the edge.
    this.particles = Array.from({length:this.baseCount+this.extra}, ()=>{
      const particle = this.makeParticle();
      particle.y = -12 - Math.random()*this.h;
      return particle;
    });
    this.emitterParticles = [];
    this.ctx.clearRect(0,0,this.w,this.h);
  }
  makeParticle(randomY=false){
    return {
      x: Math.random()*this.w,
      y: randomY ? Math.random()*this.h : -10 - Math.random()*40,
      r: Math.random()*2.2 + 0.7,
      vy: Math.random()*0.9 + 0.55,
      vx: (Math.random()-0.5)*0.6,
      opacity: Math.random()*0.55 + 0.35,
      sway: Math.random()*Math.PI*2,
      swaySpeed: Math.random()*0.006 + 0.003,
      swayAmp: Math.random()*0.7 + 0.3,
      type: Math.random()<0.7 ? 'dot' : 'flake',
      rot: Math.random()*Math.PI,
      rotSpeed:(Math.random()-0.5)*0.03
    }
  }
  makeEmitterParticle(){
    const ex = this.emitter.x * this.w;
    const ey = this.emitter.y * this.h;
    return {
      x: ex + (Math.random()-0.5)*18,
      y: ey + (Math.random()-0.5)*10,
      r: Math.random()*2.4 + 1,
      vy: Math.random()*1.1 + 0.7,
      vx: (Math.random()-0.5)*1.6 + this.wind*0.6,
      opacity: Math.random()*0.4 + 0.6,
      life: 0, maxLife: 420 + Math.random()*300,
      type:'flake'
    }
  }
  setIntensity(delta){
    this.extra = Math.max(-60, Math.min(220, this.extra + delta));
    const target = this.baseCount + this.extra;
    if(target > this.particles.length) {
      for(let i=0;i<delta;i++) this.particles.push(this.makeParticle());
    } else if(target < this.particles.length) {
      this.particles.splice(target);
    }
  }
  setEmitting(on){
    this.emitting = on;
    this.canvas.style.opacity = on ? '1' : '.72';
  }
  setActive(on){
    if(this.active === on) return;
    this.active = on;
    if(on){
      this.frameId = requestAnimationFrame(t=>this.frame(t));
    } else {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      this.ctx.clearRect(0,0,this.w,this.h);
    }
  }
  frame(t){
    if(!this.active) return;
    this.ctx.clearRect(0,0,this.w,this.h);
    // subtle gradient veil for ice slide could be handled by css
    const total = this.particles.length;
    for(let i=0;i<total;i++){
      const p = this.particles[i];
      p.sway += p.swaySpeed;
      p.x += p.vx + Math.sin(p.sway)*p.swayAmp*0.04 + this.wind*0.7;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      // wrap
      if(p.x < -10) p.x = this.w+10;
      if(p.x > this.w+10) p.x = -10;
      if(p.y > this.h+12){
        p.y = -12;
        p.x = Math.random()*this.w;
      }
      this.draw(p);
    }
    if(this.emitting){
      this.updateEmitterPos();
      // emit 1-3 per frame
      const count = 1 + (this.extra>80?1:0);
      for(let k=0;k<count;k++) this.emitterParticles.push(this.makeEmitterParticle());
      // draw emitter particles
      for(let i=this.emitterParticles.length-1;i>=0;i--){
        const p = this.emitterParticles[i];
        p.life++;
        p.x += p.vx + this.wind*0.9;
        p.y += p.vy;
        p.vy += 0.008; // slight gravity
        p.opacity = (1 - p.life/p.maxLife)*0.9;
        if(p.life >= p.maxLife || p.y>this.h+20){
          this.emitterParticles.splice(i,1);
          continue;
        }
        this.draw(p, true);
      }
    } else {
      // still fade out existing emitter particles
      for(let i=this.emitterParticles.length-1;i>=0;i--){
        const p=this.emitterParticles[i];
        p.x+=p.vx; p.y+=p.vy; p.opacity-=0.008;
        if(p.opacity<=0) this.emitterParticles.splice(i,1);
        else this.draw(p,true);
      }
    }
    this.frameId = requestAnimationFrame(t=>this.frame(t));
  }
  draw(p, glow=false){
    this.ctx.save();
    this.ctx.globalAlpha = p.opacity;
    this.ctx.translate(p.x, p.y);
    if(p.type==='flake'){
      this.ctx.rotate(p.rot||0);
      // 6-point flake using strokes
      this.ctx.strokeStyle = glow ? 'rgba(238,246,255,0.95)' : 'rgba(255,255,255,0.95)';
      this.ctx.lineWidth = p.r*0.55;
      this.ctx.lineCap='round';
      const r = p.r*2.2;
      for(let a=0;a<6;a++){
        this.ctx.rotate(Math.PI/3);
        this.ctx.beginPath();
        this.ctx.moveTo(0,0);
        this.ctx.lineTo(0,r);
        this.ctx.stroke();
        // side branches
        this.ctx.beginPath();
        this.ctx.moveTo(0,r*0.6);
        this.ctx.lineTo(r*0.25,r*0.35);
        this.ctx.moveTo(0,r*0.6);
        this.ctx.lineTo(-r*0.25,r*0.35);
        this.ctx.stroke();
      }
      if(glow){
        this.ctx.shadowBlur=8;
        this.ctx.shadowColor='rgba(238,246,255,0.8)';
        this.ctx.fillStyle='rgba(238,246,255,1)';
        this.ctx.beginPath();this.ctx.arc(0,0,p.r*0.7,0,Math.PI*2);this.ctx.fill();
      }
    } else {
      this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
      if(glow){this.ctx.shadowBlur=6;this.ctx.shadowColor='rgba(255,255,255,0.7)'}
      this.ctx.beginPath();
      this.ctx.arc(0,0,p.r,0,Math.PI*2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }
}
window.SnowSystem = SnowSystem;

// Count only time when the hero is uncovered; repeated activations do not restart it.
class HeroSnowDelay {
  constructor(onReady, delay=10000) {
    this.onReady = onReady;
    this.delay = delay;
    this.active = false;
    this.visible = false;
    this.ready = false;
    this.remaining = delay;
    this.startedAt = null;
    this.timer = null;
    this.requestId = 0;
  }
  update({active, visible}) {
    if(active!==this.active) {
      this.pause();
      this.active = active;
      this.ready = false;
      this.remaining = this.delay;
    }
    this.visible = active && visible;
    if(!this.visible) {
      this.pause();
      return;
    }
    if(this.ready || this.timer!==null) return;
    const request = ++this.requestId;
    this.startedAt = performance.now();
    this.timer = setTimeout(() => {
      if(request!==this.requestId || !this.active || !this.visible) return;
      this.timer = null;
      this.startedAt = null;
      this.remaining = 0;
      this.ready = true;
      this.onReady();
    }, this.remaining);
  }
  pause() {
    this.requestId++;
    clearTimeout(this.timer);
    if(this.startedAt!==null) {
      this.remaining = Math.max(0, this.remaining - (performance.now() - this.startedAt));
    }
    this.startedAt = null;
    this.timer = null;
  }
}
window.HeroSnowDelay = HeroSnowDelay;
