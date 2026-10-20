import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {playwrightRuntime} from '../scripts/dev-runtime.mjs';
import {servePreview} from '../scripts/preview-server.mjs';

const {chromium} = await playwrightRuntime();
const server = await servePreview(0);
const url = `http://127.0.0.1:${server.address().port}`;
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, {recursive: true});
const browser = await chromium.launch({headless: true, channel: 'chrome', args: ['--disable-gpu']});
const results = [];
let page;
async function check(name, callback) { await callback();results.push(name);console.log(`PASS ${name}`); }
async function current() { return page.evaluate(() => window.__efDemo.state().current); }
async function settled() { await page.waitForFunction(() => window.__efDemo.state().status !== 'selecting' && !document.querySelector('[role=dialog]')?.getAttribute('aria-busy')?.includes('true')); }
async function group(name = '演示提供方 A') {
  const back = page.getByRole('button', {name: '返回提供方', exact: true});
  if (await back.count()) await back.click();
  await page.getByRole('button', {name: new RegExp(name)}).click();
}
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'zh-CN'});
  page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('button', {name: /选择模型与推理等级/}).waitFor();
  await check('initial host value is preserved; no writes on mount', async () => {
    assert.equal((await current()).reasoningEffort, 'high');
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length), 0);
    assert.equal(await page.locator('[role=slider]').count(), 0);
  });
  await check('reused workspace composer receives and releases local styling', async () => {
    await page.evaluate(() => document.querySelector('[data-composer-card]').classList.add('host_cardWorkspaceTrigger'));
    await page.waitForFunction(() => !document.querySelector('[data-composer-card]').hasAttribute('data-ef-composer'));
    assert.equal(await page.locator('[data-ef-send]').count(), 0);
    await page.evaluate(() => document.querySelector('[data-composer-card]').classList.remove('host_cardWorkspaceTrigger'));
    await page.waitForFunction(() => document.querySelector('[data-composer-card]').hasAttribute('data-ef-composer'));
    assert.equal(await page.locator('[data-ef-send]').count(), 1);
  });
  await page.getByRole('button', {name: /选择模型与推理等级/}).click();
  // Manual pointer coordinates must be used after the opening has revealed the slider.
  await page.locator('.dsh-ef-panel').evaluate(el => Promise.allSettled(el.getAnimations({subtree: true}).map(animation => animation.finished)));
  await check('drag previews without writes, release writes once', async () => {
    const slider = page.getByRole('slider', {name: '推理等级'});
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + box.width * 2 / 3, box.y + 23);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, box.y + 23, {steps: 6});
    await page.waitForTimeout(450);
    assert.equal(await slider.getAttribute('aria-valuetext'), '最高');
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length), 0);
    assert.equal((await current()).reasoningEffort, 'high');
    await page.mouse.up();await settled();
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length), 1);
    assert.equal((await current()).reasoningEffort, 'max');
  });
  await check('clicking a tick saves immediately and deduplicates current value', async () => {
    await page.getByRole('button', {name: '推理等级：低', exact: true}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'low');
    const before = await page.evaluate(() => window.__efDemo.calls.length);
    await page.getByRole('button', {name: '推理等级：低', exact: true}).click();
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length), before);
  });
  await check('keyboard previews until keyup; Escape cancels dragging', async () => {
    const slider = page.getByRole('slider', {name: '推理等级'});await slider.focus();
    const before = await page.evaluate(() => window.__efDemo.calls.length);
    await page.keyboard.down('End');
    assert.equal(await slider.getAttribute('aria-valuetext'), '最高');
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length), before);
    await page.keyboard.up('End');await settled();
    assert.equal((await current()).reasoningEffort, 'max');
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + box.width - 1, box.y + 23);await page.mouse.down();
    await page.mouse.move(box.x + 1, box.y + 23);await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal((await current()).reasoningEffort, 'max');
    assert.equal(await slider.getAttribute('aria-valuetext'), '最高');
  });
  await check('each model restores its own remembered effort', async () => {
    await group();
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 双档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'off');
    await page.getByRole('button', {name: '推理等级：开启', exact: true}).click();await settled();
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 多档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'max');
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 双档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'on');
  });
  await check('same model id in a different provider has separate memory', async () => {
    await group('演示提供方 B');
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 多档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'low');
    await group();await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 多档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'max');
  });
  await check('rejected write rolls back to the host value and preserves memory', async () => {
    await page.evaluate(() => window.__efDemo.rejectNext());
    await page.getByRole('button', {name: '推理等级：低', exact: true}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'max');
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /未保存/);
    assert.equal(await page.getByRole('slider').getAttribute('aria-valuetext'), '最高');
  });
  await check('official external changes cancel stale previews', async () => {
    const slider = page.getByRole('slider');const box = await slider.boundingBox();
    const before = await page.evaluate(() => window.__efDemo.calls.length);
    await page.mouse.move(box.x + box.width - 1, box.y + 23);await page.mouse.down();await page.mouse.move(box.x + 1, box.y + 23);
    await page.evaluate(() => window.__efDemo.external({provider: 'demo-a', model: 'same-name', reasoningEffort: 'medium'}));
    await page.mouse.up();
    assert.equal((await current()).reasoningEffort, 'medium');
    assert.equal(await page.evaluate(() => window.__efDemo.calls.length), before);
  });
  await check('models without reasoning, one level and provider default are handled', async () => {
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 无推理模型/}).click();await settled();
    await page.getByText('此模型未公布可调推理等级。').waitFor();assert.equal(await page.getByRole('slider').count(), 0);
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 单档模型/}).click();await settled();
    assert.equal(await page.getByRole('slider').getAttribute('aria-disabled'), 'true');
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 提供方默认/}).click();await settled();
    await page.getByRole('button', {name: '推理等级：开启', exact: true}).click();await settled();
    await page.getByRole('button', {name: '推理等级：提供方默认', exact: true}).click();await settled();
    assert.equal(Object.hasOwn(await current(), 'reasoningEffort'), false);
  });
  await check('obsolete model memory falls back to the advertised default', async () => {
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('dsh.endfield.reasoning.v1'));
      const key = JSON.stringify(['demo-a','same-name']);
      saved.entries = saved.entries.filter(x => x[0] !== key);saved.entries.push([key,'removed']);
      localStorage.setItem('dsh.endfield.reasoning.v1', JSON.stringify(saved));
    });
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 多档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'high');
  });
  await check('pending writes disable conflicting controls and preserve send handlers', async () => {
    await page.evaluate(() => window.__efDemo.delay(300));
    await page.getByRole('button', {name: '推理等级：最高', exact: true}).click();
    assert.equal(await page.getByRole('button', {name: '推理等级：低', exact: true}).isDisabled(), true);
    await settled();await page.evaluate(() => window.__efDemo.delay(60));
    await page.getByRole('button', {name: '关闭模型面板'}).click();
    await page.getByRole('button', {name: '发送', exact: true}).click();
    assert.equal(await page.evaluate(() => window.__efDemo.sent), 1);
  });
  await check('locked owner disables picker and send without changing host state', async () => {
    await page.evaluate(() => window.__efDemo.setLocked(true));
    await page.waitForFunction(() => document.querySelector('.dsh-ef-trigger')?.disabled);
    assert.equal(await page.getByRole('button', {name: /选择模型与推理等级/}).isDisabled(), true);
    assert.equal(await page.getByRole('button', {name: '发送', exact: true}).isDisabled(), true);
    await page.evaluate(() => window.__efDemo.setLocked(false));
    await page.waitForFunction(() => !document.querySelector('.dsh-ef-trigger')?.disabled);
  });
  await check('memory survives reload; keyboard focus remains visible', async () => {
    await page.reload();await page.getByRole('button', {name: /选择模型与推理等级/}).click();
    await group();await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 双档模型/}).click();await settled();
    assert.equal((await current()).reasoningEffort, 'on');
    await page.getByRole('slider').focus();
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({width: getComputedStyle(document.activeElement).outlineWidth, style: getComputedStyle(document.activeElement).outlineStyle}));
    assert.equal(focus.width, '2px');assert.equal(focus.style, 'solid');
  });
  await group();await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 多档模型/}).click();await settled();
  await check('light/dark desktop and mobile layouts; no horizontal overflow; reduced motion', async () => {
    for (const dark of [false, true]) {
      await page.evaluate(value => document.body.toggleAttribute('data-ds-dark-theme', value), dark);
      for (const width of [375,768,1024,1440]) {
        await page.setViewportSize({width, height: width === 375 ? 812 : 1000});
        await page.waitForTimeout(180);
        const layout = await page.evaluate(() => {
          const panel = document.querySelector('.dsh-ef-panel');const rect = panel.getBoundingClientRect();const input = document.querySelector('[data-ef-composer]');
          return {overflow: document.documentElement.scrollWidth > innerWidth, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, bg: getComputedStyle(panel).backgroundColor, radius: getComputedStyle(input).borderRadius, font: getComputedStyle(document.querySelector('[data-composer-input]')).fontFamily};
        });
        assert.equal(layout.overflow, false);assert.ok(layout.left >= 0 && layout.right <= width + 1);assert.ok(layout.top >= 0 && layout.bottom <= (width === 375 ? 812 : 1000));
        assert.equal(layout.bg, dark ? 'rgb(34, 34, 34)' : 'rgb(255, 255, 255)');assert.equal(layout.radius, '0px');assert.match(layout.font, /DSH-Endfield-Saira/);
        if (width === 375 || width === 1440) await page.screenshot({path: fileURLToPath(new URL(`${dark ? 'dark' : 'light'}-${width}.png`, artifacts)), fullPage: true});
      }
    }
    await page.emulateMedia({reducedMotion: 'reduce'});
    const duration = await page.locator('.dsh-ef-panel').evaluate(el => getComputedStyle(el).animationName);
    assert.equal(duration, 'none');
    await page.emulateMedia({reducedMotion: 'no-preference'});
  });
  await check('eight-level labels fit on mobile and search exposes empty states', async () => {
    await page.setViewportSize({width:375,height:812});
    await page.locator('.dsh-ef-list').getByRole('button', {name: /示例 · 八档模型/}).click();await settled();
    assert.equal(await page.locator('.dsh-ef-label').count(), 8);
    await page.getByRole('searchbox', {name:'搜索模型'}).fill('不存在');
    await page.getByText('没有匹配的模型。').waitFor();
    await page.getByRole('searchbox', {name:'搜索模型'}).fill('');
  });
  await check('uninstall removes stylesheet, DOM markers and panel', async () => {
    await page.evaluate(() => window.__efDemo.unmount());
    assert.equal(await page.locator('[data-dsh-ef-styles]').count(), 0);
    assert.equal(await page.locator('[data-ef-composer],[data-ef-send],.dsh-ef-panel').count(), 0);
    assert.equal(await page.evaluate(() => document.body.hasAttribute('data-dsh-ef-slider')), false);
  });
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-results.json', artifacts), JSON.stringify({passed: results, pageErrors: errors, fixture: 'simulated host with installed maid skin CSS; no live model requests'}, null, 2));
  console.log(`${results.length} browser scenarios passed.`);
} catch (error) {
  if (page) await page.screenshot({path: fileURLToPath(new URL('failure.png', artifacts)), fullPage: true}).catch(() => {});
  console.error(error.stack);process.exitCode = 1;
} finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
