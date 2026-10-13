const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
// Keep the existing dependency-free unit suite usable without a browser install.
let chromium;
try { ({chromium} = require('playwright')); } catch(error) {
  if(error.code !== 'MODULE_NOT_FOUND') throw error;
}

const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.svg':'image/svg+xml', '.webp':'image/webp', '.vtt':'text/vtt', '.mp4':'video/mp4'};

test('presentation fits projector viewports and stays aligned after resizing', {
  timeout:120000,
  skip:!chromium && 'Install Playwright and Chromium (or Chrome) to run the layout audit',
}, async t=>{
  const server = http.createServer((request,response)=>{
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if(!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.stat(file, (error,stat)=>{
      if(error || !stat.isFile()) { response.writeHead(404).end(); return; }
      const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range ? Number(range[1]) : 0;
      const end=range?.[2] ? Math.min(Number(range[2]),stat.size-1) : stat.size-1;
      if(start>end) { response.writeHead(416, {'Content-Range':`bytes */${stat.size}`}).end(); return; }
      response.writeHead(range ? 206 : 200, {
        'Content-Type':types[path.extname(file)] || 'application/octet-stream',
        'Content-Length':end-start+1,
        'Accept-Ranges':'bytes',
        ...(range ? {'Content-Range':`bytes ${start}-${end}/${stat.size}`} : {}),
      });
      const stream=fs.createReadStream(file,{start,end});
      response.on('close',()=>stream.destroy());
      stream.pipe(response);
    });
  });
  await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser = await chromium.launch({
    ...(fs.existsSync(chromium.executablePath()) ? {executablePath:chromium.executablePath()} : {channel:'chrome'}),
    args:['--no-sandbox'],
  });
  t.after(()=>browser.close());
  const page = await browser.newPage({viewport:{width:1280,height:720}, reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}/#biography`);
  await page.evaluate(()=>document.fonts.ready);
  const ids = await page.locator('.slide').evaluateAll(slides=>slides.map(slide=>slide.id));

  for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[1024,768],[1280,800],[1280,600],[1366,650]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    for(const id of ids) {
      await page.locator(`.dot[data-target="${id}"]`).click();
      await page.waitForFunction(id=>document.querySelector('.dot.active').dataset.target===id, id);
      // Measure the final reveal state, including the delayed closing title.
      const result = await page.evaluate(id=>{
        const slide = document.getElementById(id);
        slide.querySelectorAll('.reveal').forEach(element=>element.classList.add('no-anim'));
        slide.querySelector('.thanks-title')?.classList.add('is-visible');
        const bounds = slide.getBoundingClientRect();
        const nav = document.querySelector('.dots').getBoundingClientRect();
        const spills = [...slide.querySelectorAll('.slide-inner, .slide-inner *, .thanks-credits, .thanks-credits *')]
          .filter(element=>!element.closest('.sr-only, svg'))
          .filter(element=>{
            const rect = element.getBoundingClientRect();
            const clipped = getComputedStyle(element).overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1;
            return rect.width && rect.height && (rect.left < 16 || rect.right > nav.left - 8 || rect.top < 64 || rect.bottom > innerHeight - 16 || clipped);
          })
          .map(element=>element.className || element.tagName);
        return {height:bounds.height, top:bounds.top, spills, horizontal:document.documentElement.scrollWidth > innerWidth};
      }, id);
      assert.ok(Math.abs(result.height-height)<=1, `${width}×${height} ${id}: slide height ${result.height}`);
      assert.ok(Math.abs(result.top)<=1, `${width}×${height} ${id}: misaligned ${result.top}`);
      assert.deepEqual(result.spills, [], `${width}×${height} ${id}: clipped or unsafe content`);
      assert.equal(result.horizontal, false, `${width}×${height} ${id}: horizontal overflow`);
    }
  }

  // F11 / resolution changes must preserve a late slide, not land between two.
  await page.locator('.dot[data-target="conclusion"]').click();
  for(const [width,height] of [[1280,600],[1280,720],[1920,1080],[1024,768]]) {
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>Math.abs(document.getElementById('conclusion').getBoundingClientRect().top)<=1, null, {timeout:3000}).catch(async error=>{
      const state = await page.evaluate(()=>({active:document.querySelector('.dot.active').dataset.target, scrollY, top:document.getElementById('conclusion').getBoundingClientRect().top}));
      assert.fail(`${width}×${height} resize: ${JSON.stringify(state)} (${error.message})`);
    });
    assert.equal(await page.locator('.dot.active').getAttribute('data-target'), 'conclusion');
  }

  // Exercise the browser's actual Fullscreen API as well as viewport changes.
  await page.evaluate(()=>document.getElementById('audio-btn').addEventListener('click', ()=>document.documentElement.requestFullscreen(), {once:true}));
  await page.locator('#audio-btn').click();
  await page.waitForFunction(()=>Boolean(document.fullscreenElement));
  await page.waitForFunction(()=>Math.abs(document.getElementById('conclusion').getBoundingClientRect().top)<=1);
  await page.evaluate(()=>document.exitFullscreen());

  // The opening's film and separately timed credits must also stay inside.
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[1280,720],[1366,768],[1920,1080],[1024,768],[1280,600]]) {
    await page.setViewportSize({width,height});
    const spills = await page.locator('.opening-film-surface, .opening-title, .opening-credit, .opening-start, .opening-skip').evaluateAll(elements=>elements.filter(element=>{
      const rect = element.getBoundingClientRect();
      return rect.width && rect.height && (rect.left < 16 || rect.right > innerWidth-16 || rect.top < 16 || rect.bottom > innerHeight-16);
    }).map(element=>element.className));
    assert.deepEqual(spills, [], `${width}×${height} opening: unsafe content`);
  }

  // Verify the actual trimmed media reaches the permanent ending, without a loop.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`http://127.0.0.1:${server.address().port}/?closing-check=1#thanks`);
  await page.waitForFunction(()=>{
    const video=document.getElementById('thanks-video');
    return Number.isFinite(video.duration) && video.readyState>=2 && !video.paused;
  });
  const duration=await page.locator('#thanks-video').evaluate(video=>{
    video.currentTime=video.duration-.2;
    return video.duration;
  });
  assert.ok(Math.abs(duration-66.04)<.04, `Unexpected trimmed duration: ${duration}`);
  await page.waitForFunction(()=>{
    const title=document.querySelector('.thanks-title');
    const memory=document.querySelector('.thanks-memory');
    return document.getElementById('thanks-video').paused
      && memory.classList.contains('is-finished') && getComputedStyle(memory).opacity==='0'
      && title.classList.contains('is-visible') && getComputedStyle(title).opacity==='1';
  }, null, {timeout:10000}).catch(async error=>{
    const state=await page.evaluate(()=>{
      const video=document.getElementById('thanks-video');
      const title=document.querySelector('.thanks-title');
      const memory=document.querySelector('.thanks-memory');
      return {currentTime:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended,body:document.body.className,title:title.className,titleOpacity:getComputedStyle(title).opacity,memory:memory.className,memoryOpacity:getComputedStyle(memory).opacity};
    });
    assert.fail(`Closing did not settle: ${JSON.stringify(state)} (${error.message})`);
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  assert.equal(await page.locator('#thanks-video').evaluate(video=>video.loop),false);
  assert.equal(await page.locator('.thanks-title').getAttribute('aria-hidden'),null);

  // Check the rendered eyelids at each blink, before the stitched grin is drawn.
  await page.goto(`http://127.0.0.1:${server.address().port}/?eye-check=1#style`);
  await page.waitForFunction(()=>gsap.getTweensOf(document.querySelector('.eye-lid')).length>0);
  const expression=await page.evaluate(()=>{
    const lids=[...document.querySelectorAll('.eye-lid')];
    const smile=document.querySelector('.spectral-smile');
    const timeline=gsap.getTweensOf(lids[0])[0].parent;
    timeline.pause();
    const blinks=[1.67,3.85,6.03].map(time=>{
      timeline.time(time);
      return {closed:lids.every(lid=>lid.getAttribute('d')===lid.dataset.closed),smileHidden:getComputedStyle(smile).visibility==='hidden'};
    });
    timeline.time(6.6);
    const openBeforeSmile=lids.every(lid=>lid.getAttribute('d')===document.querySelectorAll('.eye-socket')[lids.indexOf(lid)].getAttribute('d'))
      && getComputedStyle(smile).visibility==='hidden';
    timeline.time(8.5);
    return {blinks,openBeforeSmile,smileVisible:getComputedStyle(smile).visibility!=='hidden'};
  });
  assert.deepEqual(expression.blinks,Array.from({length:3},()=>({closed:true,smileHidden:true})));
  assert.equal(expression.openBeforeSmile,true);
  assert.equal(expression.smileVisible,true);
});
