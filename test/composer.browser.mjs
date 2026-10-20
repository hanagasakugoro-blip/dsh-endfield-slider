import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {playwrightRuntime} from '../scripts/dev-runtime.mjs';
import {servePreview} from '../scripts/preview-server.mjs';

const {chromium} = await playwrightRuntime();
const server = await servePreview(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, {recursive:true});
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
const page = await context.newPage();
const errors = [], results = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
async function instrument(target) {
  await target.addInitScript(() => {
    window.__efAnimations = [];
    window.__efHoldComposer = false;
    const original = Element.prototype.animate;
    Element.prototype.animate = function(...args) {
      const animation = original.apply(this,args);
      window.__efAnimations.push(animation);
      if (window.__efHoldComposer && this.matches('.dsh-ef-corner-pulse,.dsh-ef-composer-edge-pulse,.dsh-ef-toolbar-pulse,.dsh-ef-composer-send-signal') || window.__efHoldPanel && this.matches('.dsh-ef-panel')) animation.pause();
      return animation;
    };
  });
}
const input = page.locator('[data-composer-input]');
const card = page.locator('[data-ef-composer]');
const send = page.locator('[data-ef-send]');
async function check(name, fn) { await fn();results.push(name);console.log(`PASS ${name}`); }
async function reset(target=page) {
  await target.evaluate(() => {
    for (const a of window.__efAnimations) if (a.id.startsWith('dsh-ef-composer-')) a.cancel();
    window.__efAnimations = [];
    window.__efHoldComposer = true;
  });
}
async function count(target=page) { return target.evaluate(() => window.__efAnimations.filter(a=>a.id.startsWith('dsh-ef-composer-')).length); }
async function sent() { return page.evaluate(()=>window.__efDemo.sent); }
async function snap(name) { await card.screenshot({path:fileURLToPath(new URL(`composer-${name}.png`,artifacts))}); }
const xy = value => { const parts=value==='none'?[]:value.split(' ').map(parseFloat);return [parts[0]??0,parts[1]??0]; };
async function corner() { return page.locator('.dsh-ef-composer-corner--tl').evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41); }
try {
  await instrument(page);await page.goto(url);await send.waitFor();
  await check('four stronger corners and two hatches stay outside editable content; toolbar measurement is unchanged',async()=>{
    assert.equal(await page.locator('[data-ef-composer-chrome]').count(),1);
    assert.equal(await page.locator('.dsh-ef-composer-corner').count(),4);
    assert.equal(await page.locator('.dsh-ef-composer-hatch').count(),2);
    assert.equal(await input.locator('[data-ef-composer-chrome],[data-ef-toolbar-chrome]').count(),0);
    const state = await card.evaluate(el=>({
      pointer:[...el.querySelectorAll('[data-ef-composer-chrome],[data-ef-toolbar-chrome]')].every(node=>getComputedStyle(node).pointerEvents==='none'&&node.getAttribute('aria-hidden')==='true'),
      groups:[...el.querySelector('[data-ef-toolbar]').children].filter(node=>node.getBoundingClientRect().width>0).length,
      background:getComputedStyle(el.querySelector('[data-composer-input]')).backgroundColor,
      clipsMenu:getComputedStyle(el).clipPath!=='none',
      identity:el.querySelector('.dsh-ef-composer-identity').textContent,
      notch:!!el.querySelector('.dsh-ef-composer-notch'),
      slot:!!el.querySelector('.dsh-ef-composer-slot'),
      spineWidth:el.querySelector('.dsh-ef-pass-spine').getBoundingClientRect().width,
      spineLeft:el.querySelector('.dsh-ef-pass-spine').getBoundingClientRect().left-el.getBoundingClientRect().left,
      spineRotation:new DOMMatrixReadOnly(getComputedStyle(el.querySelector('.dsh-ef-pass-spine')).transform).a
    }));
    assert.deepEqual(state,{pointer:true,groups:2,background:'rgba(0, 0, 0, 0)',clipsMenu:false,identity:'DSH',notch:true,slot:true,spineWidth:10,spineLeft:1,spineRotation:-1});
    await page.mouse.move(10,10);await page.waitForTimeout(220);await snap('idle-light');
  });
  await check('hover expands the corners through an intermediate pose; focus locks inward and reveals the yellow strip',async()=>{
    const box=await card.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+24);await page.waitForTimeout(70);
    const moving=await corner();assert.ok(moving<-.05&&moving>-3.99,`hover midpoint ${moving}`);
    await page.waitForTimeout(180);assert.equal(await corner(),-4);await snap('hover-light');
    await input.focus();await page.waitForTimeout(70);
    const locking=await corner();assert.ok(locking>-3.95&&locking<1.99,`focus midpoint ${locking}`);
    await page.waitForTimeout(180);assert.equal(await corner(),2);
    assert.equal(await page.locator('.dsh-ef-composer-focus-signal').evaluate(el=>getComputedStyle(el).opacity),'1');
    await snap('focus-light');
  });
  await check('typing does not flash; one send click immediately flashes only frame details and hops the yellow strip for 165ms',async()=>{
    await reset();await input.fill('发送确认测试');assert.equal(await count(),0);
    const before=await sent();await send.click();assert.equal(await sent(),before+1);assert.equal(await count(),8);
    assert.equal(await input.textContent(),'');
    const phases=await page.evaluate(()=>{
      const flash=window.__efAnimations.find(a=>a.id==='dsh-ef-composer-flash');
      const signal=window.__efAnimations.find(a=>a.id==='dsh-ef-composer-signal');
      const duration=flash.effect.getTiming().duration;
      const pose=fraction=>{flash.currentTime=duration*fraction;const s=getComputedStyle(flash.effect.target);return {color:s.color,opacity:s.opacity};};
      const hops=[.1,.2,.4,.65,.9].map(fraction=>{signal.currentTime=duration*fraction;return getComputedStyle(signal.effect.target).translate;});
      return {duration,white:pose(.1),black:pose(.45),blackTail:pose(.68),gone:pose(.8),hops,targets:window.__efAnimations.filter(a=>a.id.startsWith('dsh-ef-composer-')).map(a=>a.effect.target.className)};
    });
    assert.equal(phases.duration,165);assert.equal(phases.white.color,'rgb(255, 255, 255)');assert.equal(phases.black.color,'rgb(22, 22, 22)');assert.equal(phases.gone.opacity,'0');
    assert.equal(phases.blackTail.opacity,'1');
    assert.deepEqual(phases.hops.map(xy),[[0,0],[6,-2],[-4,2],[4,-2],[-2,0]]);
    assert.ok(phases.targets.every(name=>/corner-pulse|edge-pulse|toolbar-pulse|send-signal/.test(name)));
    await writeFile(new URL('composer-send-frames.json',artifacts),JSON.stringify(phases,null,2));
    await page.evaluate(()=>{for(const a of window.__efAnimations) if(a.id.startsWith('dsh-ef-composer-'))a.currentTime=75;});await snap('send-black');
    await page.evaluate(()=>{for(const a of window.__efAnimations) if(a.id.startsWith('dsh-ef-composer-'))a.currentTime=18;});await snap('send-white');
  });
  await check('Enter, Ctrl+Enter and Cmd+Enter each preserve one host send and one immediate feedback; repeated sends restart cleanly',async()=>{
    for(const keys of ['Enter','Control+Enter','Meta+Enter']) {
      await reset();await input.fill(`快捷键 ${keys}`);const before=await sent();await page.keyboard.press(keys);
      await page.waitForFunction(()=>window.__efAnimations.filter(a=>a.id.startsWith('dsh-ef-composer-')).length===8);
      assert.equal(await sent(),before+1);assert.equal(await input.textContent(),'');
    }
    const first=await page.evaluate(()=>{window.__efPreviousAnimations=window.__efAnimations.filter(a=>a.id.startsWith('dsh-ef-composer-'));return window.__efPreviousAnimations.length;});
    await input.fill('再次发送');await send.click();assert.equal(await count(),first+8);
    assert.ok(await page.evaluate(()=>window.__efPreviousAnimations.every(a=>a.playState==='idle')));
  });
  await check('newline, popup Enter, empty Enter, IME confirmation and key repeats do not produce a send flash',async()=>{
    await reset();await input.fill('第一行');const before=await sent();await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(140);assert.equal(await count(),0);assert.equal(await sent(),before);
    await input.fill('候选项');await page.evaluate(()=>{window.__efDemo.consumeNextEnter=true;});await page.keyboard.press('Enter');
    await page.waitForTimeout(140);assert.equal(await count(),0);assert.equal(await sent(),before);assert.equal(await input.textContent(),'候选项');
    await page.evaluate(()=>{
      const menu=document.createElement('div');menu.setAttribute('data-trigger-menu','');
      const list=document.createElement('div');list.setAttribute('role','listbox');list.setAttribute('aria-activedescendant','test-choice');list.textContent='候选项';menu.append(list);
      document.querySelector('[data-ef-composer]').append(menu);window.__efDemo.consumeNextEnter=true;window.__efDemo.clearOnConsume=true;
    });
    await page.keyboard.press('Enter');await page.waitForTimeout(140);assert.equal(await count(),0);assert.equal(await sent(),before);
    await page.evaluate(()=>document.querySelector('[data-trigger-menu]').remove());
    await input.fill('');await page.keyboard.press('Enter');await page.waitForTimeout(140);assert.equal(await count(),0);
    await input.fill('中文输入');
    await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true});
    await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',repeat:true,bubbles:true,cancelable:true});
    await input.dispatchEvent('compositionstart');
    await input.dispatchEvent('compositionend');
    await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true});
    await page.waitForTimeout(140);assert.equal(await count(),0);assert.equal(await sent(),before);
  });
  await check('disabled and stop buttons keep host behavior without a send confirmation',async()=>{
    await reset();await page.evaluate(()=>window.__efDemo.setSendDisabled(true));await page.waitForFunction(()=>document.querySelector('[data-ef-send]').disabled);
    await input.fill('暂不可发送');await page.keyboard.press('Enter');await send.evaluate(el=>el.click());assert.equal(await count(),0);
    await page.evaluate(()=>{window.__efDemo.setSendDisabled(false);window.__efDemo.setSendMode('stop');});
    await page.getByRole('button',{name:'停止',exact:true}).click();assert.equal(await count(),0);assert.equal(await page.evaluate(()=>window.__efDemo.stopped),1);
    await page.evaluate(()=>window.__efDemo.setSendMode('send'));await page.getByRole('button',{name:'发送',exact:true}).waitFor();
  });
  await check('touch sends once and receives the same frame-only feedback',async()=>{
    const touch=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true,locale:'zh-CN'});
    try {
      const target=await touch.newPage();target.on('pageerror',error=>errors.push(error.message));await instrument(target);await target.goto(url);
      await target.locator('[data-ef-send]').waitFor();await reset(target);await target.locator('[data-ef-send]').tap();
      assert.equal(await count(target),8);assert.equal(await target.evaluate(()=>window.__efDemo.sent),1);
    } finally {await touch.close();}
  });
  await check('details fit desktop and mobile in both themes without covering controls or adding horizontal overflow',async()=>{
    await reset();
    for(const dark of [false,true]) for(const width of [375,768,1024,1440]) {
      await page.setViewportSize({width,height:width===375?812:1000});await page.evaluate(value=>document.body.toggleAttribute('data-ds-dark-theme',value),dark);await page.waitForTimeout(220);
      const state=await card.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth,corners:el.querySelectorAll('.dsh-ef-composer-corner').length,sendHit:(()=>{const b=el.querySelector('[data-ef-send]'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()}));
      assert.ok(state.scroll<=state.width+1&&state.page<=state.viewport&&state.sendHit,JSON.stringify(state));layouts.push({dark,viewport:width,...state});
      if(width===375||width===1440) await snap(`${dark?'dark':'light'}-${width}`);
    }
  });
  await check('model and effort panel shake are exactly one quarter of the initial poses and remain 146ms',async()=>{
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{document.body.removeAttribute('data-ds-dark-theme');window.__efHoldPanel=true;});
    await page.locator('.dsh-ef-trigger').click();await page.waitForTimeout(360);
    await page.getByRole('button',{name:'推理等级：低',exact:true}).click();
    await page.waitForFunction(()=>window.__efAnimations.some(a=>a.id==='dsh-ef-panel-confirm'));
    async function poses() {return page.evaluate(()=>{
      const a=window.__efAnimations.findLast(a=>a.id==='dsh-ef-panel-confirm');a.pause();const duration=a.effect.getTiming().duration;
      return {duration,poses:[0,.1,.12,.2,.35,.6,.95,1].map(fraction=>{a.currentTime=duration*fraction;const s=getComputedStyle(a.effect.target);return {fraction,translate:s.translate,rotate:s.rotate};})};
    });}
    const effort=await poses();assert.equal(effort.duration,146);
    const baseline=JSON.parse(await readFile(new URL('panel-shake-inspection.json',artifacts),'utf8'));
    effort.poses.forEach((pose,i)=>{
      xy(pose.translate).forEach((number,j)=>assert.ok(Math.abs(number-xy(baseline.frames.poses[i].translate)[j]/4)<1e-6));
      assert.ok(Math.abs((parseFloat(pose.rotate)||0)-(parseFloat(baseline.frames.poses[i].rotate)||0)/4)<1e-6);
    });
    await page.waitForFunction(()=>!document.querySelector('[aria-label="推理等级：最高"]').disabled);
    await page.getByRole('button',{name:'演示提供方 A',exact:false}).click();
    await page.locator('.dsh-ef-list').getByRole('button',{name:/示例 · 双档模型/}).click();
    await page.waitForFunction(()=>window.__efAnimations.filter(a=>a.id==='dsh-ef-panel-confirm').length===2);
    const model=await poses();assert.deepEqual(model,effort);
    await writeFile(new URL('panel-shake-quarter.json',artifacts),JSON.stringify({version:'0.7.0',checkedAt:new Date().toISOString(),comparedWithOriginal:'0.5.1',originalAmplitudeScale:.25,comparedWithPrevious:'0.5.3',previousAmplitudeScale:.5,peaks:{x:1.25,y:.75,rotate:.0875},effort,model},null,2));
    await page.getByRole('button',{name:'关闭模型面板'}).click();await page.waitForTimeout(230);
  });
  await check('reduced motion cancels current feedback and removes corner transitions while preserving sends',async()=>{
    await reset();await input.fill('减少动态效果');await send.click();assert.equal(await count(),8);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(50);
    assert.ok(await page.evaluate(()=>window.__efAnimations.filter(a=>a.id.startsWith('dsh-ef-composer-')).every(a=>a.playState==='idle')));
    assert.equal(await page.locator('.dsh-ef-composer-corner').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await reset();const before=await sent();await input.fill('静态发送');await page.keyboard.press('Enter');await page.waitForTimeout(50);
    assert.equal(await count(),0);assert.equal(await sent(),before+1);await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('workspace reuse removes decorations, rerender restores only one layer, and missing toolbar chrome is repaired',async()=>{
    await page.evaluate(()=>document.querySelector('[data-composer-card]').classList.add('host_cardWorkspaceTrigger'));
    await page.waitForFunction(()=>!document.querySelector('[data-ef-composer-chrome]'));
    assert.equal(await page.locator('[data-ef-toolbar-chrome],[data-ef-toolbar],[data-ef-tools],[data-ef-trailing]').count(),0);
    await page.evaluate(()=>document.querySelector('[data-composer-card]').classList.remove('host_cardWorkspaceTrigger'));
    await page.locator('[data-ef-toolbar-chrome]').waitFor({state:'attached'});
    await page.evaluate(()=>document.querySelector('[data-ef-toolbar-chrome]').remove());await page.locator('[data-ef-toolbar-chrome]').waitFor({state:'attached'});
    assert.equal(await page.locator('[data-ef-composer-chrome]').count(),1);assert.equal(await page.locator('[data-ef-toolbar-chrome]').count(),1);
  });
  await check('unload cancels running feedback, removes added DOM and restores toolbar markers',async()=>{
    await reset();await input.fill('卸载清理');await send.click();
    const state=await page.evaluate(()=>{
      const card=document.querySelector('[data-ef-composer]');const animations=window.__efAnimations.filter(a=>a.id.startsWith('dsh-ef-composer-'));
      window.__efDemo.unmount();return {cancelled:animations.every(a=>a.playState==='idle'),chrome:card.querySelectorAll('[data-ef-composer-chrome],[data-ef-toolbar-chrome],[data-ef-toolbar],[data-ef-tools],[data-ef-trailing]').length,styles:!!document.querySelector('[data-dsh-ef-styles]')};
    });
    assert.deepEqual(state,{cancelled:true,chrome:0,styles:false});
  });
  assert.deepEqual(errors,[]);await writeFile(new URL('composer-results.json',artifacts),JSON.stringify({version:'0.7.0',passed:results,layouts,pageErrors:errors},null,2));
  console.log(`${results.length} composer scenarios passed.`);
} catch(error) {
  await page.screenshot({path:fileURLToPath(new URL('composer-failure.png',artifacts)),fullPage:true}).catch(()=>{});
  console.error(error.stack);process.exitCode=1;
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
