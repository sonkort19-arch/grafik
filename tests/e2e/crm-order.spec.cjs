const { test, expect } = require('@playwright/test');

const SUPABASE_FUNCTIONS = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRepair(id = 'repair-e2e-1', orderNo = 3607) {
  return {
    id,
    order_no: orderNo,
    customer_id: 'customer-e2e-1',
    service: 'Мобильный Ангел',
    device: 'Телефон',
    model: orderNo === 3607 ? 'iPhone 13' : 'Samsung A54',
    imei: orderNo === 3607 ? '123456789012345' : '987654321098765',
    issue: orderNo === 3607 ? 'Не включается' : 'Разбит дисплей',
    comment: 'Безопасный E2E-макет — не реальный заказ',
    estimated_price: 500,
    final_price: 500,
    manager: 'Тест Менеджер',
    master: 'Георгий',
    status: 'in_work',
    accepted_at: '2026-09-13T08:00:00.000Z',
    updated_at: '2026-09-13T08:30:00.000Z',
    due_at: '2026-09-14T12:00:00.000Z',
    warranty_days: 14,
    warranty_note: 'На работу и установленную деталь',
    issued_at: null,
    warranty_case: false,
    warranty_parent_id: null,
    customer: {
      id: 'customer-e2e-1',
      name: 'Тест Клиент',
      phone: '+7 900 000-00-00',
      phone_normalized: '79000000000',
    },
  };
}

const STATUS_DEFINITIONS = [
  ['accepted', 'Принят'],
  ['diagnostics', 'Диагностика'],
  ['in_work', 'В работе'],
  ['waiting_part', 'Ждём запчасть'],
  ['ready', 'Готов'],
  ['issued', 'Выдан'],
].map(([code, name], index) => ({
  code,
  name,
  group_code: code === 'issued' ? 'closed_success' : 'work',
  sort_order: index * 10,
  actions: {},
}));

