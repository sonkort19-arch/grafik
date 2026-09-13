const { test, expect } = require('@playwright/test');

const FUNCTIONS = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';
const clone = value => JSON.parse(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round2 = value => Math.round(Number(value || 0) * 100) / 100;

function makeRepair(edge = false) {
  const long = edge ? 'ОченьДлинноеЗначениеБезПробелов'.repeat(12) : '';
  return {
    id: 'destroyer-order-1',
    order_no: 9001,
    customer_id: 'destroyer-customer-1',
    service: 'Моба',
    device: edge ? `Телефон ${long}` : 'Телефон',
    model: edge ? `iPhone ${long}` : 'iPhone 15',
    imei: edge ? '9'.repeat(80) : '123456789012345',
    issue: edge ? `Неисправность ${'очень длинное описание '.repeat(80)}` : 'Не включается',
    comment: edge ? 'Комментарий '.repeat(300) : 'Destroyer QA mock',
    estimated_price: edge ? 99999999 : 1500,
    final_price: edge ? 99999999 : 1500,
    manager: edge ? '' : 'Тест Менеджер',
    master: edge ? '' : 'Георгий',
    status: 'in_work',
    accepted_at: '2026-09-13T08:00:00.000Z',
    updated_at: '2026-09-13T08:30:00.000Z',
    due_at: '2026-09-14T12:00:00.000Z',
    warranty_days: 14,
    warranty_note: edge ? 'Гарантия '.repeat(80) : '14 дней',
    issued_at: null,
    customer: {
      id: 'destroyer-customer-1',
      name: edge ? `Клиент ${long}` : 'Тест Клиент',
      phone: edge ? '' : '+7 900 000-00-00',
      phone_normalized: edge ? '' : '79000000000',
    },
  };
}

const STATUSES = [
  ['accepted', 'Принят'],
  ['diagnostics', 'Диагностика'],
  ['in_work', 'В работе'],
  ['waiting_part', 'Ждём запчасть'],
  ['ready', 'Готов'],
  ['issued', 'Выдан'],
].map(([code, name], index) => ({
  code,
  name,
  group_code: code === 'issued' ? 'closed_success' : code === 'ready' ? 'ready' : 'work',
  sort_order: index * 10,
  actions: {},
}));

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `destroyer-item-${index + 1}`,
    repair_id: 'destroyer-order-1',
    item_type: 'service',
    display_type: 'service',
    title: index === 0 ? 'Диагностика' : `Позиция ${index + 1} ${index % 7 === 0 ? 'ОченьДлинноеНазваниеБезПробелов'.repeat(4) : ''}`,
    quantity: index % 11 === 0 ? 0.5 : 1,
    unit_price: index % 13 === 0 ? 0.01 : 100 + index,
    unit_cost: index % 5 === 0 ? 150 + index : 0,
    discount_amount: 0,
    executor: index % 3 === 0 ? '' : 'Георгий',
    service_catalog_id: null,
    inventory_product_id: null,
  }));
}

