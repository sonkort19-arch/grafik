const { test, expect } = require('@playwright/test');

const SUPABASE_FUNCTIONS = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';
const clone = value => JSON.parse(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function repair() {
  return {
    id: 'repair-resilience-1',
    order_no: 5607,
    customer_id: 'customer-resilience-1',
    service: 'Мобильный Ангел',
    device: 'Телефон',
    model: 'iPhone 14',
    imei: '111111111111111',
    issue: 'Тест отказоустойчивости',
    comment: 'Только mock-данные',
    estimated_price: 500,
    final_price: 500,
    manager: 'Тест Менеджер',
    master: 'Георгий',
    status: 'in_work',
    accepted_at: '2026-09-13T08:00:00.000Z',
    updated_at: '2026-09-13T08:30:00.000Z',
    due_at: '2026-09-14T12:00:00.000Z',
    warranty_days: 14,
    warranty_note: 'Тест',
    issued_at: null,
    customer: {
      id: 'customer-resilience-1',
      name: 'Тест Клиент',
      phone: '+7 900 000-00-00',
      phone_normalized: '79000000000',
    },
  };
}

const statuses = [
  ['accepted', 'Принят'],
  ['diagnostics', 'Диагностика'],
  ['in_work', 'В работе'],
  ['waiting_part', 'Ждём запчасть'],
  ['ready', 'Готов'],
  ['issued', 'Выдан'],
].map(([code, name], index) => ({ code, name, sort_order: index * 10, group_code: code === 'issued' ? 'closed_success' : 'work', actions: {} }));

async function installMocks(page) {
  const state = {
    repair: repair(),
    detailMode: 'ok',
    detailDelayMs: 0,
    commerceMode: 'ok',
    setStatusMode: 'ok',
    issueMode: 'ok',
    attempts: Object.create(null),
  };

  const commerce = () => ({
    ok: true,
    repair: {
      id: state.repair.id,
      service: state.repair.service,
      estimated_price: state.repair.estimated_price,
      final_price: state.repair.final_price,
      due_at: state.repair.due_at,
      warranty_days: state.repair.warranty_days,
      warranty_note: state.repair.warranty_note,
    },
    items: [{
      id: 'item-resilience-1',
      repair_id: state.repair.id,
      item_type: 'service',
      display_type: 'service',
      title: 'Диагностика',
      quantity: 1,
      unit_price: 500,
      unit_cost: 0,
      discount_amount: 0,
      executor: 'Георгий',
    }],
    payments: [{
      id: 'payment-resilience-1',
      repair_id: state.repair.id,
      kind: 'payment',
      category: 'deposit',
      method: 'cash',
      amount: 100,
      created_at: '2026-09-13T08:10:00.000Z',
      created_by: 'Тест Менеджер',
    }],
    totals: { itemsTotal: 500, cost: 0, profit: 500, paid: 100, orderTotal: 500, balance: 400 },
  });

  const detail = () => ({
    ok: true,
    repair: clone(state.repair),
    history: [],
    paymentSummary: { paid: 100, total: 500, remaining: 400, payments: clone(commerce().payments) },
    customerHistory: { repairs: [], sales: [] },
    statuses: clone(statuses),
  });

  await page.addInitScript(() => {
    localStorage.setItem('ma_crm_session_v1', 'e2e.resilience.session');
    localStorage.setItem('ma_crm_employee_v1', 'Тест Менеджер');
  });

  await page.route(`${SUPABASE_FUNCTIONS}**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      try { await route.fulfill({ status: 200, body: 'ok' }); } catch (_) {}
      return;
    }
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch (_) {}
    const slug = new URL(request.url()).pathname.split('/').pop();
    const op = String(body.op || '');
    state.attempts[`${slug}:${op}`] = (state.attempts[`${slug}:${op}`] || 0) + 1;
    const reply = async (data, status = 200) => {
      try {
        await route.fulfill({
          status,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(data),
        });
      } catch (_) {}
    };

    if (slug === 'ma-crm-api') {
      if (op === 'bootstrap') {
        await reply({
          ok: true,
          actor: { kind: 'admin', employee: 'Администратор', role: 'admin' },
          services: ['Мобильный Ангел'],
          employees: [
            { name: 'Тест Менеджер', role: 'manager' },
            { name: 'Георгий', role: 'master' },
          ],
        });
        return;
      }
      if (op === 'list-repairs') {
        await reply({ ok: true, repairs: [{
          id: state.repair.id,
          order_no: state.repair.order_no,
          customer: clone(state.repair.customer),
          customer_id: state.repair.customer_id,
          service: state.repair.service,
          device: state.repair.device,
          model: state.repair.model,
          imei: state.repair.imei,
          issue: state.repair.issue,
          status: state.repair.status,
          master: state.repair.master,
          manager: state.repair.manager,
          estimated_price: state.repair.estimated_price,
          final_price: state.repair.final_price,
          accepted_at: state.repair.accepted_at,
          updated_at: state.repair.updated_at,
        }] });
        return;
      }
      if (op === 'list-sales') {
        await reply({ ok: true, sales: [] });
        return;
      }
      if (op === 'issue-repair') {
        if (state.issueMode === '500') {
          await reply({ ok: false, error: 'Тестовая ошибка выдачи' }, 500);
          return;
        }
        state.repair.status = 'issued';
        state.repair.issued_at = '2026-09-13T10:00:00.000Z';
        await reply({ ok: true, repair: clone(state.repair), result: { issued: true } });
        return;
      }
      await reply({ ok: true });
      return;
    }

    if (slug === 'ma-crm-order-api') {
      if (op === 'detail') {
        if (state.detailDelayMs > 0) await sleep(state.detailDelayMs);
        if (state.detailMode === '401') {
          await reply({ ok: false, error: 'Сессия закончилась. Войдите снова.' }, 401);
          return;
        }
        if (state.detailMode === '500') {
          await reply({ ok: false, error: 'Тестовая ошибка загрузки заказа' }, 500);
          return;
        }
        await reply(detail());
        return;
      }
      if (op === 'commerce') {
        if (state.commerceMode === '500') {
          await reply({ ok: false, error: 'Тестовая ошибка товаров и платежей' }, 500);
          return;
        }
        await reply(commerce());
        return;
      }
      if (op === 'catalog') {
        await reply({ ok: true, repair: { id: state.repair.id, service: state.repair.service }, categories: [], products: [], employees: [] });
        return;
      }
      if (op === 'events') {
        await reply({ ok: true, events: [] });
        return;
      }
      if (op === 'payroll-entries') {
        await reply({ ok: true, entries: [] });
        return;
      }
      if (op === 'set-status') {
        if (state.setStatusMode === '500') {
          await reply({ ok: false, error: 'Тестовая ошибка смены статуса' }, 500);
          return;
        }
        const oldStatus = state.repair.status;
        state.repair.status = body.status;
        await reply({ ok: true, repair: clone(state.repair), result: { oldStatus, newStatus: body.status } });
        return;
      }
      if (op === 'update-order') {
        await reply({ ok: true, repair: clone(state.repair) });
        return;
      }
      await reply({ ok: true });
      return;
    }

    if (slug === 'ma-crm-final-api') {
      if (op === 'repair-tools') {
        await reply({ ok: true, repair: clone(state.repair), parent: null, files: [], canCreateWarranty: false });
        return;
      }
      await reply({ ok: true, rows: [], files: [], total: 0 });
      return;
    }
    if (slug === 'ma-crm-phase1-api') {
      await reply(commerce());
      return;
    }
    if (slug === 'ma-crm-finance-api') {
      await reply({ ok: true, rows: [], transactions: [], cashboxes: [], totals: {} });
      return;
    }
    if (slug === 'ma-crm-inventory-api') {
      await reply({ ok: true, rows: [], products: [], stock: [] });
      return;
    }
    await reply({ ok: true });
  });

  return state;
}

async function openOrder(page, testInfo) {
  await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#crmMain')).toBeVisible();
  await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');
  const mobile = testInfo.project.name === 'iphone-webkit';
  const nav = mobile ? page.locator('#mobileBottomNav [data-view="orders"]') : page.locator('.sidebar-nav .nav-item[data-view="orders"]');
  await nav.click();
  const row = mobile ? page.locator('#repairMobileList [data-repair-id="repair-resilience-1"]') : page.locator('#repairTableBody [data-repair-id="repair-resilience-1"]');
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('#repairDetailOverlay')).toBeVisible();
  await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №5607');
  await expect(page.locator('#phase1Root')).toBeVisible();
}

test.describe('MA CRM order resilience', () => {
  test('failed status change keeps the order open and does not change current status', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Mobile resilience journey runs in WebKit.');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await installMocks(page);
    await openOrder(page, testInfo);
    state.setStatusMode = '500';
    await page.locator('.hc-status-current').click();
    await page.locator('.status-stepper [data-set-status="ready"]').click();
    await expect(page.locator('#crmToast')).toContainText('Тестовая ошибка смены статуса');
    await expect(page.locator('.hc-status-current')).toContainText('В работе');
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    expect(state.repair.status).toBe('in_work');
    expect(errors).toEqual([]);
  });

  test('failed issue keeps payment dialog open and does not mark order as issued', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Issue failure journey runs in WebKit.');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await installMocks(page);
    await openOrder(page, testInfo);
    state.issueMode = '500';
    await page.locator('.hc-status-current').click();
    await page.locator('.status-stepper [data-set-status="issued"]').click();
    await expect(page.locator('.issue-dialog')).toBeVisible();
    await page.locator('#issueDocAct').uncheck();
    await page.locator('#issueDocReceipt').uncheck();
    await page.locator('.issue-submit').click();
    await expect(page.locator('#issueError')).toContainText('Тестовая ошибка выдачи');
    await expect(page.locator('.issue-dialog')).toBeVisible();
    expect(state.repair.status).toBe('in_work');
    expect(errors).toEqual([]);
  });

  test('401 on order refresh returns user to login instead of leaving a broken modal', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await installMocks(page);
    await openOrder(page, testInfo);
    state.detailMode = '401';
    await page.evaluate(() => window.MAOrderController.refresh({ reason: 'e2e-auth-expired', keepMarkup: true }).catch(() => {}));
    await expect(page.locator('#loginOverlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#crmMain')).toHaveClass(/hidden/);
    await expect(page.locator('#crmLoginError')).toContainText('Сессия закончилась');
    expect(errors).toEqual([]);
  });

  test('commerce API 500 leaves order usable and reports the error', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await installMocks(page);
    await openOrder(page, testInfo);
    state.commerceMode = '500';
    await page.evaluate(() => window.MAOrderPhase?.refresh?.());
    await expect(page.locator('#crmToast')).toContainText('Тестовая ошибка товаров и платежей');
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №5607');
    expect(errors).toEqual([]);
  });

  test('closing during a delayed order load prevents stale response from reopening it', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await installMocks(page);
    await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#crmMain')).toBeVisible();
    await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');
    state.detailDelayMs = 700;
    await page.evaluate(() => window.MAOrderController.open('repair-resilience-1'));
    await page.waitForTimeout(60);
    await page.evaluate(() => window.MAOrderController.close());
    await page.waitForTimeout(900);
    await expect(page.locator('#repairDetailOverlay')).toHaveClass(/hidden/);
    expect(errors).toEqual([]);
  });

  test('rapid tab switching and iPhone rotation do not break the open order', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Viewport stress runs in WebKit iPhone emulation.');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installMocks(page);
    await openOrder(page, testInfo);
    for (const tab of ['items', 'payments', 'history', 'files', 'general', 'items', 'general']) {
      await page.locator(`#hcOrderTabs [data-hc-tab="${tab}"]`).click();
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(120);
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#hcOrderTabs [data-hc-tab="general"]').click();
    await page.locator('.hc-edit-toggle').click();
    await page.locator('#detailModel').focus();
    await page.locator('#detailModel').fill('iPhone 14 rotation test');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
