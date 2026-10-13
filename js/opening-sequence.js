// The film is the clock: loading, pausing and background tabs never desync the credits.
(() => {
class OpeningSequence {
  constructor(root, {onStart, onFinish} = {}) {
    this.root = root;
    this.video = root.querySelector('.opening-video');
    this.film = root.querySelector('.opening-film');
    this.title = root.querySelector('.opening-title');
    this.credits = [...root.querySelectorAll('.opening-credit')];
    this.creditWindows = [[25,36],[39,50]];
    this.gate = root.querySelector('.opening-gate');
    this.startButton = root.querySelector('#opening-start');
    this.skipButton = root.querySelector('#opening-skip');
    this.status = root.querySelector('#opening-status');
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.duration = Number(this.video.dataset.duration) || 60;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.active = true;
    this.state = 'waiting';
    this.resumeWhenVisible = false;
    this.requestId = 0;
    this.frameId = null;
    this.loadingTimer = null;
    this.timeline = null;
    this.listeners = [];
    this.tick = () => {
      this.frameId = null;
      this.syncTime();
      this.scheduleFrame();
    };

    this.video.controls = false;
    this.video.disablePictureInPicture = true;
    this.video.muted = true;
    this.video.volume = .65;
    this.inertElements = [...document.querySelectorAll('.topbar, .dots, .slides')]
      .map(element => ({element, inert:element.inert}));
    this.inertElements.forEach(({element}) => { element.inert = true; });
    root.hidden = false;
    document.body.classList.add('opening-active');

    const canvas = root.querySelector('.opening-smoke');
    const artwork = root.querySelector('.opening-artwork');
    this.smoke = canvas && artwork && window.SmokeSystem
      ? new window.SmokeSystem(canvas, artwork, {profile:'opening'}) : null;

    this.listen(this.startButton, 'click', () => {
      if(this.motionQuery.matches) this.finish({immediate:true});
      else this.play(true);
    });
    this.listen(this.skipButton, 'click', () => this.finish());
    this.listen(root, 'keydown', event => this.onKeyDown(event));
    this.listen(this.video, 'playing', () => {
      if(!this.active || this.state==='finishing') return;
      clearTimeout(this.loadingTimer);
      this.state = 'playing';
      this.gate.hidden = true;
      this.startButton.hidden = true;
      this.smoke?.setPaused?.(false);
      root.classList.add('is-ready');
      this.timeline ||= this.createTimeline();
      this.syncTime();
      if(!this.active || this.state!=='playing') return;
      if(document.hidden) this.suspend();
      else {
        this.smoke?.setActive(true);
        this.scheduleFrame();
      }
      // Don't strand keyboard focus on the now-hidden Start button.
      if(document.activeElement===this.startButton) this.skipButton.focus({preventScroll:true});
    });
    this.listen(this.video, 'pause', () => {
      if(!this.active || !['playing','loading'].includes(this.state)) return;
      this.state = 'paused';
      this.cancelFrame();
      this.smoke?.setPaused?.(true);
    });
    this.listen(this.video, 'timeupdate', () => this.syncTime());
    this.listen(this.video, 'ended', () => this.finish({immediate:true}));
    this.listen(this.video, 'error', () => this.fail());
    this.listen(document, 'visibilitychange', () => {
      if(document.hidden) this.suspend();
      else this.resume();
    });
    this.listen(window, 'pagehide', () => this.suspend());
    this.listen(window, 'pageshow', () => this.resume());
    this.listen(this.motionQuery, 'change', () => {
      if(this.motionQuery.matches && this.state!=='waiting') this.finish({immediate:true});
      else this.updateMotion();
    });
    this.updateMotion();
    this.startButton.focus({preventScroll:true});
  }

  listen(target, event, callback) {
    target.addEventListener(event, callback);
    this.listeners.push(() => target.removeEventListener(event, callback));
  }

  updateMotion() {
    const reduced = this.motionQuery.matches;
    this.root.classList.toggle('is-reduced', reduced);
    this.title.setAttribute('aria-hidden', String(!reduced));
    this.credits.forEach(credit => credit.setAttribute('aria-hidden', String(!reduced)));
    this.startButton.textContent = reduced ? 'Start presentation' : 'START';
    this.status.textContent = '';
    this.smoke?.setPaused?.(reduced);
    this.smoke?.setActive(true);
  }

  play(restart=false) {
    if(!this.active || this.state==='finishing') return;
    this.onStart?.();
    const request = ++this.requestId;
    this.state = 'loading';
    this.startButton.disabled = true;
    this.startButton.textContent = 'Loading…';
    this.status.textContent = 'The film is loading. You can skip it.';
    if(restart) {
      // Nothing requests the film until the audience chooses Start.
      this.video.src = this.video.dataset.src;
      this.video.preload = 'auto';
      this.video.muted = false;
      this.video.volume = .65;
      this.root.classList.remove('is-ready');
      this.timeline?.time(0, true);
    }
    clearTimeout(this.loadingTimer);
    this.loadingTimer = setTimeout(() => {
      if(this.state==='loading') this.fail();
    }, 20000);
    // Invoke play directly inside the click, retaining permission to use sound.
    this.video.play().catch(error => {
      if(error.name==='AbortError' && (this.resumeWhenVisible || this.state==='paused')) return;
      if(request===this.requestId && this.active && this.state!=='finishing') this.fail();
    });
  }

  createTimeline() {
    if(!window.gsap) return null;
    const timeline = window.gsap.timeline({paused:true})
      .fromTo(this.film, {autoAlpha:0}, {autoAlpha:1,duration:2,ease:'power1.inOut'}, 0)
      .fromTo(this.title, {autoAlpha:0}, {autoAlpha:1,duration:3,ease:'power1.inOut'}, 10)
      .to(this.title, {autoAlpha:0,duration:3,ease:'power1.inOut'}, 19);
    this.credits.forEach((credit,index) => {
      const [start,end] = this.creditWindows[index];
      timeline
        .fromTo(credit, {autoAlpha:0}, {autoAlpha:1,duration:3,ease:'power1.inOut'}, start)
        .to(credit, {autoAlpha:0,duration:3,ease:'power1.inOut'}, end-3);
    });
    return timeline
      .to(this.film, {autoAlpha:0,duration:4,ease:'power1.inOut'}, 56)
      .to(this.root, {opacity:0,duration:3,ease:'power1.inOut'}, 57);
  }

  syncTime() {
    if(!this.active || !['playing','paused'].includes(this.state)) return;
    const time = this.video.currentTime;
    if(this.timeline) this.timeline.time(time, true);
    else {
      // Native fallback keeps the same choreography if GSAP can't load.
      const clamp = value => Math.max(0, Math.min(1, value));
      const fade = (element, opacity) => {
        element.style.opacity = opacity;
        element.style.visibility = opacity > 0 ? 'visible' : 'hidden';
      };
      fade(this.film, clamp(time / 2) * clamp((60 - time) / 4));
      fade(this.title, clamp((time - 10) / 3) * clamp((22 - time) / 3));
      this.credits.forEach((credit,index) => {
        const [start,end] = this.creditWindows[index];
        fade(credit, clamp((time-start) / 3) * clamp((end-time) / 3));
      });
      this.root.style.opacity = clamp((60 - time) / 3);
    }
    this.title.setAttribute('aria-hidden', String(time<=10 || time>=22));
    this.credits.forEach((credit,index) => {
      const [start,end] = this.creditWindows[index];
      credit.setAttribute('aria-hidden', String(time<=start || time>=end));
    });
    const end = Math.min(this.duration, this.video.duration || this.duration);
    if(time>=end) this.finish({immediate:true});
  }

  scheduleFrame() {
    if(!this.active || this.state!=='playing' || this.frameId!==null) return;
    this.frameUsesVideo = Boolean(this.video.requestVideoFrameCallback);
    this.frameId = this.frameUsesVideo
      ? this.video.requestVideoFrameCallback(this.tick) : requestAnimationFrame(this.tick);
  }

  cancelFrame() {
    if(this.frameId===null) return;
    if(this.frameUsesVideo) this.video.cancelVideoFrameCallback(this.frameId);
    else cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  suspend() {
    if(!this.active || !['playing','loading'].includes(this.state)) return;
    this.resumeWhenVisible = true;
    this.video.pause();
  }

  resume() {
    if(!this.active || !this.resumeWhenVisible || document.hidden) return;
    this.resumeWhenVisible = false;
    this.play();
  }

  fail() {
    if(!this.active || this.state==='finishing') return;
    this.requestId++;
    clearTimeout(this.loadingTimer);
    this.state = 'error';
    this.resumeWhenVisible = false;
    this.video.pause();
    this.cancelFrame();
    this.timeline?.kill();
    this.timeline = null;
    for(const element of [this.root,this.film,this.title,...this.credits]) {
      element.style.removeProperty('opacity');
      element.style.removeProperty('visibility');
    }
    this.root.classList.remove('is-ready');
    this.updateMotion();
    this.gate.hidden = false;
    this.startButton.hidden = false;
    this.startButton.disabled = false;
    this.startButton.textContent = 'Retry';
    this.status.textContent = 'The video could not load. Try again or skip the intro.';
    this.startButton.focus({preventScroll:true});
  }

  onKeyDown(event) {
    if(event.key==='Escape') {
      event.preventDefault();
      this.finish();
    } else if(event.key==='Tab') {
      const buttons = [this.startButton,this.skipButton]
        .filter(button => !button.hidden && !button.disabled);
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if(event.shiftKey && document.activeElement===first) {
        event.preventDefault();
        last.focus();
      } else if(!event.shiftKey && document.activeElement===last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  finish({immediate=false} = {}) {
    if(!this.active || this.state==='finishing') return;
    this.state = 'finishing';
    this.requestId++;
    clearTimeout(this.loadingTimer);
    this.cancelFrame();
    this.smoke?.setActive(false);
    this.timeline?.kill();
    const complete = () => {
      this.active = false;
      this.state = 'done';
      this.listeners.splice(0).forEach(remove => remove());
      this.video.pause();
      this.video.muted = true;
      this.video.removeAttribute('src');
      this.video.load();
      this.root.hidden = true;
      document.body.classList.remove('opening-active');
      this.inertElements.forEach(({element,inert}) => { element.inert = inert; });
      this.onFinish?.();
    };
    if(immediate || this.motionQuery.matches || !window.gsap) complete();
    else {
      window.gsap.to(this.video, {volume:0,duration:.8,overwrite:true});
      window.gsap.to(this.root, {opacity:0,duration:.8,ease:'power1.inOut',onComplete:complete});
    }
  }
}
window.OpeningSequence = OpeningSequence;
})();
