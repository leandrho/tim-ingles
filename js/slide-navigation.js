// Route deliberate wheel, touch and keyboard navigation through the same curtain.
(() => {
const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

class SlideNavigation {
  constructor({slides, getCurrentIndex, navigate, isTransitioning, onBeforeRealign=()=>{}}) {
    this.slides = slides;
    this.getCurrentIndex = getCurrentIndex;
    this.navigate = navigate;
    this.isTransitioning = isTransitioning;
    this.onBeforeRealign = onBeforeRealign;
    this.wheelDistance = 0;
    this.lastWheelTime = 0;
    this.wheelConsumed = false;
    this.wheelReading = false;
    this.touch = null;
    this.resizeFrame = null;
    this.resizeIndex = null;

    window.addEventListener('wheel', event => this.onWheel(event), {passive:false});
    window.addEventListener('keydown', event => this.onKeyDown(event));
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('touchstart', event => this.onTouchStart(event), {passive:true});
    window.addEventListener('touchmove', event => this.onTouchMove(event), {passive:false});
    for(const event of ['touchend', 'touchcancel']) {
      window.addEventListener(event, () => { this.touch = null; }, {passive:true});
    }
  }

  onResize() {
    // Fullscreen and a projector resolution change move every slide boundary.
    // Capture the active slide before scroll observers react to the new layout.
    if(this.resizeIndex === null) this.resizeIndex = this.getCurrentIndex();
    if(this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = window.requestAnimationFrame(() => {
      const index = this.resizeIndex;
      const slide = this.slides[index];
      this.resizeFrame = null;
      this.resizeIndex = null;
      if(!slide) return;
      this.onBeforeRealign(index);
      const rect = slide.getBoundingClientRect();
      window.scrollTo({top:rect.top + window.scrollY, behavior:'instant'});
    });
  }

  isEditable(target) {
    return Boolean(target?.closest?.(editableSelector));
  }

  canScrollTarget(target, delta) {
    for(let element = target; element && element !== document.body; element = element.parentElement) {
      if(element.scrollHeight <= element.clientHeight + 1) continue;
      if(!/^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) continue;
      const remaining = delta > 0
        ? element.scrollHeight - element.clientHeight - element.scrollTop
        : element.scrollTop;
      if(remaining > 1) return true;
    }
    return false;
  }

  scrollWithinSlide(delta) {
    const slide = this.slides[this.getCurrentIndex()];
    if(!slide) return false;
    const rect = slide.getBoundingClientRect();
    const start = rect.top + window.scrollY;
    const end = Math.max(start, start + rect.height - window.innerHeight);
    const remaining = delta > 0 ? end - window.scrollY : window.scrollY - start;
    if(remaining <= 2) return false;
    const top = Math.min(end, Math.max(start, window.scrollY + delta));
    // Long mobile slides stay readable; never scroll into the next slide unmasked.
    window.scrollTo({top, behavior:'instant'});
    return true;
  }

  step(direction) {
    return this.navigate(this.getCurrentIndex() + direction, {
      align:direction < 0 ? 'end' : 'start',
    });
  }

  onWheel(event) {
    if(event.defaultPrevented || event.ctrlKey || this.isEditable(event.target)) return;
    if(!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = event.deltaY * multiplier;
    if(this.canScrollTarget(event.target, delta)) return;
    event.preventDefault();

    const now = performance.now();
    if(now - this.lastWheelTime > 220) {
      this.wheelDistance = 0;
      this.wheelConsumed = false;
      this.wheelReading = false;
    }
    this.lastWheelTime = now;
    if(this.isTransitioning()) {
      this.wheelConsumed = true;
      return;
    }
    // Trackpad momentum must not start another transition from the same gesture.
    if(this.wheelConsumed) return;
    if(this.scrollWithinSlide(delta)) {
      this.wheelReading = true;
      this.wheelDistance = 0;
      return;
    }
    if(this.wheelReading) return;
    if(Math.sign(delta) !== Math.sign(this.wheelDistance)) this.wheelDistance = 0;
    this.wheelDistance += delta;
    if(Math.abs(this.wheelDistance) >= 48) {
      this.wheelConsumed = this.step(Math.sign(this.wheelDistance));
      this.wheelDistance = 0;
    }
  }

  onKeyDown(event) {
    if(event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || this.isEditable(event.target)) return;
    const space = event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space';
    // Space must still activate a focused button, rather than steal its action.
    if(space && event.target?.closest?.('button, [role="button"]')) return;

    let direction = 0;
    if(['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key)) direction = 1;
    if(['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) direction = -1;
    if(space) direction = event.shiftKey ? -1 : 1;
    const home = event.key === 'Home';
    const end = event.key === 'End';
    if(!direction && !home && !end) return;
    event.preventDefault();
    if(event.repeat || this.isTransitioning()) return;
    const index = home ? 0 : end ? this.slides.length - 1 : this.getCurrentIndex() + direction;
    this.navigate(index);
  }

  onTouchStart(event) {
    this.touch = null;
    if(event.touches.length !== 1 || this.isEditable(event.target)) return;
    const point = event.touches[0];
    this.touch = {
      identifier:point.identifier,
      startX:point.clientX,
      startY:point.clientY,
      lastY:point.clientY,
      distance:0,
      vertical:false,
      consumed:false,
      reading:false,
    };
  }

  onTouchMove(event) {
    if(!this.touch || event.defaultPrevented) return;
    if(event.touches.length !== 1) {
      this.touch = null;
      return; // Leave pinch-to-zoom to the browser.
    }
    const point = event.touches[0];
    if(point.identifier !== this.touch.identifier) return;
    const totalY = this.touch.startY - point.clientY;
    const totalX = point.clientX - this.touch.startX;
    let delta = this.touch.lastY - point.clientY;
    this.touch.lastY = point.clientY;
    if(!this.touch.vertical) {
      if(!totalY || Math.abs(totalY) <= Math.abs(totalX)) return;
      this.touch.vertical = true;
      delta = totalY;
    }
    if(this.canScrollTarget(event.target, delta)) return;
    event.preventDefault();
    if(this.isTransitioning()) {
      this.touch.consumed = true;
      return;
    }
    if(this.touch.consumed || !delta) return;
    if(this.scrollWithinSlide(delta)) {
      this.touch.reading = true;
      this.touch.distance = 0;
      return;
    }
    if(this.touch.reading) return;
    if(Math.sign(delta) !== Math.sign(this.touch.distance)) this.touch.distance = 0;
    this.touch.distance += delta;
    if(Math.abs(this.touch.distance) >= 56) {
      this.touch.consumed = this.step(Math.sign(this.touch.distance));
      this.touch.distance = 0;
    }
  }
}

window.SlideNavigation = SlideNavigation;
})();
