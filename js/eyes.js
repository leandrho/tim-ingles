(() => {
  const eyes = document.querySelector('.fearful-eyes');
  if (!eyes) return;

  const elements = [...eyes.querySelectorAll('.fearful-eye')];
  const lids = [...eyes.querySelectorAll('.eye-lid')].map((element, i) => ({
    element,
    eye: elements[i],
    open: elements[i].querySelector('.eye-socket').getAttribute('d'),
    angry: element.dataset.angry,
    closed: element.getAttribute('d'),
  }));
  const smile = eyes.querySelector('.spectral-smile');
  const curves = [...eyes.querySelectorAll('.smile-curve')].map(element => ({
    element,
    length: element.getTotalLength(),
  }));
  const stitches = [...eyes.querySelectorAll('.smile-stitch')];
  const face = [...elements, smile].filter(Boolean);
  const cycleDuration = 13.2;
  const expressionStart = 4.35;
  const closingDuration = .55;
  const closingStart = cycleDuration - closingDuration;

  curves.forEach(curve => {
    curve.element.style.strokeDasharray = `${curve.length} ${curve.length}`;
  });

  // The upper lid travels down into a curved seam; the lower lid moves much less.
  // Only the aperture changes: the eyes never rotate, scale or slide.
  if (typeof gsap === 'undefined') {
    lids.forEach(lid => {
      lid.element.setAttribute('d', lid.angry);
      lid.eye.style.visibility = 'visible';
    });
    if (smile) smile.style.visibility = 'visible';
    return;
  }

  const media = gsap.matchMedia();
  media.add({
    animate: '(prefers-reduced-motion: no-preference)',
    reduce: '(prefers-reduced-motion: reduce)',
  }, context => {
    let visible = false;
    let blink;

    function close() {
      blink?.kill();
      blink = null;
      gsap.set(face, { autoAlpha: 0 });
      lids.forEach(lid => lid.element.setAttribute('d', lid.closed));
      curves.forEach(curve => gsap.set(curve.element, { strokeDashoffset: curve.length }));
      if (stitches.length) gsap.set(stitches, { autoAlpha: 0 });
    }

    function update() {
      close();
      if (!visible || document.hidden) return;

      if (context.conditions.reduce) {
        lids.forEach(lid => lid.element.setAttribute('d', lid.angry));
        gsap.set(face, { autoAlpha: 1 });
        curves.forEach(curve => gsap.set(curve.element, { strokeDashoffset: 0 }));
        if (stitches.length) gsap.set(stitches, { autoAlpha: 1 });
        return;
      }

      blink = gsap.timeline({ delay: 15, repeat: -1, repeatDelay: 20 });
      blink.set(elements, { autoAlpha: 1 }, 0);
      lids.forEach((lid, i) => {
        blink.to(lid.element, {
          attr: { d: lid.open },
          duration: i ? .64 : .6,
          ease: 'sine.out',
        }, i ? .025 : 0);
        blink.to(lid.element, {
          attr: { d: lid.angry },
          duration: i ? .75 : .72,
          ease: 'sine.inOut',
        }, expressionStart + (i ? .025 : 0));
        blink.to(lid.element, {
          attr: { d: lid.closed },
          duration: closingDuration - (i ? .02 : 0),
          ease: 'sine.inOut',
        }, closingStart + (i ? .02 : 0));
      });
      // The stitched grin appears as the eyes narrow, then retreats with the eyelids.
      if (smile) blink.set(smile, { autoAlpha: 1 }, expressionStart);
      curves.forEach(curve => {
        blink.to(curve.element, {
          strokeDashoffset: 0,
          duration: .8,
          ease: 'sine.out',
        }, expressionStart);
        blink.to(curve.element, {
          strokeDashoffset: curve.length,
          duration: closingDuration,
          ease: 'sine.inOut',
        }, closingStart);
      });
      if (stitches.length) {
        blink.to(stitches, {
          autoAlpha: 1,
          duration: .34,
          stagger: { amount: .22, from: 'center' },
          ease: 'sine.out',
        }, expressionStart + .12);
        blink.to(stitches, {
          autoAlpha: 0,
          duration: closingDuration - .15,
          stagger: { amount: .15, from: 'edges' },
          ease: 'sine.inOut',
        }, closingStart);
      }
      blink.set(face, { autoAlpha: 0 }, cycleDuration);
    }

    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .5;
      update();
    }, { threshold: .5 });
    observer.observe(eyes);
    document.addEventListener('visibilitychange', update);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      close();
    };
  }, eyes);
})();
