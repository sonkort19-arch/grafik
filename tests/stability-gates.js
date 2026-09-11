const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    fail(`Missing required file: ${rel}`);
    return '';
  }
  const content = fs.readFileSync(file, 'utf8');
  if (!content.trim()) fail(`Required file is empty: ${rel}`);
  return content;
}

function cleanRef(value) {
  return value.split('#')[0].split('?')[0].trim();
}

function isExternal(ref) {
  return /^(?:https?:)?\/\//i.test(ref) || /^(?:data:|mailto:|tel:|javascript:|#)/i.test(ref);
}

function localPathFromHtml(htmlFile, ref) {
  const cleaned = cleanRef(ref);
  if (!cleaned || isExternal(cleaned)) return null;
  const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : path.join(path.dirname(htmlFile), cleaned);
  return path.normalize(normalized);
}

function extractRefs(html, regex) {
  const refs = [];
  let match;
  while ((match = regex.exec(html))) refs.push(match[1]);
  return refs;
}

function assertLocalRefsExist(htmlFile) {
  const html = read(htmlFile);
  if (!html) return;

  const scripts = extractRefs(html, /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
  const styles = extractRefs(html, /<link\b(?=[^>]*\brel=["'][^"']*stylesheet[^"']*["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi);
  const refs = [...scripts, ...styles];

  for (const ref of refs) {
    const rel = localPathFromHtml(htmlFile, ref);
    if (!rel) continue;
    if (!fs.existsSync(path.join(ROOT, rel))) {
      fail(`${htmlFile} references missing local asset: ${ref}`);
    }
  }

  const localScripts = scripts
    .map((ref) => localPathFromHtml(htmlFile, ref))
    .filter(Boolean);
  const duplicates = localScripts.filter((item, index) => localScripts.indexOf(item) !== index);
  for (const duplicate of [...new Set(duplicates)]) {
    fail(`${htmlFile} loads the same local script more than once: ${duplicate}`);
  }
}

function assertScriptOrder(htmlFile, expected) {
  const html = read(htmlFile);
  if (!html) return;
  const scripts = extractRefs(html, /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)
    .map(cleanRef)
    .map((ref) => ref.replace(/^\.\//, '').replace(/^\//, ''));

  let previous = -1;
  for (const expectedScript of expected) {
    const index = scripts.indexOf(expectedScript);
    if (index === -1) {
      fail(`${htmlFile} is missing critical script: ${expectedScript}`);
      continue;
    }
    if (index <= previous) {
      fail(`${htmlFile} critical script order changed near: ${expectedScript}`);
    }
    previous = index;
  }
}

function checkClassicJavaScriptSyntax() {
  const files = [];
  for (const name of fs.readdirSync(ROOT)) {
    const full = path.join(ROOT, name);
    if (fs.statSync(full).isFile() && name.endsWith('.js')) files.push(name);
  }

  const testsDir = path.join(ROOT, 'tests');
  if (fs.existsSync(testsDir)) {
    for (const name of fs.readdirSync(testsDir)) {
      const full = path.join(testsDir, name);
      if (fs.statSync(full).isFile() && name.endsWith('.js')) files.push(path.join('tests', name));
    }
  }

  for (const rel of files.sort()) {
    try {
      execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
    } catch (error) {
      const stderr = error.stderr ? error.stderr.toString().trim() : '';
      fail(`JavaScript syntax error in ${rel}${stderr ? `: ${stderr}` : ''}`);
    }
  }
}

function assertSupabaseFunctionClassification() {
  const functionsDir = path.join(ROOT, 'supabase', 'functions');
  if (!fs.existsSync(functionsDir)) {
    fail('Missing Supabase functions directory');
    return;
  }

  // Strict functions are Deno type-checked in CI. Legacy functions are explicitly
  // classified so existing technical debt cannot silently spread to new modules.
  const strictFunctions = new Set([
    'ma-grafik-write-api',
    'ma-grafik-mcp',
    'ma-grafik-attendance-api',
    'ma-crm-api',
    'ma-crm-phase1-api',
    'ma-crm-inventory-api',
    'ma-crm-finance-api',
    'ma-crm-final-api',
    'ma-shifts'
  ]);
  const legacyFunctions = new Set(['ma-grafik-api']);
  const classified = new Set([...strictFunctions, ...legacyFunctions]);

  const actual = fs.readdirSync(functionsDir)
    .filter((name) => fs.existsSync(path.join(functionsDir, name, 'index.ts')))
    .sort();

  for (const name of actual) {
    if (!classified.has(name)) {
      fail(`New Supabase function is not classified for CI: ${name}`);
    }
  }

  for (const name of classified) {
    if (!actual.includes(name)) {
      fail(`CI classifies a Supabase function that no longer exists: ${name}`);
    }
  }
}

[
  'index.html',
  'crm.html',
  'schedule.js',
  'shifts.js',
  'employees.js',
  'supabase.js',
  'app.js',
  'crm.js',
  'crm-phase1.js',
  'crm-inventory.js',
  'crm-finance.js',
  'crm-final.js',
  'crm-location.js'
].forEach(read);

assertLocalRefsExist('index.html');
assertLocalRefsExist('crm.html');

assertScriptOrder('index.html', [
  'schedule.js',
  'shifts.js',
  'employees.js',
  'supabase.js',
  'wallets.js',
  'admin.js',
  'errors.js',
  'settings.js',
  'devices.js',
  'history.js',
  'kpi.js',
  'safety.js',
  'app.js'
]);

assertScriptOrder('crm.html', [
  'crm-phase1.js',
  'crm-inventory.js',
  'crm-finance.js',
  'crm-final.js',
  'crm.js',
  'crm-location.js'
]);

const manifestPath = path.join(ROOT, 'manifest.webmanifest');
if (fs.existsSync(manifestPath)) {
  try {
    JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`manifest.webmanifest is invalid JSON: ${error.message}`);
  }
}

assertSupabaseFunctionClassification();
checkClassicJavaScriptSyntax();

if (failures.length) {
  console.error('\nSTABILITY GATES FAILED');
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log('STABILITY GATES OK');
