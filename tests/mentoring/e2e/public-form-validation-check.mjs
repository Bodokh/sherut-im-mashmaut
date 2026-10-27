import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const origin = new URL(process.env.MENTORING_BASE_URL || 'http://localhost:3100');
if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || !['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('Only a localhost HTTP(S) origin is permitted');
const artifacts = '/tmp/sherut-form-validation-2026-10-27/public';
await mkdir(artifacts, { recursive: true });
const require = createRequire('/Users/bodokh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
const page = await context.newPage();
page.setDefaultTimeout(8000);
const results = [], jsErrors = [], expectedMockConsoleErrors = [], requests = [];
let responseStatus = 200, holdNext = false, pendingCaptured, releaseResponse;
page.on('pageerror', e => jsErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') { const entry = { message: m.text().replace(/https?:\/\/\S+/g, '[URL]'), source: m.location().url }; if (entry.source.endsWith('/api/contact') && entry.message.includes('502 (Bad Gateway)')) expectedMockConsoleErrors.push(entry); else jsErrors.push(entry); } });
await context.route('**/api/contact', async route => {
  requests.push(route.request().postDataJSON());
  if (holdNext) { holdNext = false; pendingCaptured?.(); await new Promise(resolve => { releaseResponse = resolve; }); }
  await route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(responseStatus === 200 ? { success: true } : { error: 'email_send_failed' }) });
});
async function scenario(name, fn) {
  const started = Date.now();
  try { const evidence = await fn(); results.push({ name, status: 'passed', ms: Date.now() - started, ...evidence }); console.log('PASS', name); }
  catch (e) { const screenshot = resolve(artifacts, `failure-${results.length + 1}.png`); await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {}); results.push({ name, status: 'failed', ms: Date.now() - started, error: e.message, screenshot }); console.log('FAIL', name, e.message); }
}
async function go(path) { await page.goto(origin.origin + path, { waitUntil: 'load', timeout: 60000 }); await page.waitForFunction(() => { const form = document.querySelector('form'); return !form || Object.keys(form).some(k => k.startsWith('__reactProps')); }, null, { timeout: 30000 }); }
async function fillValid(prefix) { await page.locator(`#${prefix}-name`).fill('Test Person'); await page.locator(`#${prefix}-email`).fill('valid@example.com'); await page.locator(`#${prefix}-message`).fill('Test message'); }
async function submit(prefix) { await page.locator(`#${prefix}-name`).locator('xpath=ancestor::form').locator('button[type=submit]').click(); }
async function assertFieldError(prefix, field) { const input = page.locator(`#${prefix}-${field}`); await page.locator(`#${prefix}-${field}-error`).waitFor({ state: 'visible', timeout: 5000 }); assert.equal(await input.getAttribute('aria-invalid'), 'true'); assert.ok((await input.getAttribute('aria-describedby'))?.includes(`${prefix}-${field}-error`)); }
try {
  await scenario('Current public contact code is running', async () => { await go('/contact'); await page.locator('[data-slot=phone-input]').waitFor({ state:'visible', timeout: 10000 }); return { port: origin.port }; });
  for (const [locale, route] of [['he','/contact'], ['en','/en/contact']]) {
    await scenario(`${locale} contact empty and whitespace errors, focus, required semantics`, async () => {
      await go(route); await page.locator('[data-slot=phone-input]').waitFor({ state:'visible' }); const before = requests.length;
      for (const id of ['name','email','message']) assert.equal(await page.locator(`#contact-${id}`).getAttribute('required'), '');
      assert.equal(await page.locator('#contact-phone').getAttribute('required'), null);
      await submit('contact'); for (const field of ['name','email','message']) await assertFieldError('contact', field);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'contact-name'); assert.equal(requests.length, before);
      await page.locator('#contact-name').fill('   '); await page.locator('#contact-email').fill('bad-email'); await page.locator('#contact-message').fill('    '); await submit('contact');
      for (const field of ['name','email','message']) await assertFieldError('contact', field); assert.equal(requests.length, before);
      return { mockedDeliveryRequests: 0, focused: 'contact-name' };
    });
    await scenario(`${locale} contact length limits and optional invalid phone`, async () => {
      await go(route); await page.locator('[data-slot=phone-input]').waitFor({ state:'visible' }); await fillValid('contact');
      for (const [id,max] of [['name',100],['email',254],['message',5000]]) { const input = page.locator(`#contact-${id}`); assert.equal(Number(await input.getAttribute('maxlength')), max); await input.fill('a'.repeat(max+10)); assert.equal((await input.inputValue()).length,max); }
      await fillValid('contact'); await page.locator('#contact-phone').fill('05012'); await page.locator('#contact-email').focus(); await submit('contact'); await assertFieldError('contact','phone');
      await page.locator('#contact-phone').clear(); const before = requests.length; await submit('contact'); await page.getByRole('status').waitFor({ state:'visible' }); assert.equal(requests.length, before+1); assert.equal(requests.at(-1).phone, '');
      return { delivery: 'mocked success', optionalClear: true };
    });
    await scenario(`${locale} contact local typing, international paste, failure retry`, async () => {
      await go(route); await page.locator('[data-slot=phone-input]').waitFor({ state:'visible' }); await fillValid('contact');
      const trigger = page.locator('[data-slot=phone-input] button').first(); assert.match(await trigger.innerText(), /\+972/);
      await page.locator('#contact-phone').pressSequentially('0501234567'); responseStatus = 502; const before = requests.length; await submit('contact');
      await page.getByRole('alert').last().waitFor({ state:'visible' }); assert.equal(requests.length,before+1); assert.equal(requests.at(-1).phone,'+972501234567'); assert.equal(await page.locator('#contact-name').inputValue(),'Test Person');
      responseStatus = 200; await submit('contact'); await page.getByRole('status').waitFor({ state:'visible' }); assert.equal(requests.at(-1).phone,'+972501234567');
      await page.locator('form [role=status] button').click(); await fillValid('contact');
      await page.locator('#contact-phone').focus(); await page.keyboard.insertText('+14155552671'); await submit('contact'); await page.getByRole('status').waitFor({ state:'visible' }); assert.equal(requests.at(-1).phone,'+14155552671');
      return { delivery:'mocked error then success', local:'+972501234567', pasted:'+14155552671' };
    });
    await scenario(`${locale} country search keyboard and long phone input`, async () => {
      await go(route); await page.locator('[data-slot=phone-input]').waitFor({ state:'visible' });
      await page.locator('[data-slot=phone-input] button').first().click(); const search = page.getByLabel(locale === 'he' ? 'חיפוש מדינה' : 'Search country', { exact: true }); await search.waitFor({state:'visible'}); await search.fill(locale === 'he' ? 'ארצות הברית' : 'United States'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      assert.match(await page.locator('[data-slot=phone-input] button').first().innerText(), /\+1/);
      const phone = page.locator('#contact-phone'); await phone.fill('1234567890123456789012345678901234567890'); await phone.blur();
      assert.equal(await phone.getAttribute('aria-invalid'), 'true'); const described = await phone.getAttribute('aria-describedby'); assert.ok(described); assert.ok(await page.locator(`#${described.split(' ').at(-1)}`).isVisible());
      return { keyboardSelection: '+1', longNumberInvalid: true };
    });
  }
  for (const [locale, route] of [['he','/contact'],['en','/en/contact']]) await scenario(`${locale} contact pending submission locks all controls and resets on success`, async () => {
    await go(route); await page.locator('[data-slot=phone-input]').waitFor({state:'visible'}); await fillValid('contact');
    const phone=page.locator('#contact-phone'), picker=page.locator('[data-slot=phone-input] button').first();
    await phone.fill('0501234567'); const originalPhone=await phone.inputValue();
    const captured = new Promise(resolve => { pendingCaptured=resolve; }); holdNext=true; responseStatus=200;
    try {
      await submit('contact'); await captured;
      const form=page.locator('form').first();
      for (const control of ['#contact-name','#contact-email','#contact-phone','#contact-topic','#contact-message','button[type=submit]']) assert.equal(await form.locator(control).isDisabled(), true, `${control} remains enabled while sending`);
      assert.equal(await picker.isDisabled(), true, 'country picker remains enabled while sending');
      await assert.rejects(phone.fill('0509999999',{timeout:500})); await assert.rejects(picker.click({timeout:500}));
      assert.equal(await phone.inputValue(),originalPhone); assert.equal(await page.locator('#contact-name').inputValue(),'Test Person');
      releaseResponse(); releaseResponse=undefined; await form.getByRole('status').waitFor({state:'visible'}); await form.getByRole('status').getByRole('button').click();
      for(const id of ['name','email','phone','message']) assert.equal(await page.locator(`#contact-${id}`).inputValue(),'');
      assert.equal(await picker.isEnabled(),true);
      return { delivery:'mocked delayed success', locked:['name','email','phone','country','topic','message','submit'], reset:true };
    } finally { if (releaseResponse) { releaseResponse(); releaseResponse=undefined; } holdNext=false; pendingCaptured=undefined; }
  });
  for (const [locale, route] of [['he','/'],['en','/en']]) {
    await scenario(`${locale} comments validation, blur, retry and mocked success`, async () => {
      await go(route); await page.locator('#comment-name').waitFor({state:'visible'}); const before=requests.length;
      await submit('comment'); for (const field of ['name','email','message']) await assertFieldError('comment',field); assert.equal(await page.evaluate(() => document.activeElement?.id),'comment-name'); assert.equal(requests.length,before);
      await page.locator('#comment-name').fill(' '); await page.locator('#comment-email').fill('bad'); await page.locator('#comment-message').fill('1234'); await submit('comment'); for (const field of ['name','email','message']) await assertFieldError('comment',field); assert.equal(requests.length,before);
      await fillValid('comment'); responseStatus=502; await submit('comment'); await page.locator('#comment-name').locator('xpath=ancestor::form').getByRole('alert').last().waitFor({state:'visible'}); assert.equal(await page.locator('#comment-name').inputValue(),'Test Person');
      responseStatus=200; await submit('comment'); await page.locator('#comments [role=status]').waitFor({state:'visible'}); assert.equal(requests.length,before+2); return { delivery:'mocked error then success' };
    });
  }
  for (const [locale, route, prefix] of [['he','/contact','contact'],['en','/en/contact','contact'],['he','/','comment'],['en','/en','comment']]) await scenario(`${locale} ${prefix} minimum boundaries and translated errors`, async () => {
    await go(route); await page.locator(`#${prefix}-name`).waitFor({state:'visible'}); await fillValid(prefix);
    const name=page.locator(`#${prefix}-name`), message=page.locator(`#${prefix}-message`), email=page.locator(`#${prefix}-email`);
    for (const [input,max] of [[name,100],[email,254],[message,5000]]) { assert.equal(await input.getAttribute('required'),''); assert.equal(Number(await input.getAttribute('maxlength')),max); await input.fill('x'.repeat(max+1)); assert.equal((await input.inputValue()).length,max); }
    await fillValid(prefix); await name.fill('A'); await message.fill('1234'); await email.fill('bad'); const before=requests.length; await submit(prefix);
    for(const field of ['name','email','message']) { await assertFieldError(prefix,field); const text=await page.locator(`#${prefix}-${field}-error`).innerText(); assert.match(text,locale==='he'?/[א-ת]/:/[a-z]/i); }
    assert.equal(requests.length,before); await name.fill('AB'); await email.fill('valid@example.com'); await message.fill('12345'); responseStatus=200; await submit(prefix); await page.locator(prefix==='contact'?'form [role=status]':'#comments [role=status]').waitFor({state:'visible'}); assert.equal(requests.length,before+1); return { minimumAccepted:{name:2,message:5},delivery:'mocked success' };
  });
  for (const path of ['/contact','/en/contact','/','/en','/staff/login','/staff/signup']) await scenario(`mobile viewport ${path}`, async () => { await page.setViewportSize({width:390,height:844}); await go(path); await page.locator('h1').first().waitFor({state:'visible'}); const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir})); assert.ok(metrics.scrollWidth<=metrics.width+1, JSON.stringify(metrics)); const screenshot=resolve(artifacts,`mobile-${path.replaceAll('/','-')||'home'}.png`); await page.screenshot({path:screenshot,fullPage:true}); return { ...metrics,screenshot }; });
  await page.setViewportSize({width:1440,height:1000}); await go('/contact'); await page.locator('[data-slot=phone-input]').waitFor({state:'visible'}); await page.screenshot({path:resolve(artifacts,'desktop-contact.png'),fullPage:true});
  for (const [path,prefix] of [['/staff/login','staff'],['/staff/signup','signup']]) await scenario(`${path} anonymous field validation`, async () => {
    await go(path); const email=page.locator(`#${prefix}-email`), password=page.locator(`#${prefix}-password`); await email.waitFor({state:'visible'}); await page.waitForFunction(id=>!document.getElementById(id)?.disabled,`${prefix}-email`,{timeout:30000});
    const form=email.locator('xpath=ancestor::form'); await form.locator('button[type=submit]').click(); assert.equal(await email.getAttribute('aria-invalid'),'true'); assert.equal(await password.getAttribute('aria-invalid'),'true'); assert.ok(await email.getAttribute('aria-describedby')); assert.ok(await password.getAttribute('aria-describedby'));
    await email.fill('bad'); await password.fill('   '); await form.locator('button[type=submit]').click(); assert.equal(await email.getAttribute('aria-invalid'),'true'); assert.equal(await password.getAttribute('aria-invalid'),'true');
    assert.equal(Number(await email.getAttribute('maxlength')),254); await email.fill('a'.repeat(260)); assert.equal((await email.inputValue()).length,254); assert.equal(Number(await password.getAttribute('maxlength')),512); await password.fill('x'.repeat(520)); assert.equal((await password.inputValue()).length,512);
    if(prefix==='signup') { assert.equal(Number(await password.getAttribute('minlength')),15); await password.fill('x'.repeat(14)); await password.blur(); assert.equal(await password.getAttribute('aria-invalid'),'true'); await password.fill('x'.repeat(15)); await password.blur(); assert.equal(await password.getAttribute('aria-invalid'),'false'); }
    assert.equal(await password.getAttribute('type'),'password'); return { noValidCredentialsSubmitted:true, passwordVisibilityControlCount:await form.getByRole('button',{name:/show|hide|הצג|הסתר/i}).count() };
  });
  await scenario('No browser uncaught or console errors',async()=>{ assert.deepEqual(jsErrors,[]); return { unexpectedCount:jsErrors.length, expectedMock502Count:expectedMockConsoleErrors.length }; });
} finally {
  await browser.close();
  const report={baseURL:origin.origin,checkedAt:new Date().toISOString(),results,jsErrors,expectedMockConsoleErrors,delivery:'All browser /api/contact requests are intercepted and mocked; no real API delivery is exercised.',notTested:['Real API submission and provider email delivery','Valid authentication, signup, password reset and verification','Authenticated staff workflows','Country picker all countries'],summary:{passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length}};
  const path=resolve(artifacts,'report.json'); await writeFile(path,JSON.stringify(report,null,2)); console.log(JSON.stringify({path,summary:report.summary,failures:results.filter(r=>r.status==='failed'),jsErrors},null,2)); if(report.summary.failed) process.exitCode=1;
}
