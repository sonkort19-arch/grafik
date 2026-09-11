const fs=require('fs');
const assert=require('assert');

const read=(p)=>fs.readFileSync(p,'utf8');
const count=(text,needle)=>text.split(needle).length-1;

const mainCss=read('styles.css');
const redesign=read('styles-redesign-v5.css');
const stage6=read('styles-stage6.css');
const stage8=read('styles-stage8.css');
const crmFinal=read('crm-final.css');
const crmLegacy=read('crm-final-legacy.css');
const crmStage7=read('crm-stage7.css');
const index=read('index.html');
const crmHtml=read('crm.html');
const manifest=JSON.parse(read('manifest.webmanifest'));
const smenaManifest=JSON.parse(read('smena.webmanifest'));
const smenaInstall=read('smena-install.html');
const serviceWorker=read('sw.js');

assert.strictEqual(count(mainCss,'styles-redesign-v5.css'),1,'main CSS must load redesign shell exactly once');
assert.strictEqual(count(mainCss,'styles-stage6.css'),1,'main CSS must load core module redesign exactly once');
assert.strictEqual(count(mainCss,'styles-stage8.css'),1,'main CSS must load remaining UI redesign exactly once');
assert(!mainCss.includes('styles-stage9.css'),'stage 9 must not add another override stylesheet layer');
assert(mainCss.includes('color-scheme:light'),'main entry stylesheet must lock the approved light UI');
assert(mainCss.includes('input,select,textarea{font-size:16px!important}'),'MA mobile inputs must keep the iPhone no-zoom guard');

assert(redesign.includes('--ma-primary:#246BFD'),'approved MA blue token must remain the primary color');
assert(stage6.includes('этап 6'),'core redesign stylesheet must remain present');
assert(stage8.includes('/assets/ma-assistant-icon-blue.svg'),'assistant launcher must use the final blue MA visual asset');

assert.strictEqual(count(crmFinal,'crm-final-legacy.css'),1,'CRM compatibility styles must load exactly once');
assert.strictEqual(count(crmFinal,'crm-stage7.css'),1,'CRM redesign must load exactly once');
assert(crmFinal.includes('color-scheme:light'),'CRM entry stylesheet must lock the approved light UI');
assert(crmFinal.includes('.phase-add-form input'),'CRM final entry must own the iPhone 16px input guard');
assert(!crmLegacy.includes('input,select,textarea,.phase-add-form input'),'legacy CRM file must not duplicate the centralized iPhone font-size guard');
assert(crmLegacy.includes('crm-ios-delay-autofocus'),'legacy CRM compatibility file must retain active iPhone drawer safeguards');
assert(crmStage7.includes('--crm-primary:#246BFD')||crmStage7.includes('#246BFD'),'CRM redesign must retain the MA blue visual system');

// Mobile readability: compact controls must remain legible on iPhone widths.
assert(crmFinal.includes('Mobile readability audit'),'CRM must retain the mobile readability guard');
assert(crmFinal.includes('width:clamp(148px,46vw,190px)!important'),'global location picker must reserve enough room for “Все точки”');
assert(crmFinal.includes('min-width:148px!important'),'global location picker must not collapse back to the old 105–120px width');
assert(crmFinal.includes('.section-toolbar>select'),'mobile toolbar selects must be allowed to shrink without overflowing');
assert(crmFinal.includes('font-size:10px!important')&&crmFinal.includes('.mobile-bottom-nav button>small'),'CRM bottom navigation labels must remain readable');

assert(index.includes('viewport-fit=cover'),'MA Grafik must retain iPhone safe-area viewport support');
assert(crmHtml.includes('viewport-fit=cover'),'MA CRM must retain iPhone safe-area viewport support');

assert.strictEqual(manifest.background_color,'#F6F7F9','MA Grafik PWA background must match redesign');
assert.strictEqual(manifest.theme_color,'#246BFD','MA Grafik PWA theme must match redesign');
assert.strictEqual(smenaManifest.background_color,'#F6F7F9','MA Smena PWA background must match redesign');
assert.strictEqual(smenaManifest.theme_color,'#246BFD','MA Smena PWA theme must match redesign');
assert(smenaInstall.includes('name="theme-color" content="#246BFD"'),'MA Smena installer must use the final MA blue');
assert(smenaInstall.includes('--bg:#F6F7F9')&&smenaInstall.includes('--blue:#246BFD'),'MA Smena installer must use the final design tokens');
assert(serviceWorker.includes('ma-grafik-2026-09-12-audit-v10'),'service worker version must reflect the final audit release');
assert(!serviceWorker.includes('photo-icon-v9'),'service worker must not keep the stale pre-audit version label');

console.log('final redesign guard: OK');
