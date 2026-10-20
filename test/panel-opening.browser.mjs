import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {playwrightRuntime} from '../scripts/dev-runtime.mjs';
import {servePreview} from '../scripts/preview-server.mjs';

const {chromium}=await playwrightRuntime();
const server=await servePreview(0);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});
page.setDefaultTimeout(10000);
const artifacts=new URL('../artifacts/',import.meta.url),errors=[],results=[];
await mkdir(artifacts,{recursive:true});
page.on('pageerror',error=>errors.push(error.message));
// Hold only this effect's cleanup while inspecting paused intermediate frames.
await page.addInitScript(()=>{
  const timeout=window.setTimeout;
  window.setTimeout=(fn,delay,...args)=>timeout(fn,window.__holdOpening&&delay===530?60000:delay,...args);
});
const panel=page.locator('.dsh-ef-panel'),overlay=panel.locator(':scope > .dsh-ef-panel-opening');
async function check(name,fn){await fn();results.push(name);console.log(`PASS ${name}`);}
async function open(hold=true){
  await page.evaluate(value=>{window.__holdOpening=value;document.querySelector('.dsh-ef-trigger').click();},hold);
  await overlay.waitFor({state:'attached'});
}
async function close(){
  await page.getByRole('button',{name:'关闭模型面板'}).evaluate(el=>el.click());
  await overlay.waitFor({state:'detached'});
  await panel.waitFor({state:'detached'});
}
async function pose(time){return overlay.evaluate((el,time)=>{
  for(const animation of el.closest('.dsh-ef-panel').getAnimations({subtree:true})){
    animation.pause();animation.currentTime=/dsh-ef-(cover-in|cover-out|cover-fade|particle-out|halftone-out|impact-invert|impact-pixel)/.test(animation.animationName)?time:1000;
  }
  const x=selector=>new DOMMatrixReadOnly(getComputedStyle(el.querySelector(selector)).transform).e;
  return {enter:x('.dsh-ef-cover-layer'),mask:x('.dsh-ef-cover-mask'),clear:x('.dsh-ef-cover-out'),width:el.getBoundingClientRect().width,pixels:[...el.querySelectorAll('.dsh-ef-reveal-pixel')].map(node=>({opacity:+getComputedStyle(node).opacity,transform:getComputedStyle(node).transform})),dot:+getComputedStyle(el.querySelector('.dsh-ef-reveal-dot')).opacity,coverFilter:getComputedStyle(el.querySelector('.dsh-ef-cover-layer')).filter,panelFilter:getComputedStyle(el.parentElement).filter,coverOpacity:+getComputedStyle(el.querySelector('.dsh-ef-cover-layer')).opacity,panelOpacity:+getComputedStyle(el.parentElement).opacity};
},time);}
async function changedRatio(first,second){return page.evaluate(async([a,b])=>{
  const decode=async data=>{const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode();const canvas=new OffscreenCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,img.width,img.height).data;};
  const [x,y]=await Promise.all([decode(a),decode(b)]);if(x.length!==y.length)throw Error('Frame dimensions differ');
  let different=0;for(let i=0;i<x.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(x[i+c]-y[i+c])))>12)different++;
  return different/(x.length/4);
},[first.toString('base64'),second.toString('base64')]);}
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('[data-ef-send]').waitFor();
  await check('black and yellow cover slides in before the particle pass and never intercepts controls',async()=>{
    await open();await pose(0);
    const state=await overlay.evaluate(el=>{
      const r=el.getBoundingClientRect(),p=el.parentElement;
      const button=p.querySelector('button'),b=button.getBoundingClientRect();
      return {pixels:el.querySelectorAll('.dsh-ef-reveal-pixel').length,dots:el.querySelectorAll('.dsh-ef-reveal-dot').length,colors:['.dsh-ef-cover-ink','.dsh-ef-cover-yellow'].map(selector=>getComputedStyle(el.querySelector(selector)).fill),mask:getComputedStyle(p).maskImage,maskId:el.querySelector('mask').id,height:r.height,panel:p.getBoundingClientRect().height,pointer:getComputedStyle(el).pointerEvents,hidden:el.getAttribute('aria-hidden'),hit:button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),timings:el.getAnimations({subtree:true}).filter(a=>/dsh-ef-cover-(in|out)/.test(a.animationName)).map(a=>({name:a.animationName,duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay})),easings:el.getAnimations({subtree:true}).filter(a=>!a.animationName.includes('impact')&&a.animationName!=='dsh-ef-cover-fade').map(a=>a.effect.getKeyframes()[0].easing),total:Math.max(...el.getAnimations({subtree:true}).map(a=>a.effect.getTiming().duration+a.effect.getTiming().delay))};
    });
    const fade=await overlay.evaluate(el=>{const a=el.getAnimations({subtree:true}).find(a=>a.animationName==='dsh-ef-cover-fade');return {duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay,easing:a.effect.getKeyframes()[0].easing};});
    assert.deepEqual(fade,{duration:250,delay:200,easing:'ease-in-out'});
    assert.equal(state.pixels,32);assert.equal(state.dots,1);assert.deepEqual(state.colors,['rgb(22, 22, 22)','rgb(255, 250, 0)']);assert.ok(state.mask.includes(`#${state.maskId}`));
    assert.deepEqual(state.timings,[{name:'dsh-ef-cover-in',duration:170,delay:0},{name:'dsh-ef-cover-in',duration:170,delay:0},{name:'dsh-ef-cover-out',duration:290,delay:210}]);
    assert.ok(state.easings.every(easing=>easing==='cubic-bezier(0.33, 0.95, 1, 0.04)'),JSON.stringify([...new Set(state.easings)]));
    assert.ok(Math.abs(state.height-state.panel)<1);assert.equal(state.pointer,'none');assert.equal(state.hidden,'true');assert.equal(state.hit,true);assert.equal(state.total,500);
  });
  await check('rendered frames show cover then particle wipe, fading only the cover from 200ms to 450ms with ease-in-out',async()=>{
    const start=await pose(0);assert.ok(Math.abs(start.enter+start.width)<.01);assert.equal(start.clear,0);
    const clip=await panel.boundingBox(),capture=()=>page.screenshot({clip});
    const startImage=await capture();await writeFile(new URL('panel-reveal-start.png',artifacts),startImage);
    await panel.evaluate(el=>{el.style.visibility='hidden';});const backdrop=await capture();await panel.evaluate(el=>{el.style.visibility='visible';});
    const enter=await pose(85);assert.ok(enter.enter>start.enter&&enter.enter<0);assert.equal(enter.enter,enter.mask);assert.equal(enter.clear,0);await writeFile(new URL('panel-reveal-cover-in.png',artifacts),await capture());
    const covered=await pose(175);assert.equal(covered.enter,0);assert.equal(covered.clear,0);const coverImage=await capture();await writeFile(new URL('panel-reveal-covered.png',artifacts),coverImage);
    const hold=await pose(200);assert.equal(hold.enter,0);assert.equal(hold.clear,0);assert.equal(hold.coverOpacity,1);assert.equal(await changedRatio(coverImage,await capture()),0);
    const opacitySamples=[];
    for(const [time,expected] of [[199.99,1],[200,1],[262.5,.87084],[325,.5],[387.5,.12916],[450,0],[500,0]]){
      const frame=await pose(time);assert.ok(Math.abs(frame.coverOpacity-expected)<.003,JSON.stringify({time,expected,...frame}));assert.equal(frame.panelOpacity,1);opacitySamples.push({time,opacity:frame.coverOpacity});
    }
    await pose(325);const faded=await capture();await writeFile(new URL('panel-reveal-opacity-midpoint.png',artifacts),faded);
    await overlay.evaluate(el=>{el.getAnimations({subtree:true}).find(a=>a.animationName==='dsh-ef-cover-fade').currentTime=0;});const opaque=await capture();const fadeChangedRatio=await changedRatio(faded,opaque);assert.ok(fadeChangedRatio>.1,String(fadeChangedRatio));
    await pose(450);const transparent=await capture();await overlay.evaluate(el=>{el.querySelector('.dsh-ef-cover-layer').style.visibility='hidden';});assert.equal(await changedRatio(transparent,await capture()),0);await overlay.evaluate(el=>{el.querySelector('.dsh-ef-cover-layer').style.visibility='';});
    await writeFile(new URL('panel-opacity-frames.json',artifacts),JSON.stringify({version:'0.8.0',start:200,end:450,easing:'ease-in-out',samples:opacitySamples,fadeChangedRatio,panelOpacity:1,transparentMatchesHidden:true},null,2));
    const middle=await pose(370);assert.equal(middle.enter,0);assert.ok(middle.clear>0&&middle.clear<middle.width);assert.ok(middle.pixels.some(p=>p.opacity>0&&p.opacity<1));
    const midImage=await capture();await writeFile(new URL('panel-reveal-pixels.png',artifacts),midImage);
    const late=await pose(427.5);assert.ok(late.clear>middle.clear&&late.clear<late.width);assert.ok(late.dot>0&&late.dot<1);await writeFile(new URL('panel-reveal-halftone.png',artifacts),await capture());
    const end=await pose(500);assert.ok(end.clear>end.width+100);assert.ok(end.pixels.every(p=>p.opacity===0));assert.equal(end.dot,0);assert.ok(['none','grayscale(0) invert(0)'].includes(end.coverFilter));assert.equal(end.panelFilter,'none');
    const endImage=await capture();await writeFile(new URL('panel-reveal-complete.png',artifacts),endImage);
    const mask=await panel.evaluate(el=>{const value=el.style.maskImage;el.style.maskImage='none';return value;});const complete=await capture();await panel.evaluate((el,value)=>{el.style.maskImage=value;},mask);
    const raster={startVsBackdrop:await changedRatio(startImage,backdrop),endVsUnmasked:await changedRatio(endImage,complete),startVsEnd:await changedRatio(startImage,endImage),middleVsStart:await changedRatio(midImage,startImage),middleVsEnd:await changedRatio(midImage,endImage)};
    assert.ok(raster.startVsBackdrop<.001,JSON.stringify(raster));assert.ok(raster.endVsUnmasked<.001,JSON.stringify(raster));assert.ok(raster.startVsEnd>.3&&raster.middleVsStart>.08&&raster.middleVsEnd>.05,JSON.stringify(raster));
    const colors=await page.evaluate(async data=>{const img=new Image();img.src=`data:image/png;base64,${data}`;await img.decode();const canvas=new OffscreenCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const bytes=ctx.getImageData(0,0,img.width,img.height).data;let black=0,yellow=0,other=0;for(let y=4;y<img.height-4;y++)for(let x=4;x<img.width-4;x++){const i=(y*img.width+x)*4,r=bytes[i],g=bytes[i+1],b=bytes[i+2];if(Math.abs(r-22)<3&&Math.abs(g-22)<3&&Math.abs(b-22)<3)black++;else if(r>250&&g>245&&b<5)yellow++;else other++;}return {black,yellow,other};},coverImage.toString('base64'));
    assert.ok(colors.black>colors.yellow*2&&colors.yellow>colors.black*.3&&colors.other<(colors.black+colors.yellow)*.004,JSON.stringify(colors));
    const curves={enter:[],clear:[]};
    for(const fraction of [.25,.5,.75]){
      const input=await pose(170*fraction),output=await pose(210+290*fraction);
      curves.enter.push(1+input.enter/input.width);curves.clear.push(output.clear/(output.width+110));
    }
    for(const values of Object.values(curves)){for(const [i,expected] of [.39191,.48663,.50806].entries())assert.ok(Math.abs(values[i]-expected)<.003);}
    await writeFile(new URL('panel-opening-frames.json',artifacts),JSON.stringify({version:'0.8.0',curve:[.33,.95,1,.04],start,enter,covered,hold,middle,late,end,raster,coverColors:colors,measuredCurveProgress:curves},null,2));
  });
  await check('two isolated 17ms impacts invert in monochrome and displace actual pixel slices, then fully restore',async()=>{
    const timings=await panel.evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.animationName.includes('impact')).map(a=>({name:a.animationName,duration:a.effect.getTiming().duration,delay:a.effect.getTiming().delay})).sort((a,b)=>a.delay-b.delay));
    assert.deepEqual(timings,[{name:'dsh-ef-impact-invert',duration:17,delay:155},{name:'dsh-ef-impact-pixel',duration:17,delay:295}]);
    // Seek 1 microsecond beyond the end to avoid fractional CSS-time rounding.
    assert.equal((await pose(154.99)).coverFilter,'none');assert.equal((await pose(155)).coverFilter,'grayscale(1) invert(1)');assert.equal((await pose(171.99)).coverFilter,'grayscale(1) invert(1)');assert.ok(['none','grayscale(0) invert(0)'].includes((await pose(172.001)).coverFilter));
    await pose(171);const inverse=await panel.screenshot({path:fileURLToPath(new URL('panel-impact-invert.png',artifacts))});
    await panel.evaluate(el=>{el.getAnimations({subtree:true}).find(a=>a.animationName==='dsh-ef-impact-invert').currentTime=0;});const ordinaryCover=await panel.screenshot();assert.ok(await changedRatio(inverse,ordinaryCover)>.9);
    const monochrome=await page.evaluate(async base64=>{const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();const canvas=new OffscreenCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,img.width,img.height).data;let colored=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>4)colored++;return colored/(data.length/4);},inverse.toString('base64'));assert.ok(monochrome<.001);
    assert.equal((await pose(294.99)).panelFilter,'none');assert.ok((await pose(295)).panelFilter.includes('-shift'));assert.ok((await pose(311.99)).panelFilter.includes('-shift'));assert.equal((await pose(312)).panelFilter,'none');
    await pose(300);const shifted=await panel.screenshot({path:fileURLToPath(new URL('panel-impact-pixel.png',artifacts))});
    await panel.evaluate(el=>{el.getAnimations({subtree:true}).find(a=>a.animationName==='dsh-ef-impact-pixel').currentTime=0;});const unshifted=await panel.screenshot();const changed=await changedRatio(shifted,unshifted);assert.ok(changed>.01&&changed<.3,String(changed));
    await panel.evaluate(el=>{el.getAnimations({subtree:true}).find(a=>a.animationName==='dsh-ef-impact-pixel').currentTime=312;});assert.equal(await changedRatio(unshifted,await panel.screenshot()),0);
    await writeFile(new URL('panel-impact-frames.json',artifacts),JSON.stringify({version:'0.8.0',timings,monochromeColoredRatio:monochrome,pixelChangedRatio:changed,restored:true},null,2));
  });
  await check('provider navigation does not replay entry; closing mid-effect removes it and reopening creates a fresh entry',async()=>{
    await overlay.evaluate(el=>{window.__entryOverlay=el;window.__entryAnimations=el.parentElement.getAnimations({subtree:true});});
    await page.getByRole('button',{name:/演示提供方 A/}).evaluate(el=>el.click());
    assert.equal(await overlay.evaluate(el=>el===window.__entryOverlay),true);
    await close();assert.ok(await page.evaluate(()=>window.__entryAnimations.every(a=>a.playState==='idle')));
    await open();assert.equal(await overlay.evaluate(el=>el===window.__entryOverlay),false);await close();
  });
  await check('normal entry finishes once, removes its layer promptly, and does not write a selection',async()=>{
    await open(false);await panel.evaluate(el=>{window.__rootEnter=el.getAnimations().find(a=>a.animationName==='dsh-ef-enter');});await overlay.waitFor({state:'detached',timeout:1500});
    assert.equal(await panel.count(),1);assert.equal(await panel.evaluate(el=>getComputedStyle(el).maskImage),'none');assert.equal(await panel.evaluate(el=>getComputedStyle(el).filter),'none');assert.equal(await panel.getAttribute('data-entry-impact'),null);assert.equal(await panel.evaluate(el=>el.getAnimations().find(a=>a.animationName==='dsh-ef-enter')===window.__rootEnter),true);assert.equal(await page.evaluate(()=>window.__efDemo.calls.length),0);await close();
  });
  await check('the dissolve fits the visible panel on mobile and desktop in both themes',async()=>{
    for(const dark of [false,true])for(const width of [375,1440]){
      await page.setViewportSize({width,height:width===375?812:1000});await page.evaluate(value=>document.body.toggleAttribute('data-ds-dark-theme',value),dark);
      await open();await pose(300);
      const geometry=await overlay.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,panel:el.parentElement.getBoundingClientRect().height,page:document.documentElement.scrollWidth,viewport:innerWidth};});
      assert.ok(geometry.left>=0&&geometry.right<=width&&geometry.page<=width);assert.ok(Math.abs(geometry.height-geometry.panel)<1);
      await panel.screenshot({path:fileURLToPath(new URL(`panel-reveal-${dark?'dark':'light'}-${width}.png`,artifacts))});await close();
    }
  });
  await check('switching reduced motion removes the mask immediately; reduced-motion opens reveal content directly',async()=>{
    await open();await page.emulateMedia({reducedMotion:'reduce'});await overlay.waitFor({state:'detached'});await close();
    await page.locator('.dsh-ef-trigger').evaluate(el=>el.click());await panel.waitFor();assert.equal(await overlay.count(),0);assert.equal(await panel.evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await panel.evaluate(el=>getComputedStyle(el).maskImage),'none');assert.equal(await panel.evaluate(el=>getComputedStyle(el).filter),'none');await close();
    await page.emulateMedia({reducedMotion:'no-preference'});
  });
  await check('blur and unload cancel entry without leaving a cover or active animation',async()=>{
    await open();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await overlay.waitFor({state:'detached'});await close();
    await open();const state=await overlay.evaluate(el=>{const animations=el.parentElement.getAnimations({subtree:true});window.__efDemo.unmount();return {remaining:document.querySelectorAll('.dsh-ef-panel-opening,.dsh-ef-panel').length,cancelled:animations.every(a=>a.playState==='idle')};});
    assert.deepEqual(state,{remaining:0,cancelled:true});
  });
  assert.deepEqual(errors,[]);await writeFile(new URL('panel-opening-results.json',artifacts),JSON.stringify({version:'0.8.0',passed:results,browserErrors:errors},null,2));
  console.log(`${results.length} panel opening scenarios passed.`);
}catch(error){await page.screenshot({path:fileURLToPath(new URL('panel-opening-failure.png',artifacts)),fullPage:true}).catch(()=>{});console.error(error.stack);process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