async function installDestroyerMocks(page, { edge = false } = {}) {
  const state = {
    repair: makeRepair(edge),
    items: edge ? makeItems(100) : makeItems(3),
    payments: [],
    events: [],
    payroll: [],
    writes: Object.create(null),
    attempts: Object.create(null),
    detailMode: 'ok',
    commerceMode: 'ok',
    delayMs: 0,
  };

  const count = key => {
    state.attempts[key] = (state.attempts[key] || 0) + 1;
  };
  const write = key => {
    state.writes[key] = (state.writes[key] || 0) + 1;
  };
  const totals = () => {
    const itemsTotal = round2(state.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0) - Number(item.discount_amount || 0), 0));
    const cost = round2(state.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0));
    const paid = round2(state.payments.reduce((sum, payment) => sum + (payment.kind === 'refund' ? -1 : 1) * Number(payment.amount || 0), 0));
    const orderTotal = state.items.length ? itemsTotal : Number(state.repair.final_price || state.repair.estimated_price || 0);
    return { itemsTotal, cost, profit: round2(itemsTotal - cost), paid, orderTotal, balance: round2(orderTotal - paid) };
  };
  const detail = () => ({
    ok: true,
    repair: clone(state.repair),
    history: [],
    paymentSummary: {
      paid: totals().paid,
      total: totals().orderTotal,
      remaining: totals().balance,
      payments: clone(state.payments),
    },
    customerHistory: { repairs: [], sales: [] },
    statuses: clone(STATUSES),
  });
  const commerce = () => ({
    ok: true,
    repair: {
      id: state.repair.id,
      service: state.repair.service,
      estimated_price: state.repair.estimated_price,
      final_price: totals().orderTotal,
      due_at: state.repair.due_at,
      warranty_days: state.repair.warranty_days,
      warranty_note: state.repair.warranty_note,
    },
    items: clone(state.items),
    payments: clone(state.payments),
    totals: totals(),
  });

  await page.addInitScript(() => {
    localStorage.setItem('ma_crm_session_v1', 'e2e.destroyer.session');
    localStorage.setItem('ma_crm_employee_v1', 'Тест Менеджер');
  });

  await page.route(`${FUNCTIONS}**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      try { await route.fulfill({ status: 200, body: 'ok' }); } catch (_) {}
      return;
    }
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch (_) {}
    const slug = new URL(request.url()).pathname.split('/').pop();
    const op = String(body.op || '');
    const key = `${slug}:${op}`;
    count(key);

    if (state.delayMs > 0 && (op === 'detail' || op === 'commerce')) await sleep(state.delayMs);

    const fulfill = async (data, status = 200, contentType = 'application/json') => {
      try {
        await route.fulfill({
          status,
          contentType,
          headers: { 'access-control-allow-origin': '*' },
          body: typeof data === 'string' ? data : JSON.stringify(data),
        });
      } catch (_) {}
    };

    if (slug === 'ma-crm-api') {
      if (op === 'bootstrap') {
        await fulfill({
          ok: true,
          actor: { kind: 'admin', employee: 'Администратор', role: 'admin' },
          services: ['Моба', 'Нова'],
          employees: [
            { name: 'Тест Менеджер', role: 'manager' },
            { name: 'Георгий', role: 'master' },
          ],
        });
        return;
      }
      if (op === 'list-repairs') {
        await fulfill({ ok: true, repairs: [{ ...clone(state.repair), final_price: totals().orderTotal }] });
        return;
      }
      if (op === 'list-sales') {
        await fulfill({ ok: true, sales: [] });
        return;
      }
      if (op === 'issue-repair') {
        write(op);
        await fulfill({ ok: false, error: 'Destroyer не проводит реальные выдачи' }, 500);
        return;
      }
      await fulfill({ ok: true });
      return;
    }

    if (slug === 'ma-crm-order-api') {
      if (op === 'detail') {
        if (state.detailMode === '429') return fulfill({ ok: false, error: 'Слишком много запросов' }, 429);
        if (state.detailMode === '500') return fulfill({ ok: false, error: 'Ошибка detail' }, 500);
        if (state.detailMode === 'malformed') return fulfill('{broken-json', 200, 'application/json');
        await fulfill(detail());
        return;
      }
      if (op === 'commerce') {
        if (state.commerceMode === '429') return fulfill({ ok: false, error: 'Слишком много запросов' }, 429);
        if (state.commerceMode === '500') return fulfill({ ok: false, error: 'Ошибка commerce' }, 500);
        if (state.commerceMode === 'malformed') return fulfill('{broken-json', 200, 'application/json');
        await fulfill(commerce());
        return;
      }
      if (op === 'catalog') {
        await fulfill({
          ok: true,
          repair: { id: state.repair.id, service: state.repair.service },
          categories: [{ id: 'destroyer-cat', name: 'Модулька', sort_order: 1, services: [] }],
          uncategorizedServices: [],
          products: [],
          employees: [{ name: 'Георгий', employee: 'Георгий', role: 'master' }],
        });
        return;
      }
      if (op === 'events') return fulfill({ ok: true, events: clone(state.events) });
      if (op === 'payroll-entries') return fulfill({ ok: true, entries: clone(state.payroll) });
      if (op === 'set-status') {
        write(op);
        state.repair.status = String(body.status || state.repair.status);
        await fulfill({ ok: true, repair: clone(state.repair), result: { newStatus: state.repair.status } });
        return;
      }
      if (op === 'update-order') {
        write(op);
        await fulfill({ ok: true, repair: clone(state.repair) });
        return;
      }
      if (op === 'upsert-item' || op === 'delete-item' || op === 'add-payment') {
        write(op);
        await fulfill({ ...commerce(), ok: true, result: { duplicate: false } });
        return;
      }
      await fulfill({ ok: true });
      return;
    }

    if (slug === 'ma-crm-final-api') {
      if (op === 'repair-tools') {
        await fulfill({ ok: true, repair: { ...clone(state.repair), warranty_until: '2026-10-15T00:00:00.000Z' }, parent: null, files: [], canCreateWarranty: false });
        return;
      }
      await fulfill({ ok: true, rows: [], files: [], total: 0 });
      return;
    }
    if (slug === 'ma-crm-phase1-api') return fulfill(commerce());
    if (slug === 'ma-crm-finance-api') return fulfill({ ok: true, rows: [], transactions: [], cashboxes: [], totals: {} });
    if (slug === 'ma-crm-inventory-api') return fulfill({ ok: true, rows: [], products: [], stock: [] });
    await fulfill({ ok: true });
  });

  return state;
}

function collectUnexpected(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror:${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (!url.includes('supabase.co/functions/v1/')) errors.push(`requestfailed:${url}`);
  });
  return errors;
}

async function openOrder(page, testInfo) {
  await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#crmMain')).toBeVisible();
  await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');
  const mobile = testInfo.project.name === 'iphone-webkit';
  const nav = mobile ? page.locator('#mobileBottomNav [data-view="orders"]') : page.locator('.sidebar-nav .nav-item[data-view="orders"]');
  mobile ? await nav.tap() : await nav.click();
  const row = mobile ? page.locator('#repairMobileList [data-repair-id="destroyer-order-1"]') : page.locator('#repairTableBody [data-repair-id="destroyer-order-1"]');
  await expect(row).toBeVisible();
  mobile ? await row.tap() : await row.click();
  await expect(page.locator('#repairDetailOverlay')).toBeVisible();
  await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №9001');
  await expect(page.locator('#phase1Root')).toBeVisible();
}

async function safeTap(locator) {
  try {
    if (await locator.isVisible()) await locator.tap({ timeout: 1500 });
  } catch (_) {}
}

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

test.describe('MA CRM ORDER DESTROYER QA', () => {
  test('iPhone touch torture keeps taps, scroll and rotation usable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Touch torture is iPhone/WebKit specific.');
    const errors = collectUnexpected(page);
    const state = await installDestroyerMocks(page);
    await openOrder(page, testInfo);

    for (const tab of ['items', 'payments', 'history', 'files', 'general', 'items', 'general']) {
      await page.locator(`#hcOrderTabs [data-hc-tab="${tab}"]`).tap();
      await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    }

    await page.locator('#repairDetailOverlay').evaluate(el => { el.scrollTop = 900; });
    await page.waitForTimeout(80);
    await page.locator('#hcOrderTabs [data-hc-tab="payments"]').tap();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(120);
    await page.locator('#hcOrderTabs [data-hc-tab="general"]').tap();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.hc-edit-toggle').tap();
    await page.locator('#detailModel').focus();
    await page.locator('#detailModel').fill('iPhone 15 — touch torture');
    await page.keyboard.press('Escape').catch(() => {});

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(Object.values(state.writes).reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('edge payload with 100 positions and long text does not break layout', async ({ page }, testInfo) => {
    const errors = collectUnexpected(page);
    await installDestroyerMocks(page, { edge: true });
    await openOrder(page, testInfo);
    const mobile = testInfo.project.name === 'iphone-webkit';
    const itemsTab = page.locator('#hcOrderTabs [data-hc-tab="items"]');
    mobile ? await itemsTab.tap() : await itemsTab.click();
    await expect(page.locator('#phaseItemRows .phase-line')).toHaveCount(100);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('network chaos recovers after 429, malformed JSON and 500 without reopening stale markup', async ({ page }, testInfo) => {
    const errors = collectUnexpected(page);
    const state = await installDestroyerMocks(page);
    await openOrder(page, testInfo);

    state.commerceMode = '429';
    await page.evaluate(() => window.MAOrderController.refreshSection('commerce', { force: true }).catch(() => null));
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();

    state.commerceMode = 'malformed';
    await page.evaluate(() => window.MAOrderController.refreshSection('commerce', { force: true }).catch(() => null));
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();

    state.commerceMode = '500';
    await page.evaluate(() => window.MAOrderController.refreshSection('commerce', { force: true }).catch(() => null));
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();

    state.commerceMode = 'ok';
    const recovered = await page.evaluate(() => window.MAOrderController.refreshSection('commerce', { force: true }).then(value => Boolean(value)).catch(() => false));
    expect(recovered).toBe(true);
    await expect(page.locator('#phase1Root')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('deterministic two-minute iPhone monkey session produces no JS errors or writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Monkey session is focused on iPhone/WebKit.');
    test.setTimeout(150_000);
    const errors = collectUnexpected(page);
    const state = await installDestroyerMocks(page);
    await openOrder(page, testInfo);

    const rnd = seeded(20260913);
    const tabs = ['general', 'items', 'payments', 'history', 'files'];
    const deadline = Date.now() + 120_000;
    let actions = 0;

    while (Date.now() < deadline) {
      const choice = Math.floor(rnd() * 8);
      if (choice <= 2) {
        await safeTap(page.locator(`#hcOrderTabs [data-hc-tab="${tabs[Math.floor(rnd() * tabs.length)]}"]`));
      } else if (choice === 3) {
        await page.locator('#repairDetailOverlay').evaluate((el, amount) => { el.scrollTop = Math.max(0, el.scrollTop + amount); }, rnd() > 0.5 ? 350 : -350).catch(() => {});
      } else if (choice === 4) {
        await safeTap(page.locator('.hc-edit-toggle'));
      } else if (choice === 5) {
        await safeTap(page.locator('.hc-status-current'));
        await page.keyboard.press('Escape').catch(() => {});
      } else if (choice === 6) {
        await safeTap(page.locator('.hc-add-toggle'));
        await safeTap(page.locator('.ma-item-close'));
      } else {
        const landscape = rnd() > 0.5;
        await page.setViewportSize(landscape ? { width: 844, height: 390 } : { width: 390, height: 844 });
      }
      actions++;
      await page.waitForTimeout(80 + Math.floor(rnd() * 120));
    }

    expect(actions).toBeGreaterThan(30);
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    expect(Object.values(state.writes).reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(errors).toEqual([]);
  });
});
