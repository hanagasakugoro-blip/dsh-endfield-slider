/** Full installed DSH runtime, isolated home, local test adapter, no paid inference. */
import {mkdir, writeFile, symlink, unlink} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, join} from 'node:path';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
import {playwrightRuntime} from '../scripts/dev-runtime.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const home = join(project, 'artifacts', `live-home-${Date.now()}`);
const workspace = join(home, 'workspace');
const profile = join(home, 'profiles', 'web');
await mkdir(join(profile, 'node_modules'), {recursive: true});
await mkdir(workspace, {recursive: true});
process.env.DSH_HOME = home;
process.env.DSH_AGENTS_HOME = join(home, 'agents');
process.env.DSH_TELEMETRY_DISABLED = '1';
const installed = process.env.DSH_EF_HOST_MODULES;
if (!installed) throw new Error('Set DSH_EF_HOST_MODULES to the installed DSH node_modules/@deepseek-ai directory.');
const dsh = resolve(installed, '../..');
const plugin = 'dsh-endfield-reasoning-slider';
const skins = process.env.DSH_EF_LIVE_SKINS === '0' ? [] : ['open-sea-skin', '@smalltailqwq/dsh-client-ui-skin-maid-atelier'];
const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...skins, plugin];
const dependencies = {[plugin]: `link:${project}`};
for (const name of skins) {
  const target = join(process.env.DSH_EF_SKIN_MODULES ?? join(homedir(), '.dsh/profiles/web/node_modules'), name);
  const link = join(profile, 'node_modules', name);await mkdir(resolve(link, '..'), {recursive: true});
  await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  dependencies[name] = `link:${target}`;
}
await writeFile(join(profile, 'package.json'), JSON.stringify({name: 'endfield-live-smoke', private: true, dependencies, dsh: {profile: {bundles, patchReload: 'live'}}}, null, 2));
await writeFile(join(profile, 'cordis.patch.yml'), '- id: web-runtime\n  config:\n    openBrowser: false\n    printUrl: false\n    surfaceContext: false\n- id: agent-default-model\n  config:\n    provider: endfield-smoke\n    model: test-model\n');
await symlink(project, join(profile, 'node_modules', plugin), process.platform === 'win32' ? 'junction' : 'dir');
const api = async path => import(pathToFileURL(path).href);
let host;
let browser;
let page;
let testSessionId;
let inferenceCalls = 0;
const localCommands = [];
const composerChecks = [];
let commandGate;
const errors = [];
try {
  const {loadLayeredEnv} = await api(join(installed, 'dsh-app-boot/lib/index.js'));
  const {runProfile} = await api(join(dsh, 'lib/profile-boot.js'));
  host = await runProfile({environment: loadLayeredEnv('dsh', project), profile: 'web', patchFiles: [], args: ['--port', '0', '--no-open']});
  const {LlmAdapter} = await api(join(installed, 'dsh-llm/lib/index.js'));
  const reasoning = {defaultEffort: 'high', efforts: [{id: 'low', name: '低'}, {id: 'high', name: '高'}, {id: 'max', name: '最高'}]};
  class LocalTestAdapter extends LlmAdapter {
    providerInfo(id) { return {id, name: '本地验证提供方'}; }
    async listModels(provider) { return [{provider, id: 'test-model', name: '本地验证模型'}]; }
    async resolveModel(provider, id) { return {provider, id, name: '本地验证模型', reasoning}; }
    async *stream() { inferenceCalls++;throw Error('Inference is disabled in the integration test.'); }
  }
  await host.ctx.plugin({name: 'endfield-test-adapter', inject: ['llm'], apply(ctx) { ctx.effect(() => ctx.llm.registerAdapter(['endfield-smoke'], new LocalTestAdapter())); }});
  await host.ctx.plugin({name: 'endfield-test-command', inject: ['commands'], apply(ctx) {
    ctx.effect(() => ctx.commands.register({name:'efcheck',description:'Verify local composer input',input:{hint:'<text>'},handler:async invocation=>{
      localCommands.push(invocation.rawInput.trim());
      const gate = commandGate;
      if (!gate) throw Error('No local command test is armed.');
      gate.started.resolve();
      await gate.release.promise;
      return {kind:'success',text:'Local composer input verified.'};
    }}));
  }});
  const controller = host.ctx.get('sessionController');
  const registeredWorkspace = await host.ctx.get('workspaceRegistry').create(workspace, 'Endfield 验证工作区');
  const created = await controller.create({workspaceId: registeredWorkspace.id});
  const sid = created.sessionId;
  testSessionId = sid;
  await controller.rename({sessionId: sid, title: 'Endfield 本地验证'});
  const origin = host.ctx.get('webServer').getOrigin();
  const authenticated = host.ctx.get('connection').authenticatedUrl(origin);
  const {chromium} = await playwrightRuntime();
  browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--disable-gpu']});
  page = await browser.newPage({viewport: {width: 1440, height: 1000}, locale: 'zh-CN'});
  page.setDefaultTimeout(15000);
  await page.addInitScript(()=>{
    window.__efComposerAnimations=[];
    const timeout=window.setTimeout;
    window.setTimeout=(fn,delay,...args)=>timeout(fn,window.__efHoldOpening&&delay===530?60000:delay,...args);
    const original=Element.prototype.animate;
    Element.prototype.animate=function(...args) {
      const animation=original.apply(this,args);
      if(this.matches('.dsh-ef-corner-pulse,.dsh-ef-composer-edge-pulse,.dsh-ef-toolbar-pulse,.dsh-ef-composer-send-signal')) {animation.pause();window.__efComposerAnimations.push(animation);}
      return animation;
    };
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text().replace(/([?&]token=)[^&\s]+/g, '$1[hidden]')); });
  // Test-only observation seam: expose the real plugin context without replacing services.
  await page.route('**/plugins/**', async route => {
    if (!route.request().url().includes('client.js') || route.request().url().includes('.map')) { await route.continue();return; }
    try {
      const response = await route.fetch();
      const source = await response.text();
      await route.fulfill({response, body: source.replace('return {apply, inject};', 'return {apply(ctx) { window.__efTestContext = ctx; return apply(ctx); }, inject};')});
    } catch { errors.push('Test asset interception failed.');await route.abort().catch(() => {}); }
  });
  // Token stays in memory; never serialize browser credentials or authenticated URLs.
  await page.goto(authenticated);
  const welcome = page.getByRole('button', {name: '继续', exact: true});
  await welcome.waitFor({timeout: 10000}).catch(() => {});
  if (await welcome.count()) await welcome.click();
  console.log('Live host page initialized.');
  await page.waitForFunction(() => window.__efTestContext, undefined, {timeout: 10000});
  console.log('Plugin materialized.');
  await page.evaluate(sessionId => {
    const service = window.__efTestContext.root.get('uiWorkspace');
    if (!service) throw Error('Workspace UI service is unavailable.');
    service.openSession(sessionId);
  }, sid);
  console.log('Opened isolated session.');
  const trigger = page.getByRole('button', {name: /选择模型与推理等级/});
  await trigger.waitFor({timeout: 20000});
  await page.locator('[data-ef-composer]').waitFor();
  assert.equal(await page.locator('[data-ef-composer]').evaluate(el => getComputedStyle(el).borderRadius), '0px');
  assert.equal(await page.locator('[data-ef-send]').count(), 1);
  await page.evaluate(()=>{window.__efHoldOpening=true;});
  await trigger.click();
  const opening=page.locator('.dsh-ef-panel-opening');
  await opening.waitFor({state:'attached'});
  const reveal=await opening.evaluate(el=>({pixels:el.querySelectorAll('.dsh-ef-reveal-pixel').length,dots:el.querySelectorAll('.dsh-ef-reveal-dot').length,mask:getComputedStyle(el.parentElement).maskImage,colors:['.dsh-ef-cover-ink','.dsh-ef-cover-yellow'].map(selector=>getComputedStyle(el.querySelector(selector)).fill)}));
  assert.equal(reveal.pixels,32);assert.equal(reveal.dots,1);assert.notEqual(reveal.mask,'none');assert.deepEqual(reveal.colors,['rgb(22, 22, 22)','rgb(255, 250, 0)']);
  await page.locator('.dsh-ef-panel').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=/dsh-ef-(cover-in|cover-out|cover-fade|particle-out|halftone-out|impact-invert|impact-pixel)/.test(a.animationName)?175:1000;}});
  await page.locator('.dsh-ef-panel').screenshot({path:join(project,'artifacts/live-panel-covered.png')});
  const covered=await opening.evaluate(el=>({enter:new DOMMatrixReadOnly(getComputedStyle(el.querySelector('.dsh-ef-cover-layer')).transform).e,clear:new DOMMatrixReadOnly(getComputedStyle(el.querySelector('.dsh-ef-cover-out')).transform).e}));assert.deepEqual(covered,{enter:0,clear:0});
  await page.locator('.dsh-ef-panel').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=/dsh-ef-(cover-in|cover-out|cover-fade|particle-out|halftone-out|impact-invert|impact-pixel)/.test(a.animationName)?171:1000;}});
  assert.equal(await opening.evaluate(el=>getComputedStyle(el.querySelector('.dsh-ef-cover-layer')).filter),'grayscale(1) invert(1)');
  await page.locator('.dsh-ef-panel').screenshot({path:join(project,'artifacts/live-panel-impact-invert.png')});
  await page.locator('.dsh-ef-panel').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=/dsh-ef-(cover-in|cover-out|cover-fade|particle-out|halftone-out|impact-invert|impact-pixel)/.test(a.animationName)?300:1000;}});
  assert.ok((await page.locator('.dsh-ef-panel').evaluate(el=>getComputedStyle(el).filter)).includes('-shift'));
  const pixelFrame=await page.locator('.dsh-ef-panel').screenshot({path:join(project,'artifacts/live-panel-impact-pixel.png')});
  await page.locator('.dsh-ef-panel').evaluate(el=>{el.getAnimations().find(a=>a.animationName==='dsh-ef-impact-pixel').currentTime=0;});
  const cleanFrame=await page.locator('.dsh-ef-panel').screenshot();assert.notDeepEqual(pixelFrame,cleanFrame);
  await page.locator('.dsh-ef-panel').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=/dsh-ef-(cover-in|cover-out|cover-fade|particle-out|halftone-out|impact-invert|impact-pixel)/.test(a.animationName)?370:1000;}});
  assert.equal(await page.locator('.dsh-ef-panel').evaluate(el=>getComputedStyle(el).filter),'none');
  await page.locator('.dsh-ef-panel').screenshot({path:join(project,'artifacts/live-panel-reveal.png')});
  await page.getByRole('button',{name:'关闭模型面板'}).evaluate(el=>el.click());
  await page.locator('.dsh-ef-panel').waitFor({state:'detached'});
  await page.evaluate(()=>{window.__efHoldOpening=false;});
  composerChecks.push('actual host covers then wipes right, renders monochrome inversion and pixel displacement impacts, restores the panel and cleans up on close');
  await trigger.click();
  const slider = page.getByRole('slider', {name: '推理等级'});
  await slider.waitFor();
  assert.equal(await slider.getAttribute('aria-valuetext'), '高');
  await page.locator('.dsh-ef-panel').evaluate(el => Promise.allSettled(el.getAnimations({subtree:true}).map(animation => animation.finished)));
  const box = await slider.boundingBox();
  await page.mouse.move(box.x+box.width*.5,box.y+23);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.18,box.y+23);
  const dragged = await slider.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return (el.querySelector('.dsh-ef-cursor').getBoundingClientRect().left-rect.left)/rect.width;
  });
  assert.ok(Math.abs(dragged-.18)<.005);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('.dsh-ef-trigger')?.textContent.includes('低'));
  await page.waitForFunction(() => !document.querySelector('[aria-label="推理等级：最高"]')?.disabled);
  console.log('First selection settled; continuing with the same session.');
  await page.getByRole('button', {name: '推理等级：最高', exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.dsh-ef-trigger')?.textContent.includes('最高'));
  const frames = await controller.projections({sessionId: sid}, new AbortController().signal);
  assert.ok(JSON.stringify(frames).includes('"reasoningEffort":"max"'));
  await page.reload();
  await page.getByRole('button', {name: /选择模型与推理等级/}).waitFor();
  assert.match(await page.getByRole('button', {name: /选择模型与推理等级/}).textContent(), /最高/);
  await page.getByRole('button', {name: /选择模型与推理等级/}).click();
  await page.waitForTimeout(450);
  await page.screenshot({path: join(project, 'artifacts/live-host.png'), fullPage: true});
  await page.getByRole('button',{name:'关闭模型面板'}).click();await page.locator('.dsh-ef-panel').waitFor({state:'detached'});
  const input=page.locator('[data-composer-input]');
  const feedbackCount=()=>page.evaluate(()=>window.__efComposerAnimations.length);
  const resetFeedback=()=>page.evaluate(()=>{for(const a of window.__efComposerAnimations)a.cancel();window.__efComposerAnimations=[];});
  await input.fill('/efc');
  await page.getByRole('option').filter({hasText:'efcheck'}).waitFor();
  await page.keyboard.press('Enter');await page.waitForTimeout(150);
  assert.equal(await feedbackCount(),0);assert.equal(localCommands.length,0);
  composerChecks.push('actual command-menu Enter selects without a send flash');
  console.log('Composer command-menu arbitration verified.');
  await input.fill('newline');await page.keyboard.press('Shift+Enter');await page.waitForTimeout(150);
  assert.equal(await feedbackCount(),0);assert.equal(inferenceCalls,0);
  composerChecks.push('actual Shift+Enter keeps newline behavior');
  for(const key of ['Enter','Control+Enter','Meta+Enter','click']) {
    commandGate={started:Promise.withResolvers(),release:Promise.withResolvers()};
    await resetFeedback();await input.fill(`/efcheck ${key}`);
    await page.waitForFunction(()=>!document.querySelector('[data-ef-send]')?.disabled);
    if(await page.locator('[data-trigger-menu]').count()) await page.keyboard.press('Escape');
    if(key==='click') await page.locator('[data-ef-send]:not(:disabled)').click();else await page.keyboard.press(key);
    await page.waitForFunction(()=>window.__efComposerAnimations.length===8,undefined,{timeout:3000});
    // Hold the local command acknowledgment until feedback has been inspected.
    let deadline;
    try { await Promise.race([commandGate.started.promise,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('Local command did not start.')),3000);})]); }
    finally {clearTimeout(deadline);}
    assert.ok(['adjudicating','submitting'].includes(await input.getAttribute('data-phase')));
    commandGate.release.resolve();
    await page.waitForFunction(()=>document.querySelector('[data-composer-input]')?.textContent.trim()==='',undefined,{timeout:5000});
    composerChecks.push(`${key}: one feedback before local command acknowledgment`);
    console.log(`Composer ${key} verified without inference.`);
  }
  assert.equal(localCommands.length,4);
  await resetFeedback();
  for(const width of [375,1440]) {
    await page.setViewportSize({width,height:width===375?812:1000});await page.waitForTimeout(180);
    const geometry=await page.locator('[data-ef-composer]').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,groups:[...el.querySelector('[data-ef-toolbar]').children].filter(n=>n.getBoundingClientRect().width>0).length,cornerWidth:el.querySelector('.dsh-ef-composer-corner').getBoundingClientRect().width,cornerBorder:getComputedStyle(el.querySelector('.dsh-ef-composer-corner'),'::before').borderTopWidth}));
    assert.ok(geometry.scroll<=geometry.width+1);assert.equal(geometry.groups,2);
    assert.equal(geometry.cornerWidth,width===375?22:26);assert.equal(geometry.cornerBorder,'3px');
    await page.locator('[data-ef-composer]').screenshot({path:join(project,`artifacts/live-composer-${width}.png`)});
  }
  composerChecks.push('real host toolbar still measures two groups at 375px and 1440px');
  assert.deepEqual(errors,[]);
  assert.equal(inferenceCalls, 0);
  const report = {version:'0.8.0',host: '@deepseek-ai/dsh 0.2.1-rc.2', isolatedHome: true, skins, actualSlotsAndRemote: true, continuousDragAndSnapSaved: true, persistedSelectionAfterReload: true, composerChecks, localCommandCalls:localCommands.length, inferenceCalls, browserErrors: errors, backendProjectionRead: !!frames};
  await writeFile(join(project, 'artifacts/live-host-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (page && testSessionId) {
    const state = await page.evaluate(sessionId => {
      const snapshot = window.__efTestContext?.modelDirectories.directoryFor(sessionId)?.store.getSnapshot();
      return {status: snapshot?.status, pending: !!snapshot?.pending, current: snapshot?.current,
        catalogStatus: window.__efTestContext?.modelDirectories.directoryFor(sessionId)?.catalog?.store.getSnapshot().status,
        projectedAvailable: window.__efTestContext?.modelDirectories.directoryFor(sessionId)?.projected?.getSnapshot() !== undefined,
        panelBusy: document.querySelector('.dsh-ef-panel')?.getAttribute('aria-busy'),
        sliderDisabled: document.querySelector('[role=slider]')?.getAttribute('aria-disabled'),
        highestDisabled: document.querySelector('[aria-label="推理等级：最高"]')?.disabled,
        hint: document.querySelector('.dsh-ef-hint')?.textContent};
    }, testSessionId).catch(() => null);
    console.log('Selection diagnostics:', JSON.stringify(state));
  }
  if (page) await page.screenshot({path: join(project, 'artifacts/live-host-failure.png'), fullPage: true}).catch(() => {});
  console.error(error.stack?.replace(/([?&]token=)[^&\s]+/g, '$1[hidden]'));
  console.log('Browser diagnostics:', errors);
  process.exitCode = 1;
} finally {
  commandGate?.release.resolve();
  await browser?.close();
  await host?.ctx.fiber.dispose();
  await unlink(join(home, '.credentials.yaml')).catch(() => {});
}
