import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {playwrightRuntime} from '../scripts/dev-runtime.mjs';
import {servePreview} from '../scripts/preview-server.mjs';

const {chromium} = await playwrightRuntime();
const server = await servePreview(0);
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, {recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
const page = await context.newPage();
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
const trigger = page.locator('.dsh-ef-trigger');
const send = page.locator('[data-ef-send]');
const xOf = value => value === 'none' ? 0 : Number(value.match(/matrix\(([^)]+)\)/)?.[1].split(',')[4]);
async function check(name, callback) { await callback();results.push(name);console.log(`PASS ${name}`); }
async function settled() { await page.waitForFunction(() => window.__efDemo.state().status !== 'selecting' && document.querySelector('.dsh-ef-panel')?.getAttribute('aria-busy') === 'false'); }
async function entrySettled() {
  await page.locator('.dsh-ef-panel-opening').waitFor({state:'attached'});
  await page.locator('.dsh-ef-panel-opening').waitFor({state:'detached'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function geometry(targetPage = page) {
  return targetPage.getByRole('slider').evaluate(el => {
    const track = el.getBoundingClientRect();
    return {
      cursor: (el.querySelector('.dsh-ef-cursor').getBoundingClientRect().left - track.left) / track.width,
      fill: el.querySelector('.dsh-ef-fill').getBoundingClientRect().width / el.querySelector('.dsh-ef-track').getBoundingClientRect().width,
      duration: getComputedStyle(el.querySelector('.dsh-ef-cursor')).transitionDuration
    };
  });
}
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await trigger.waitFor();
  await check('yellow hover wipe passes through a real intermediate position', async () => {
    await page.mouse.move(30,30);await page.waitForTimeout(320);
    const before = await trigger.evaluate(el => getComputedStyle(el,'::before').transform);
    const box = await trigger.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.waitForTimeout(110);
    const during = await trigger.evaluate(el => getComputedStyle(el,'::before').transform);
    assert.ok(xOf(before) < -100);assert.ok(xOf(during) > xOf(before)+5 && xOf(during) < -3, `${before} -> ${during}`);
    await page.screenshot({path:fileURLToPath(new URL('motion-hover-midpoint.png',artifacts))});
    await page.waitForTimeout(240);
    const after = await trigger.evaluate(el => getComputedStyle(el,'::before').transform);
    assert.ok(Math.abs(xOf(after)) < 1);
  });
  await check('held press compresses and release visibly returns to rest', async () => {
    const box = await send.boundingBox();await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.waitForTimeout(120);
    const down = await send.evaluate(el => ({scale:getComputedStyle(el).scale,held:el.hasAttribute('data-ef-pressed')}));
    assert.equal(down.held,true);assert.ok(parseFloat(down.scale)<.97);
    await page.mouse.up();await page.waitForTimeout(45);
    assert.ok(await send.evaluate(el => el.hasAttribute('data-ef-releasing')));
    await page.waitForTimeout(280);
    assert.ok(await send.evaluate(el => !el.hasAttribute('data-ef-pressed')&&!el.hasAttribute('data-ef-releasing')));
    assert.equal(await page.evaluate(() => window.__efDemo.sent),1);
  });
  await check('panel, child layers and provider rows animate independently; exit finishes before removal', async () => {
    await trigger.click();await page.locator('.dsh-ef-panel').waitFor();
    const layers = await page.locator('.dsh-ef-panel').evaluate(el => el.getAnimations({subtree:true}).map(animation => animation.animationName).filter(Boolean));
    assert.ok(layers.includes('dsh-ef-enter'));assert.ok(layers.includes('dsh-ef-block'));assert.ok(layers.includes('dsh-ef-row'));
    await entrySettled();
    await page.getByRole('button',{name:'关闭模型面板'}).click();
    await page.locator('.dsh-ef-panel[data-closing]').waitFor({state:'attached'});
    assert.equal(await page.locator('.dsh-ef-panel').count(),1);
    await page.locator('.dsh-ef-panel').waitFor({state:'detached'});assert.equal(await page.locator('.dsh-ef-panel').count(),0);
  });
  await check('drag follows fractional positions without tween lag; release snaps once and retains its target while pending', async () => {
    await trigger.click();await entrySettled();
    await page.evaluate(() => window.__efDemo.delay(600));
    const slider = page.getByRole('slider');const box = await slider.boundingBox();
    await page.mouse.move(box.x+box.width*2/3,box.y+23);await page.mouse.down();
    for(const ratio of [.23,.28,.45]) {
      await page.mouse.move(box.x+box.width*ratio,box.y+23);
      const drawn = await geometry();
      assert.ok(Math.abs(drawn.cursor-ratio)<.005,JSON.stringify({ratio,...drawn,before:box,after:await slider.boundingBox()}));
      assert.ok(Math.abs(drawn.fill-ratio)<.005,JSON.stringify({ratio,...drawn}));
      assert.equal(drawn.duration,'0s');
      assert.equal(await slider.getAttribute('aria-valuetext'),'标准');
    }
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length),0);
    assert.equal(await page.locator('.dsh-ef-selection-flash').count(),0);
    await page.screenshot({path:fileURLToPath(new URL('slider-between-levels.png',artifacts))});
    await page.mouse.up();await page.waitForTimeout(35);
    const snapped = await geometry();
    assert.ok(snapped.cursor>1/3+.001 && snapped.cursor<.45,JSON.stringify(snapped));
    assert.equal(await slider.getAttribute('data-dragging'),null);
    assert.equal(await page.evaluate(() => window.__efDemo.state().current.reasoningEffort),'high');
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length),1);
    assert.equal(await page.locator('.dsh-ef-selection-flash').count(),0);
    await page.waitForFunction(() => window.__efDemo.state().current.reasoningEffort==='medium');
  });
  await check('accepted selection gives one local white/black pulse and a saved status', async () => {
    const flash = page.locator('.dsh-ef-label[aria-pressed=true] .dsh-ef-selection-flash');
    await flash.waitFor({state:'attached'});
    const phases = await flash.evaluate(el => {
      const animation = el.getAnimations().find(item => item.animationName==='dsh-ef-select-confirm');
      if (!animation) throw Error('Confirmation animation missing');
      animation.pause();
      const duration=animation.effect.getTiming().duration;
      animation.currentTime=duration*.1;const white=getComputedStyle(el).backgroundColor;
      animation.currentTime=duration*.45;const black=getComputedStyle(el).backgroundColor;
      animation.currentTime=duration*.9;const end=getComputedStyle(el).opacity;
      animation.finish();return {white,black,end};
    });
    assert.deepEqual(phases,{white:'rgb(255, 255, 255)',black:'rgb(22, 22, 22)',end:'0'});
    await page.getByText('已保存 / 用于下一次请求',{exact:true}).waitFor();
    assert.ok(await page.locator('.dsh-ef-confirm-flash').evaluate(el => el.getAnimations().some(animation => animation.animationName==='dsh-ef-confirm')));
    assert.equal(await page.locator('.dsh-ef-panel > .dsh-ef-selection-flash').count(),0);
    await page.evaluate(()=>window.__efDemo.external({provider:'demo-a',model:'same-name',reasoningEffort:'low'}));
    await page.waitForFunction(()=>document.querySelector('[role=slider]')?.getAttribute('aria-valuetext')==='低');
    await page.evaluate(()=>window.__efDemo.external({provider:'demo-a',model:'same-name',reasoningEffort:'medium'}));
    await page.waitForFunction(()=>document.querySelector('[role=slider]')?.getAttribute('aria-valuetext')==='标准');
    assert.equal(await page.locator('.dsh-ef-selection-flash,.dsh-ef-confirm-flash').count(),0);
  });
  await check('clicking a level traverses intermediate positions while its host write is pending', async () => {
    await page.waitForTimeout(300);
    assert.ok(Math.abs((await geometry()).cursor-1/3)<.005);
    await page.getByRole('button',{name:'推理等级：最高',exact:true}).click();await page.waitForTimeout(40);
    const moving = await geometry();
    assert.ok(moving.cursor>1/3+.01 && moving.cursor<.995,JSON.stringify(moving));
    assert.ok(Math.abs(moving.cursor-moving.fill)<.01,JSON.stringify(moving));
    assert.equal(await page.evaluate(() => window.__efDemo.state().current.reasoningEffort),'medium');
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length),2);
    assert.equal(await page.locator('.dsh-ef-selection-flash').count(),0);
    await page.waitForFunction(() => window.__efDemo.state().current.reasoningEffort==='max');
    assert.ok((await geometry()).cursor>.995);
  });
  await check('tapping the track also glides instead of teleporting and waits for release before saving', async () => {
    const box=await page.getByRole('slider').boundingBox();
    const before=await page.evaluate(()=>window.__efDemo.calls.length);
    await page.mouse.move(box.x+1,box.y+23);await page.mouse.down();await page.waitForTimeout(40);
    const moving=await geometry();
    assert.ok(moving.cursor>.005 && moving.cursor<.99,JSON.stringify(moving));
    assert.equal(await page.evaluate(()=>window.__efDemo.calls.length),before);
    await page.mouse.up();await settled();await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.__efDemo.calls.length),before+1);
    assert.equal(await page.evaluate(()=>window.__efDemo.state().current.reasoningEffort),'low');
    assert.ok((await geometry()).cursor<.005);
  });
  await check('two-level slider stays between A and B, then chooses the nearest endpoint without duplicate writes', async () => {
    await page.getByRole('button',{name:/演示提供方 A/}).click();
    await page.locator('.dsh-ef-list').getByRole('button',{name:/示例 · 双档模型/}).click();await settled();
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__efDemo.delay(300));
    const before=await page.evaluate(() => window.__efDemo.calls.length);
    const box=await page.getByRole('slider').boundingBox();
    await page.mouse.move(box.x+1,box.y+23);await page.mouse.down();
    for(const ratio of [.26,.49]) {
      await page.mouse.move(box.x+box.width*ratio,box.y+23);
      assert.ok(Math.abs((await geometry()).cursor-ratio)<.005);
      assert.equal(await page.getByRole('slider').getAttribute('aria-valuetext'),'关闭');
    }
    await page.mouse.up();await page.waitForTimeout(320);
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length),before);
    assert.ok((await geometry()).cursor<.005);
    assert.equal(await page.locator('.dsh-ef-selection-flash').count(),0);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.51,box.y+23);
    assert.ok(Math.abs((await geometry()).cursor-.51)<.005);
    assert.equal(await page.getByRole('slider').getAttribute('aria-valuetext'),'开启');
    await page.mouse.up();await settled();
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length),before+1);
    assert.equal(await page.evaluate(() => window.__efDemo.state().current.reasoningEffort),'on');
    await page.waitForTimeout(320);assert.ok((await geometry()).cursor>.995);
  });
  await check('rejected selection returns to the host endpoint and never plays a success flash', async () => {
    await page.evaluate(() => window.__efDemo.rejectNext());
    await page.getByRole('button',{name:'推理等级：关闭',exact:true}).click();
    assert.equal(await page.locator('.dsh-ef-selection-flash').count(),0);
    await settled();await page.getByRole('alert').waitFor();await page.waitForTimeout(320);
    assert.equal(await page.evaluate(() => window.__efDemo.state().current.reasoningEffort),'on');
    assert.equal(await page.locator('.dsh-ef-selection-flash,.dsh-ef-confirm-flash').count(),0);
    assert.ok((await geometry()).cursor>.995);
    await page.evaluate(() => window.__efDemo.delay(60));
  });
  await check('touch drag also follows the finger continuously and saves only after touchend', async () => {
    const touchContext=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true,locale:'zh-CN'});
    try {
      const touchPage=await touchContext.newPage();touchPage.on('pageerror',error=>errors.push(error.message));
      await touchPage.goto(`http://127.0.0.1:${server.address().port}/`);
      await touchPage.locator('.dsh-ef-trigger').click();await touchPage.waitForTimeout(450);
      const box=await touchPage.getByRole('slider').boundingBox();
      const cdp=await touchContext.newCDPSession(touchPage);
      const point=ratio=>[{x:box.x+box.width*ratio,y:box.y+23}];
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(2/3)});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(.44)});
      assert.ok(Math.abs((await geometry(touchPage)).cursor-.44)<.01);
      assert.equal(await touchPage.evaluate(()=>window.__efDemo.calls.length),0);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await touchPage.waitForFunction(()=>window.__efDemo.state().current.reasoningEffort==='medium');
      assert.equal(await touchPage.evaluate(()=>window.__efDemo.calls.length),1);
    } finally { await touchContext.close(); }
  });
  await check('both themes remain readable with hover fill and local panel does not scroll horizontally', async () => {
    for(const dark of [false,true]) {
      await page.evaluate(value => document.body.toggleAttribute('data-ds-dark-theme',value),dark);
      await page.setViewportSize({width:375,height:812});await page.waitForTimeout(400);
      const geometry = await page.locator('.dsh-ef-panel').evaluate(el => ({width:el.clientWidth,scroll:el.scrollWidth,background:getComputedStyle(el).backgroundColor}));
      assert.ok(geometry.scroll<=geometry.width+1,JSON.stringify(geometry));
      await page.screenshot({path:fileURLToPath(new URL(`motion-${dark?'dark':'light'}-375.png`,artifacts))});
    }
  });
  await check('reduced motion cancels an active press and disables pseudo-element transitions', async () => {
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:'关闭模型面板'}).click();await page.locator('.dsh-ef-panel').waitFor({state:'detached'});
    const box = await send.boundingBox();await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();await page.waitForTimeout(110);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(60);
    assert.equal(await send.evaluate(el => el.getAnimations().length),0);
    assert.equal(await send.evaluate(el => el.hasAttribute('data-ef-pressed')),false);
    await page.mouse.up();
    assert.equal(await trigger.evaluate(el => getComputedStyle(el,'::before').transitionDuration),'0s');
    await trigger.click();
    assert.equal(await page.locator('.dsh-ef-panel').evaluate(el => getComputedStyle(el).animationName),'none');
    await page.getByRole('button',{name:'推理等级：关闭',exact:true}).click();await settled();
    const flash=page.locator('.dsh-ef-label[aria-pressed=true] .dsh-ef-selection-flash');
    await flash.waitFor({state:'attached'});
    assert.equal(await flash.evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal((await geometry()).duration,'0s');
    assert.ok((await geometry()).cursor<.005);
    await page.getByText('已保存 / 用于下一次请求',{exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭模型面板'}).click();
    await page.waitForTimeout(30);assert.equal(await page.locator('.dsh-ef-panel').count(),0);
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('unmount cancels in-progress button animations and removes motion markers', async () => {
    const box = await send.boundingBox();await page.mouse.move(box.x+22,box.y+22);await page.mouse.down();
    await page.waitForTimeout(30);
    const remaining = await page.evaluate(() => {
      const button = document.querySelector('[data-ef-send]');window.__efDemo.unmount();
      return {animations:button.getAnimations().length,pressed:button.hasAttribute('data-ef-pressed'),releasing:button.hasAttribute('data-ef-releasing')};
    });
    assert.deepEqual(remaining,{animations:0,pressed:false,releasing:false});await page.mouse.up();
  });
  assert.deepEqual(errors,[]);
  await writeFile(new URL('motion-results.json',artifacts),JSON.stringify({passed:results,pageErrors:errors},null,2));
  console.log(`${results.length} motion scenarios passed.`);
} catch(error) {
  await page.screenshot({path:fileURLToPath(new URL('motion-failure.png',artifacts)),fullPage:true}).catch(()=>{});
  console.error(error.stack);process.exitCode=1;
} finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