async function installCrmMocks(page) {
  const state = {
    repair: makeRepair(),
    otherRepair: makeRepair('repair-e2e-2', 3608),
    items: [
      {
        id: 'item-diagnostics',
        repair_id: 'repair-e2e-1',
        item_type: 'service',
        display_type: 'service',
        title: 'Диагностика',
        quantity: 1,
        unit_price: 500,
        unit_cost: 0,
        discount_amount: 0,
        executor: 'Георгий',
        service_catalog_id: null,
      },
    ],
    payments: [
      {
        id: 'payment-deposit',
        repair_id: 'repair-e2e-1',
        kind: 'payment',
        category: 'deposit',
        method: 'cash',
        amount: 200,
        note: 'Тестовая предоплата',
        created_by: 'Тест Менеджер',
        created_at: '2026-09-13T08:10:00.000Z',
      },
    ],
    writeCounts: Object.create(null),
    seenItemKeys: new Map(),
    seenPaymentKeys: new Map(),
    requestOps: [],
  };

  const totals = () => {
    const itemsTotal = Math.round(state.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0) - Number(item.discount_amount || 0), 0) * 100) / 100;
    const cost = Math.round(state.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0) * 100) / 100;
    const paid = Math.round(state.payments.reduce((sum, payment) => sum + (payment.kind === 'refund' ? -1 : 1) * Number(payment.amount || 0), 0) * 100) / 100;
    const orderTotal = state.items.length ? itemsTotal : Number(state.repair.final_price ?? state.repair.estimated_price ?? 0);
    return {
      itemsTotal,
      cost,
      profit: Math.round((itemsTotal - cost) * 100) / 100,
      paid,
      orderTotal,
      balance: Math.round((orderTotal - paid) * 100) / 100,
    };
  };

  const listRepair = repair => ({
    id: repair.id,
    order_no: repair.order_no,
    customer: clone(repair.customer),
    customer_id: repair.customer_id,
    service: repair.service,
    device: repair.device,
    model: repair.model,
    imei: repair.imei,
    issue: repair.issue,
    status: repair.status,
    master: repair.master,
    manager: repair.manager,
    estimated_price: repair.estimated_price,
    final_price: repair.id === state.repair.id ? totals().orderTotal : repair.final_price,
    accepted_at: repair.accepted_at,
    updated_at: repair.updated_at,
  });

  const orderDetail = repair => {
    const t = repair.id === state.repair.id ? totals() : { paid: 0, orderTotal: repair.final_price, balance: repair.final_price };
    return {
      ok: true,
      repair: clone(repair),
      history: [
        {
          id: 'status-history-1',
          repair_id: repair.id,
          old_status: 'diagnostics',
          new_status: repair.status,
          changed_by: 'Тест Менеджер',
          created_at: '2026-09-13T08:25:00.000Z',
        },
      ],
      paymentSummary: {
        paid: t.paid || 0,
        total: t.orderTotal || repair.final_price || 0,
        remaining: t.balance || 0,
        payments: repair.id === state.repair.id ? clone(state.payments) : [],
      },
      customerHistory: { repairs: [], sales: [] },
      statuses: clone(STATUS_DEFINITIONS),
    };
  };

  const commerce = () => {
    const t = totals();
    state.repair.final_price = t.orderTotal;
    return {
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
      items: clone(state.items),
      payments: clone(state.payments),
      totals: t,
    };
  };

  const countWrite = op => {
    state.writeCounts[op] = (state.writeCounts[op] || 0) + 1;
  };

  await page.addInitScript(() => {
    localStorage.setItem('ma_crm_session_v1', 'e2e.mock.session');
    localStorage.setItem('ma_crm_employee_v1', 'Тест Менеджер');
  });

  await page.route(`${SUPABASE_FUNCTIONS}**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }

    let body = {};
    try {
      body = JSON.parse(request.postData() || '{}');
    } catch (_) {
      body = {};
    }
    const slug = new URL(request.url()).pathname.split('/').pop();
    const op = String(body.op || '');
    state.requestOps.push(`${slug}:${op}`);

    const reply = async (data, status = 200) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(data),
      });
    };

    if (slug === 'ma-crm-api') {
      if (op === 'bootstrap') {
        await reply({
          ok: true,
          actor: { kind: 'admin', employee: 'Администратор', role: 'admin' },
          services: ['Мобильный Ангел', 'Nova'],
          employees: [
            { name: 'Тест Менеджер', role: 'manager' },
            { name: 'Георгий', role: 'master' },
            { name: 'Олег', role: 'master' },
          ],
        });
        return;
      }
      if (op === 'list-repairs') {
        await reply({ ok: true, repairs: [listRepair(state.repair), listRepair(state.otherRepair)] });
        return;
      }
      if (op === 'list-sales') {
        await reply({ ok: true, sales: [] });
        return;
      }
      await reply({ ok: true });
      return;
    }

    if (slug === 'ma-crm-order-api') {
      if (op === 'detail') {
        const id = String(body.id || body.repairId || '');
        const repair = id === state.otherRepair.id ? state.otherRepair : state.repair;
        await reply(orderDetail(repair));
        return;
      }
      if (op === 'commerce') {
        await reply(commerce());
        return;
      }
      if (op === 'catalog') {
        await reply({
          ok: true,
          repair: { id: state.repair.id, service: state.repair.service },
          categories: [
            {
              id: 'cat-modul',
              name: 'Модулька',
              sort_order: 10,
              services: [
                {
                  id: 'svc-display',
                  category_id: 'cat-modul',
                  name: 'Замена дисплея',
                  default_price: 5000,
                  default_cost: 1500,
                  sort_order: 10,
                },
              ],
            },
            { id: 'cat-board', name: 'Ремонт платы', sort_order: 20, services: [] },
          ],
          uncategorizedServices: [],
          products: [
            {
              id: 'product-battery',
              name: 'Аккумулятор iPhone 13',
              sku: 'BAT-IP13',
              unit: 'шт',
              cost_price: 1200,
              sale_price: 2500,
              stock: 3,
            },
          ],
          employees: [
            { name: 'Георгий', employee: 'Георгий', role: 'master' },
            { name: 'Олег', employee: 'Олег', role: 'master' },
          ],
        });
        return;
      }
      if (op === 'events') {
        await reply({
          ok: true,
          events: [
            {
              id: 'event-1',
              repair_id: state.repair.id,
              event_type: 'order_created',
              employee: 'Тест Менеджер',
              description: 'Заказ создан',
              created_at: '2026-09-13T08:00:00.000Z',
            },
            {
              id: 'event-2',
              repair_id: state.repair.id,
              event_type: 'status_changed',
              employee: 'Тест Менеджер',
              old_value: { status: 'diagnostics' },
              new_value: { status: state.repair.status },
              created_at: '2026-09-13T08:25:00.000Z',
            },
          ],
        });
        return;
      }
      if (op === 'payroll-entries') {
        await reply({ ok: true, entries: [] });
        return;
      }
      if (op === 'repair-tools') {
        await reply({
          ok: true,
          repair: clone(state.repair),
          parent: null,
          files: [],
          canCreateWarranty: false,
        });
        return;
      }
      if (op === 'upsert-item') {
        countWrite(op);
        const key = String(body.idempotencyKey || '');
        if (key && state.seenItemKeys.has(key)) {
          await reply({ ...commerce(), duplicate: true, item: clone(state.seenItemKeys.get(key)), finalPrice: totals().orderTotal });
          return;
        }
        const item = {
          id: `item-e2e-${state.items.length + 1}`,
          repair_id: state.repair.id,
          item_type: body.itemType || 'service',
          display_type: body.itemType || 'service',
          title: body.title || 'Позиция',
          quantity: Number(body.quantity || 1),
          unit_price: Number(body.unitPrice || 0),
          unit_cost: Number(body.unitCost || 0),
          discount_amount: Number(body.discount || 0),
          executor: body.executor || '',
          service_catalog_id: body.serviceCatalogId || null,
          inventory_product_id: body.inventoryProductId || null,
        };
        state.items.push(item);
        if (key) state.seenItemKeys.set(key, item);
        const t = totals();
        state.repair.final_price = t.orderTotal;
        await reply({ ...commerce(), item: clone(item), duplicate: false, finalPrice: t.orderTotal });
        return;
      }
      if (op === 'add-payment') {
        countWrite(op);
        const key = String(body.idempotencyKey || '');
        if (key && state.seenPaymentKeys.has(key)) {
          await reply({ ...commerce(), result: { duplicate: true }, idempotencyKey: key });
          return;
        }
        const payment = {
          id: `payment-e2e-${state.payments.length + 1}`,
          repair_id: state.repair.id,
          kind: body.kind || 'payment',
          category: body.category || 'payment',
          method: body.method || 'cash',
          amount: Number(body.amount || 0),
          note: body.note || '',
          created_by: 'Тест Менеджер',
          created_at: '2026-09-13T09:00:00.000Z',
        };
        state.payments.push(payment);
        if (key) state.seenPaymentKeys.set(key, payment);
        await reply({ ...commerce(), result: { duplicate: false, payment: clone(payment) }, idempotencyKey: key });
        return;
      }
      if (op === 'set-status') {
        countWrite(op);
        state.repair.status = body.status;
        state.repair.updated_at = '2026-09-13T09:05:00.000Z';
        await reply({ ok: true, repair: clone(state.repair), result: { oldStatus: 'in_work', newStatus: body.status } });
        return;
      }
      if (op === 'update-order') {
        countWrite(op);
        for (const [key, value] of Object.entries({
          device: body.device,
          model: body.model,
          imei: body.imei,
          issue: body.issue,
          manager: body.manager,
          master: body.master,
          comment: body.comment,
          due_at: body.dueAt,
          warranty_days: body.warrantyDays,
          warranty_note: body.warrantyNote,
        })) {
          if (value !== undefined) state.repair[key] = value;
        }
        await reply({ ok: true, repair: clone(state.repair) });
        return;
      }
      await reply({ ok: true });
      return;
    }

    if (slug === 'ma-crm-final-api') {
      if (op === 'repair-tools') {
        await reply({
          ok: true,
          repair: clone(state.repair),
          parent: null,
          files: [],
          canCreateWarranty: false,
        });
        return;
      }
      await reply({ ok: true, rows: [], files: [], total: 0 });
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

    if (slug === 'ma-crm-phase1-api') {
      await reply(commerce());
      return;
    }

    await reply({ ok: true });
  });

  return state;
}

async function openPrimaryOrder(page, testInfo) {
  await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#crmMain')).toBeVisible();
  await expect(page.locator('#loginOverlay')).toHaveClass(/hidden/);
  await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');

  const isMobile = testInfo.project.name === 'iphone-webkit';
  const nav = isMobile
    ? page.locator('#mobileBottomNav [data-view="orders"]')
    : page.locator('.sidebar-nav .nav-item[data-view="orders"]');
  await nav.click();

  const order = isMobile
    ? page.locator('#repairMobileList [data-repair-id="repair-e2e-1"]')
    : page.locator('#repairTableBody [data-repair-id="repair-e2e-1"]');
  await expect(order).toBeVisible();
  await order.click();
  await expect(page.locator('#repairDetailOverlay')).toBeVisible();
  await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №3607');
  await expect(page.locator('#repairDetailBody .order-layout')).toBeVisible();
  await expect(page.locator('#phase1Root')).toBeVisible();
}

test.describe('MA CRM order browser safety', () => {
  test('opens and closes an order without touching production data', async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const state = await installCrmMocks(page);

    await openPrimaryOrder(page, testInfo);
    await expect(page.locator('#repairDetailBody')).toContainText('Тест Клиент');
    await expect(page.locator('#repairDetailBody')).toContainText('Диагностика');

    await page.locator('#closeRepairDetail').click();
    await expect(page.locator('#repairDetailOverlay')).toHaveClass(/hidden/);
    expect(Object.values(state.writeCounts).reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  test('mobile tabs, service picker, payment and status flow work end-to-end with mocked writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Mobile interaction test runs in WebKit iPhone emulation.');

    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const state = await installCrmMocks(page);
    await openPrimaryOrder(page, testInfo);

    await expect(page.locator('#hcOrderTabs [data-hc-tab]')).toHaveCount(5);
    await expect(page.locator('.hc-status-current')).toContainText('В работе');

    await page.locator('#hcOrderTabs [data-hc-tab="items"]').click();
    await expect(page.locator('.hc-items-panel')).toBeVisible();
    await page.locator('.hc-add-toggle').click();
    await expect(page.locator('#maItemPicker')).toBeVisible();
    await expect(page.locator('#maItemTitle')).toHaveText('Добавить позицию');

    await page.locator('[data-main="services"]').click();
    await page.locator('[data-category="cat-modul"]').click();
    await page.locator('[data-service="svc-display"]').click();
    await expect(page.locator('#maPickTitle')).toHaveValue('Замена дисплея');
    await expect(page.locator('#maPickPrice')).toHaveValue('5000');
    await expect(page.locator('#maPickCost')).toHaveValue('1500');
    await expect(page.locator('#maPickProfit')).toContainText('3 500 ₽');

    const pickerTypography = await page.evaluate(() => ({
      input: parseFloat(getComputedStyle(document.getElementById('maPickPrice')).fontSize),
      row: parseFloat(getComputedStyle(document.querySelector('.ma-item-form label')).fontSize),
      title: parseFloat(getComputedStyle(document.getElementById('maItemTitle')).fontSize),
    }));
    expect(pickerTypography.input).toBe(16);
    expect(pickerTypography.row).toBeLessThanOrEqual(13);
    expect(pickerTypography.title).toBeLessThanOrEqual(20);

    await page.locator('.ma-item-submit').click();
    await expect(page.locator('#maItemPicker')).toHaveClass(/hidden/);
    await expect.poll(() => state.writeCounts['upsert-item'] || 0).toBe(1);
    await expect(page.locator('#phaseItemRows')).toContainText('Замена дисплея');
    await expect(page.locator('.hc-order-amount')).toContainText('5 500 ₽');

    await page.locator('#hcOrderTabs [data-hc-tab="payments"]').click();
    await expect(page.locator('#phasePaymentForm')).toBeVisible();
    await page.locator('#phasePaymentAmount').fill('1000');
    const paymentSubmit = page.locator('#phasePaymentForm button[type="submit"]');
    await paymentSubmit.dblclick({ delay: 5 });
    await expect.poll(() => state.writeCounts['add-payment'] || 0).toBe(1);
    await expect(page.locator('#phasePaymentRows')).toContainText('1 000 ₽');

    await page.locator('.hc-status-current').click();
    await page.locator('.status-stepper [data-set-status="ready"]').click();
    await expect.poll(() => state.writeCounts['set-status'] || 0).toBe(1);
    await expect(page.locator('.hc-status-current')).toContainText('Готов');
    await expect(page.locator('#repairDetailOverlay')).toBeVisible();

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
  });

  test('a newer order wins if requests overlap', async ({ page }) => {
    const state = await installCrmMocks(page);
    await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#crmMain')).toBeVisible();
    await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');

    await page.evaluate(() => {
      window.MAOrderController.open('repair-e2e-1');
      window.MAOrderController.open('repair-e2e-2');
    });

    await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №3608');
    await expect(page.locator('#repairDetailBody')).toContainText('Samsung A54');
    await expect(page.locator('#repairDetailBody')).not.toContainText('iPhone 13');
    expect(Object.values(state.writeCounts).reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});
