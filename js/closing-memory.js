// A control-free film memory. Its loop always begins at the original 1:01.
(() => {
class ClosingMemory {
  constructor(video, {onEnter, onSoundChange} = {}) {
    this.video = video;
    this.memory = video.closest('.thanks-memory');
    const slide = video.closest('.slide');
    this.title = slide.querySelector('.thanks-title');
    this.titleTimer = null;
    this.onEnter = onEnter;
    this.onSoundChange = onSoundChange;
    this.startTime = Number(video.dataset.start) || 0;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.active = false;
    this.needsRestart = true;
    this.busy = false;
    this.failed = false;
    this.reloadRequired = false;
    this.requestId = 0;
    this.metadataPromise = null;
    this.awaitingSound = false;

    video.controls = false;
    video.disablePictureInPicture = true;
    video.muted = true;
    video.volume = .65;
    video.addEventListener('volumechange', () => {
      if(this.active) this.onSoundChange?.(!video.muted);
    });
    for(const event of ['playing', 'loadeddata', 'seeked']) {
      video.addEventListener(event, () => {
        if(video.readyState >= 2 && !video.seeking && video.currentTime >= this.startTime - .15) {
          this.memory.classList.add('is-ready');
        }
      });
    }
    video.addEventListener('error', () => {
      this.requestId++;
      this.busy = false;
      this.failed = true;
      this.reloadRequired = true;
      video.pause();
      this.memory.classList.remove('is-ready');
    });
    video.addEventListener('ended', () => {
      this.needsRestart = true;
      this.syncPlayback();
    });
    this.motionQuery.addEventListener('change', () => this.syncPlayback());
    const unlockSound = event => {
      if(!event.isTrusted || event.target?.closest?.('#audio-btn')) return;
      if(this.active && this.awaitingSound && !document.hidden && !this.motionQuery.matches) {
        this.awaitingSound = false;
        this.failed = false;
        video.muted = false;
        this.syncPlayback();
      }
    };
    document.addEventListener('pointerdown', unlockSound, {passive:true});
    document.addEventListener('keydown', unlockSound);
    document.addEventListener('visibilitychange', () => this.syncPlayback());
    window.addEventListener('pagehide', () => {
      this.requestId++;
      video.pause();
      clearTimeout(this.titleTimer);
      this.titleTimer = null;
    });
    window.addEventListener('pageshow', () => {
      if(this.active && this.titleTimer === null && !this.title?.classList.contains('is-dismissed')) {
        this.startTitleTimer();
      }
      this.syncPlayback();
    });
    this.resetTitle();
  }

  setActive(on) {
    if(this.active === on) return;
    this.active = on;
    if(on) {
      this.onEnter?.();
      this.needsRestart = true;
      this.failed = false;
      this.awaitingSound = false;
      this.video.muted = false;
      this.onSoundChange?.(true);
      this.startTitleTimer();
      // Never reveal the final frame from the previous visit while seeking.
      this.memory.classList.remove('is-ready');
    } else {
      this.resetTitle();
    }
    this.syncPlayback();
  }

  setMuted(muted) {
    this.awaitingSound = false;
    this.video.muted = muted;
    if(this.active) this.onSoundChange?.(!muted);
    if(!muted && this.active) {
      this.failed = false;
      this.syncPlayback();
    }
  }

  resetTitle() {
    clearTimeout(this.titleTimer);
    this.titleTimer = null;
    this.title?.classList.remove('is-visible', 'is-dismissed');
    this.title?.setAttribute('aria-hidden', 'true');
  }

  startTitleTimer() {
    if(!this.title) return;
    this.resetTitle();
    this.titleTimer = setTimeout(() => {
      this.titleTimer = null;
      if(!this.active) return;
      this.title.classList.add('is-visible');
      this.title.removeAttribute('aria-hidden');
      this.titleTimer = setTimeout(() => {
        this.titleTimer = null;
        if(!this.active) return;
        this.title.classList.remove('is-visible');
        this.title.classList.add('is-dismissed');
        this.title.setAttribute('aria-hidden', 'true');
      }, 10000);
    }, 5000);
  }

  shouldPlay() {
    return this.active && !document.hidden && !this.failed && !this.motionQuery.matches;
  }

  waitForMedia(event, isReady, action) {
    if(isReady()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.video.removeEventListener(event, ready);
        this.video.removeEventListener('error', error);
      };
      const ready = () => {
        if(!isReady()) return;
        cleanup();
        resolve();
      };
      const error = () => {
        cleanup();
        reject(new Error('Video could not be loaded.'));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Video loading timed out.'));
      }, 20000);
      this.video.addEventListener(event, ready);
      this.video.addEventListener('error', error);
      try {
        action?.();
        ready();
      } catch(e) {
        cleanup();
        reject(e);
      }
    });
  }

  loadMetadata() {
    if(this.video.readyState >= 1 && !this.reloadRequired) return Promise.resolve();
    if(!this.metadataPromise) {
      this.metadataPromise = this.waitForMedia('loadedmetadata', () => this.video.readyState >= 1 && !this.reloadRequired, () => {
        // The file is not requested until this slide actually needs playback.
        this.reloadRequired = false;
        this.video.preload = 'auto';
        this.video.load();
      }).finally(() => { this.metadataPromise = null; });
    }
    return this.metadataPromise;
  }

  async syncPlayback() {
    const request = ++this.requestId;
    if(!this.shouldPlay()) {
      this.busy = false;
      this.video.pause();
      return;
    }
    this.busy = true;
    try {
      await this.loadMetadata();
      if(request !== this.requestId || !this.shouldPlay()) return;
      if(this.needsRestart) {
        const start = Math.min(this.startTime, Math.max(0, this.video.duration - .1));
        await this.waitForMedia('seeked', () => !this.video.seeking && Math.abs(this.video.currentTime - start) < .15, () => {
          this.video.currentTime = start;
        });
        if(request !== this.requestId || !this.shouldPlay()) return;
        this.needsRestart = false;
      }
      try {
        await this.video.play();
      } catch(e) {
        if(e.name !== 'NotAllowedError' || this.video.muted) throw e;
        if(request !== this.requestId || !this.shouldPlay()) return;
        // Cold deep links may not have a user gesture yet. Never delay the film.
        this.video.muted = true;
        this.awaitingSound = true;
        await this.video.play();
      }
      if(request === this.requestId) {
        this.failed = false;
      }
      if(!this.shouldPlay()) this.video.pause();
    } catch(e) {
      if(request !== this.requestId || !this.shouldPlay()) return;
      this.failed = e.name !== 'AbortError';
      if(this.failed && e.name !== 'NotAllowedError') {
        this.reloadRequired = true;
        this.needsRestart = true;
      }
      if(this.failed) this.memory.classList.remove('is-ready');
    } finally {
      if(request === this.requestId) {
        this.busy = false;
      }
    }
  }
}
window.ClosingMemory = ClosingMemory;
})();
