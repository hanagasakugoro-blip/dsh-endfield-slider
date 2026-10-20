import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {playwrightRuntime} from '../scripts/dev-runtime.mjs';
import {servePreview} from '../scripts/preview-server.mjs';

const {version} = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const server = await servePreview(0), {chromium} = await playwrightRuntime();
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page = await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});
const artifacts = new URL('../artifacts/', import.meta.url), results = [], errors = [];
await mkdir(artifacts, {recursive:true});
page.on('pageerror', error => errors.push(error.message));
const panel = page.locator('.dsh-ef-panel'), layer = page.locator('.dsh-ef-panel-closing');
async function check(name, callback) { await callback(); results.push(name); console.log(`PASS ${name}`); }
async function open() {
  await page.locator('.dsh-ef-trigger').evaluate(el => el.click());
  await panel.locator('.dsh-ef-panel-opening').waitFor({state:'attached'});
  await panel.locator('.dsh-ef-panel-opening').waitFor({state:'detached'});
}
async function close(pause = true) {
  await page.getByRole('button', {name:'关闭模型面板'}).evaluate(el => el.click());
  await layer.waitFor({state:'attached'});
  if (pause) await pose(0);
}
async function pose(time) { return layer.evaluate((el, time) => {
  for (const animation of el.getAnimations({subtree:true})) { animation.pause(); animation.currentTime = time; }
  return {opacity:+getComputedStyle(el.firstElementChild).opacity, strips:[...el.querySelectorAll('.dsh-ef-close-image')].map(image => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return {scale:matrix.a, shift:matrix.e, vertical:matrix.d};
  })};
}, time); }
async function finish() {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await layer.waitFor({state:'detached'}); await panel.waitFor({state:'detached'});
}
async function changedRatio(first, second) { return page.evaluate(async ([a, b]) => {
  async function decode(base64) {
    const img = new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();
    const canvas = new OffscreenCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    return ctx.getImageData(0,0,img.width,img.height).data;
  }
  const [x,y] = await Promise.all([decode(a),decode(b)]);if (x.length !== y.length) throw Error('Frame dimensions differ');
  let changed=0;for(let i=0;i<x.length;i+=4)if(Math.max(Math.abs(x[i]-y[i]),Math.abs(x[i+1]-y[i+1]),Math.abs(x[i+2]-y[i+2]))>12)changed++;
  return changed/(x.length/4);
}, [first.toString('base64'), second.toString('base64')]); }

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('.dsh-ef-trigger').waitFor();
  let before, clip, measurements;
  await check('closing starts from the rendered panel, with inert unique snapshots and no repeated child entry animations', async () => {
    await open();clip=await panel.boundingBox();before=await page.screenshot({clip});
    const positions=await panel.evaluate(el=>['.dsh-ef-title','.dsh-ef-range','.dsh-ef-footer'].map(selector=>{const r=el.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    await close();
    const state=await layer.evaluate(el=>({inert:el.inert,hidden:el.getAttribute('aria-hidden'),pointer:getComputedStyle(el).pointerEvents,animations:el.getAnimations({subtree:true}).map(a=>({id:a.id,duration:a.effect.getTiming().duration,easing:a.effect.getTiming().easing})),ids:[...document.querySelectorAll('[id]')].map(n=>n.id),focus:document.activeElement.classList.contains('dsh-ef-trigger')}));
    assert.equal(state.inert,true);assert.equal(state.hidden,'true');assert.equal(state.pointer,'none');assert.equal(state.focus,true);
    assert.equal(state.ids.length,new Set(state.ids).size);assert.equal(await page.getByRole('dialog').count(),0);
    assert.ok(state.animations.length>20&&state.animations.length<55);assert.ok(state.animations.every(a=>a.id.startsWith('dsh-ef-close-')&&a.duration===300));
    assert.ok(state.animations.filter(a=>a.id.includes('stretch')).every(a=>a.easing==='linear'));
    assert.equal(state.animations.find(a=>a.id==='dsh-ef-close-opacity').easing,'ease-in-out');
    const first=await page.screenshot({clip});await writeFile(new URL('panel-closing-before.png',artifacts),before);await writeFile(new URL('panel-closing-start.png',artifacts),first);
    const copiedPositions=await layer.evaluate(el=>['.dsh-ef-title','.dsh-ef-range','.dsh-ef-footer'].map(selector=>{const r=el.querySelector('.dsh-ef-close-image').querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    for(let i=0;i<positions.length;i++)for(const key of ['x','y','width','height'])assert.ok(Math.abs(positions[i][key]-copiedPositions[i][key])<.1);
    // Independent compositing can change LCD text antialiasing at unchanged positions.
    const difference=await changedRatio(before,first);assert.ok(difference<.02,String(difference));measurements={startDifference:difference,unchangedLayout:true};
  });
  await check('pixel rows stretch right at constant speed while opacity eases from one to zero over 300ms', async () => {
    const zero=await pose(0),quarter=await pose(75),middle=await pose(150),late=await pose(225),end=await pose(300);
    for(const [state,expected] of [[zero,1],[quarter,.87084],[middle,.5],[late,.12916],[end,0]])assert.ok(Math.abs(state.opacity-expected)<.003);
    assert.ok(new Set(end.strips.map(s=>s.scale)).size>5);
    for(let i=0;i<zero.strips.length;i++) {
      assert.equal(zero.strips[i].scale,1);assert.equal(zero.strips[i].shift,0);assert.equal(end.strips[i].vertical,1);
      assert.ok(end.strips[i].scale>1&&end.strips[i].shift>0);
      assert.ok(Math.abs((quarter.strips[i].scale-1)*2-(middle.strips[i].scale-1))<.0001);
      assert.ok(Math.abs(quarter.strips[i].shift*2-middle.strips[i].shift)<.001);
    }
    await pose(150);const midpoint=await page.screenshot({clip});assert.ok(await changedRatio(before,midpoint)>.2);await writeFile(new URL('panel-closing-midpoint.png',artifacts),midpoint);
    await pose(300);const last=await page.screenshot({clip});await layer.evaluate(el=>el.style.visibility='hidden');const background=await page.screenshot({clip});await layer.evaluate(el=>el.style.visibility='');assert.equal(await changedRatio(last,background),0);
    measurements={...measurements,duration:300,fade:[zero.opacity,quarter.opacity,middle.opacity,late.opacity,end.opacity],stretchEasing:'linear',fadeEasing:'ease-in-out',rows:end.strips.length,transparentMatchesBackground:true};
    await writeFile(new URL('panel-closing-frames.json',artifacts),JSON.stringify({version,...measurements},null,2));await finish();
  });
  await check('normal completion removes all snapshots and the hidden panel without model writes', async () => {
    await open();await close(false);await layer.waitFor({state:'detached',timeout:2000});await panel.waitFor({state:'detached'});
    assert.equal(await page.locator('.dsh-ef-close-image').count(),0);assert.equal(await page.evaluate(()=>window.__efDemo.calls.length),0);
  });
  await check('reopening during a close cancels its animations and leaves one usable panel', async () => {
    await open();await close();await pose(120);await layer.evaluate(el=>{window.__closingAnimations=el.getAnimations({subtree:true});});
    await page.locator('.dsh-ef-trigger').evaluate(el=>el.click());await layer.waitFor({state:'detached'});
    assert.ok(await page.evaluate(()=>window.__closingAnimations.every(a=>a.playState==='idle')));
    await panel.locator('.dsh-ef-panel-opening').waitFor({state:'attached'});await panel.locator('.dsh-ef-panel-opening').waitFor({state:'detached'});
    assert.equal(await panel.count(),1);assert.equal(await panel.getAttribute('data-closing'),null);await close();await finish();
  });
  await check('closing mid-entry keeps independent SVG references and cleans every opening and closing layer', async () => {
    await page.locator('.dsh-ef-trigger').evaluate(el=>el.click());await panel.locator('.dsh-ef-panel-opening').waitFor({state:'attached'});
    await panel.evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=100;}});
    const entryClip=await panel.boundingBox(),entry=await page.screenshot({clip:entryClip});await close();
    const image=await page.screenshot({clip:entryClip}),difference=await changedRatio(entry,image);assert.ok(difference<.035,String(difference));
    const ids=await page.evaluate(()=>[...document.querySelectorAll('[id]')].map(el=>el.id));assert.equal(ids.length,new Set(ids).size);
    await finish();assert.equal(await page.locator('.dsh-ef-panel-opening,.dsh-ef-close-image').count(),0);
  });
  await check('an outside editor click keeps its focus and takes effect through the decorative closing layer', async () => {
    await open();const editor=page.getByRole('textbox',{name:'消息',exact:true});await editor.click({position:{x:8,y:8}});await layer.waitFor({state:'attached'});await pose(120);
    assert.equal(await editor.evaluate(el=>document.activeElement===el),true);await editor.fill('关闭动效操作检查');assert.equal(await editor.textContent(),'关闭动效操作检查');await finish();
  });
  await check('scroll position is frozen in the closing strips', async () => {
    await open();await page.getByRole('button',{name:/演示提供方 A/}).click();await page.waitForTimeout(350);
    const top=await panel.locator('.dsh-ef-list').evaluate(el=>{el.scrollTop=100;return el.scrollTop;});assert.ok(top>0);
    await close();assert.ok(await layer.locator('.dsh-ef-list').evaluateAll((nodes,top)=>nodes.every(n=>n.scrollTop===top),top));await finish();
  });
  await check('desktop and mobile in both themes clip stretched rows to the viewport', async () => {
    for(const dark of [false,true])for(const width of [375,1440]) {
      await page.setViewportSize({width,height:width===375?812:1000});await page.evaluate(dark=>document.body.toggleAttribute('data-ds-dark-theme',dark),dark);
      await open();await close();await pose(150);
      const geometry=await layer.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,page:document.documentElement.scrollWidth,background:getComputedStyle(el.querySelector('.dsh-ef-close-image')).backgroundColor};});
      assert.equal(geometry.left,0);assert.equal(geometry.right,width);assert.equal(geometry.page,width);assert.equal(geometry.background,dark?'rgb(34, 34, 34)':'rgb(255, 255, 255)');
      await page.screenshot({path:fileURLToPath(new URL(`panel-closing-${dark?'dark':'light'}-${width}.png`,artifacts))});await finish();
    }
  });
  await check('reduced motion, blur, resize and unmount cancel active closing snapshots', async () => {
    await page.setViewportSize({width:1440,height:1000});
    for(const reason of ['reduce','blur','resize']) {
      await open();await close();await layer.evaluate(el=>{window.__closingAnimations=el.getAnimations({subtree:true});});
      if(reason==='reduce')await page.emulateMedia({reducedMotion:'reduce'});
      else await page.evaluate(reason=>window.dispatchEvent(new Event(reason)),reason);
      await layer.waitFor({state:'detached'});await panel.waitFor({state:'detached'});assert.ok(await page.evaluate(()=>window.__closingAnimations.every(a=>a.playState==='idle')));
      if(reason==='reduce') {
        await page.locator('.dsh-ef-trigger').evaluate(el=>el.click());await panel.waitFor();await page.getByRole('button',{name:'关闭模型面板'}).evaluate(el=>el.click());await panel.waitFor({state:'detached'});assert.equal(await layer.count(),0);await page.emulateMedia({reducedMotion:'no-preference'});
      }
    }
    await open();await close();await layer.evaluate(el=>{window.__closingAnimations=el.getAnimations({subtree:true});window.__efDemo.unmount();});assert.equal(await layer.count(),0);assert.equal(await panel.count(),0);assert.ok(await page.evaluate(()=>window.__closingAnimations.every(a=>a.playState==='idle')));
  });
  assert.deepEqual(errors,[]);await writeFile(new URL('panel-closing-results.json',artifacts),JSON.stringify({version,passed:results,browserErrors:errors},null,2));console.log(`${results.length} panel closing scenarios passed.`);
} catch(error) {
  await page.screenshot({path:fileURLToPath(new URL('panel-closing-failure.png',artifacts))}).catch(()=>{});console.error(error.stack);process.exitCode=1;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
