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
      response.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
      fs.createReadStream(file).pipe(response);
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
});
