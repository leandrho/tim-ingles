// Layered, advected mist. The artwork itself masks foreground silhouettes and warm lights.
(() => {
class SmokeSystem {
  constructor(canvas, artwork, {profile='closing'} = {}) {
    this.canvas = canvas;
    this.artwork = artwork;
    this.active = false;
    this.paused = false;
    this.profile = profile==='opening' ? 'opening' : 'closing';
    this.ready = false;
    this.gl = null;
    this.frameId = null;
    this.lastFrame = 0;
    this.time = 28;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.tick = t => this.frame(t);

    artwork.addEventListener('load', () => this.syncPlayback());
    artwork.addEventListener('error', () => {
      this.fallback();
      this.syncPlayback();
    });
    this.motionQuery.addEventListener('change', () => this.syncPlayback());
    document.addEventListener('visibilitychange', () => this.syncPlayback());
    window.addEventListener('pagehide', () => this.stop());
    window.addEventListener('pageshow', () => this.syncPlayback());
    this.resizeObserver = new ResizeObserver(() => {
      if(this.gl && this.active && !document.hidden) {
        this.resize();
        this.draw();
      }
    });
    this.resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      this.stop();
      this.fallback();
    });
  }

  prepare() {
    if(this.ready) return;
    if(!this.artwork.complete) return;
    if(!this.artwork.naturalWidth) {
      this.fallback();
      return;
    }

    try {
      const gl = this.canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
      if(!gl) throw new Error('WebGL unavailable');
      this.gl = gl;

      const vertex = this.compile(gl.VERTEX_SHADER, `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
          v_uv = a_position * .5 + .5;
          gl_Position = vec4(a_position, 0., 1.);
        }
      `);
      const fragment = this.compile(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 v_uv;
        uniform float u_time;
        uniform float u_opening;
        uniform vec2 u_imageScale;
        uniform sampler2D u_artwork;

        float hash(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * .1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3. - 2. * f);
          return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
                     mix(hash(i + vec2(0., 1.)), hash(i + vec2(1.)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float sum = 0.;
          float amplitude = .5;
          mat2 turn = mat2(.8, -.6, .6, .8);
          for(int i = 0; i < 5; i++) {
            sum += amplitude * noise(p);
            p = turn * p * 2.03 + vec2(7.1, 13.7);
            amplitude *= .5;
          }
          return sum;
        }
        float cloud(vec2 p, float t) {
          // Two cross-currents deform the density, instead of moving a flat noise sheet.
          vec2 drift = vec2(t * .11, -t * .037);
          vec2 curl = vec2(fbm(p * .65 + drift),
                           fbm(p * .65 - drift * .7 + vec2(19.2, 4.8)));
          return fbm(p + (curl - .5) * 2.9 + drift);
        }
        void main() {
          vec2 uv = vec2(v_uv.x, 1. - v_uv.y);
          // Use the same centered cover crop as the image, including on portrait screens.
          vec2 scene = (uv - .5) * u_imageScale + .5;
          vec2 p = scene * vec2(1.7768, 1.);
          float distant = cloud(p * 3.7 + vec2(2., 18.), u_time * .6);
          float near = cloud(p * vec2(3.4, 9.4) + vec2(15., 3.), u_time);
          float filaments = fbm(p * vec2(4., 15.) + vec2(u_time * .06, -u_time * .035) + near * 2.1);
          float wisps = smoothstep(.3, .67, near * .78 + filaments * .22);

          // Mist pools in the valley; thinner tendrils climb the sides of the scene.
          float valleyHeight = .74 + (distant - .5) * .3;
          float valleyDistance = (scene.y - valleyHeight) / .235;
          float valley = exp(-valleyDistance * valleyDistance);
          float sides = smoothstep(.18, .48, abs(scene.x - .5));
          float risingDistance = (scene.y - .56) / .22;
          float rising = exp(-risingDistance * risingDistance) * sides;
          float sky = smoothstep(.15, .4, scene.y) * (1. - smoothstep(.5, .7, scene.y));

          vec3 original = texture2D(u_artwork, scene).rgb;
          float luminance = dot(original, vec3(.2126, .7152, .0722));
          float openingArea = 1. - smoothstep(.28, .47, abs(scene.x - .5));
          float silhouettes = smoothstep(mix(.045, .015, u_opening),
                                         mix(.23, .13, u_opening), luminance);
          float warmLights = 1. - smoothstep(.025, .16, original.r - original.b);
          float sceneMask = silhouettes * warmLights;
          // The opening's empty, dark center needs mist even without bright scenery.
          // Keep the cemetery's trees, gate and amber pumpkins untouched.
          sceneMask = mix(sceneMask, max(silhouettes, openingArea * .75) * warmLights, u_opening);
          float density = valley * (.02 + wisps * .74)
                        + rising * smoothstep(.3, .67, distant) * .3
                        + sky * smoothstep(.34, .7, distant) * mix(.08, .22, u_opening);
          float alpha = (1. - exp(-density * 1.65)) * sceneMask;

          // Cold, translucent moonlight, not white smoke or an opaque grey veil.
          float moonlight = smoothstep(.25, 1., scene.x) * .45 + near * .55;
          vec3 tint = mix(vec3(.24, .30, .39), vec3(.48, .56, .67), moonlight);

          // Also advect the photograph's fine cloud detail, so the new mist feels part of it.
          vec2 displacement = vec2(distant - .5, near - .5) * vec2(.014, .011);
          displacement *= mix(1., openingArea * 1.75, u_opening);
          vec3 shifted = texture2D(u_artwork, scene + displacement).rgb;
          float shiftedLight = dot(shifted, vec3(.2126, .7152, .0722));
          float shiftedMask = smoothstep(mix(.045, .015, u_opening),
                                         mix(.23, .13, u_opening), shiftedLight)
                            * (1. - smoothstep(.025, .16, shifted.r - shifted.b));
          float mistArea = clamp(sky * 1.4 + valley * .85 + rising, 0., 1.);
          // Keep the photographic advection above the skyline; castles must not ripple.
          float leftSkyline = .05 + .61 * smoothstep(.1, .32, scene.x);
          float rightSkyline = .65 - .47 * smoothstep(.66, .93, scene.x);
          float skyline = min(leftSkyline, rightSkyline);
          float openSky = 1. - smoothstep(skyline - .04, skyline + .01, scene.y);
          openSky = mix(openSky, openingArea, u_opening);
          float cloudAlpha = .62 * mistArea * openSky * min(sceneMask, shiftedMask);

          // Match .thanks-artwork's saturation/opacity and the existing dark vignette.
          vec3 graded = mix(vec3(.03137, .04314, .07059),
                            mix(vec3(shiftedLight), shifted, .82), mix(.6, .9, u_opening));
          float veil = uv.y < .48 ? mix(.16, .08, uv.y / .48)
                                 : mix(.08, .2, (uv.y - .48) / .52);
          float openingVeil = uv.y < .48 ? mix(.28, .08, uv.y / .48)
                                        : mix(.08, .58, (uv.y - .48) / .52);
          veil = mix(veil, openingVeil, u_opening);
          graded = mix(graded, vec3(.02353, .03137, .05098), veil);
          float combinedAlpha = alpha + cloudAlpha * (1. - alpha);
          vec3 color = (tint * alpha + graded * cloudAlpha * (1. - alpha))
                     / max(combinedAlpha, .0001);
          gl_FragColor = vec4(color, combinedAlpha);
        }
      `);

      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if(!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('Mist shader unavailable');
      gl.useProgram(this.program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.artwork);
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_artwork'), 0);
      gl.uniform1f(gl.getUniformLocation(this.program, 'u_opening'), this.profile==='opening' ? 1 : 0);
      this.timeUniform = gl.getUniformLocation(this.program, 'u_time');
      this.scaleUniform = gl.getUniformLocation(this.program, 'u_imageScale');
      this.ready = true;
      this.resize();
    } catch(e) {
      this.fallback();
    }
  }

  compile(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if(!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      this.gl.deleteShader(shader);
      throw new Error('Mist shader unavailable');
    }
    return shader;
  }

  fallback() {
    this.stop();
    this.gl = null;
    this.ready = true;
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.canvas.classList.add('is-fallback');
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    // Soft smoke needs no retina-sized buffer; cap both fill rate and total pixels.
    const scale = Math.min(.65, 1100 / Math.max(width, height));
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const imageWidth = this.artwork.naturalWidth;
    const imageHeight = this.artwork.naturalHeight;
    const cover = Math.max(width / imageWidth, height / imageHeight);
    this.gl.uniform2f(this.scaleUniform, width / (imageWidth * cover), height / (imageHeight * cover));
  }

  setActive(on) {
    if(this.active === on) return;
    this.active = on;
    this.syncPlayback();
  }

  setPaused(on) {
    if(this.paused === on) return;
    this.paused = on;
    this.canvas.classList.toggle('is-paused', on);
    this.syncPlayback();
  }

  syncPlayback() {
    this.stop();
    const visible = this.active && !document.hidden;
    this.canvas.classList.toggle('is-active', visible);
    if(!visible) return;
    this.prepare();
    if(!this.gl) return;
    this.resize();
    this.draw();
    if(!this.paused && !this.motionQuery.matches) this.frameId = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.lastFrame = 0;
  }

  frame(t) {
    if(!this.active || this.paused || document.hidden || this.motionQuery.matches || !this.gl) {
      this.stop();
      return;
    }
    // Time-based currents stay consistent on 60/120 Hz screens; render at at most 30 fps.
    if(!this.lastFrame || t - this.lastFrame >= 1000 / 30) {
      if(this.lastFrame) this.time += Math.min((t - this.lastFrame) / 1000, .1);
      this.lastFrame = t;
      this.draw();
    }
    this.frameId = requestAnimationFrame(this.tick);
  }

  draw() {
    this.gl.uniform1f(this.timeUniform, this.time);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }
}
SmokeSystem.assetVersion = '20261012-smoke-1';
window.SmokeSystem = SmokeSystem;
})();
