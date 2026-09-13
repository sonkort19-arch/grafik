const { test, expect } = require('@playwright/test');

const SUPABASE_FUNCTIONS = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';

const clone = value => JSON.parse(JSON.stringify(value));
const round2 = value => Math.round(Number(value || 0) * 100) / 100;

function makeRepair(id = 'repair-full-1', orderNo = 4607) {
  return {
    id,
    order_no: orderNo,
    customer_id: 'customer-full-1',
    service: 'Мобильный Ангел',
    device: 'Телефон',
    model: orderNo === 4607 ? 'iPhone 13' : 'Samsung A54',
    imei: orderNo === 4607 ? '123456789012345' : '987654321098765',
    issue: orderNo === 4607 ? 'Не включается' : 'Разбит дисплей',
    comment: 'Полный безопасный E2E-макет — не реальный заказ',
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
    warranty_until: '2026-10-01T00:00:00.000Z',
    issued_at: null,
    warranty_case: false,
    warranty_parent_id: null,
    customer: {
      id: 'customer-full-1',
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

async function installFullMocks(page) {
  const state = {
    repair: makeRepair(),
    otherRepair: makeRepair('repair-full-2', 4608),
    items: [{
      id: 'item-diagnostics',
      repair_id: 'repair-full-1',
      item_type: 'service',
      display_type: 'service',
      title: 'Диагностика',
      quantity: 1,
      unit_price: 500,
      unit_cost: 0,
      discount_amount: 0,
      executor: 'Георгий',
      service_catalog_id: null,
      inventory_product_id: null,
    }],
    payments: [{
      id: 'payment-deposit',
      repair_id: 'repair-full-1',
      kind: 'payment',
      category: 'deposit',
      method: 'cash',
      amount: 200,
      note: 'Тестовая предоплата',
      created_by: 'Тест Менеджер',
      created_at: '2026-09-13T08:10:00.000Z',
    }],
    events: [{
      id: 'event-created',
      repair_id: 'repair-full-1',
      event_type: 'order_created',
      employee: 'Тест Менеджер',
      description: 'Заказ создан',
      created_at: '2026-09-13T08:00:00.000Z',
    }],
    payroll: [],
    files: [{
      id: 'file-existing',
      repair_id: 'repair-full-1',
      file_name: 'Фото до ремонта.webp',
      size_bytes: 1024,
      uploaded_by: 'Тест Менеджер',
      url: 'https://example.test/mock-file.webp',
    }],
    writeCounts: Object.create(null),
    seenItemKeys: new Map(),
    seenPaymentKeys: new Map(),
    requestOps: [],
    warrantyCreated: null,
    nextId: 1,
  };

  const countWrite = op => {
    state.writeCounts[op] = (state.writeCounts[op] || 0) + 1;
  };
  const pushEvent = (eventType, description = '', extra = {}) => {
    state.events.push({
      id: `event-full-${state.nextId++}`,
      repair_id: state.repair.id,
      event_type: eventType,
      employee: 'Тест Менеджер',
      description,
      created_at: `2026-09-13T09:${String(state.nextId).padStart(2, '0')}:00.000Z`,
      ...extra,
    });
  };
  const totals = () => {
    const itemsTotal = round2(state.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0) - Number(item.discount_amount || 0), 0));
    const cost = round2(state.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0));
    const paid = round2(state.payments.reduce((sum, payment) => sum + (payment.kind === 'refund' ? -1 : 1) * Number(payment.amount || 0), 0));
    const orderTotal = state.items.length ? itemsTotal : Number(state.repair.final_price ?? state.repair.estimated_price ?? 0);
    return { itemsTotal, cost, profit: round2(itemsTotal - cost), paid, orderTotal, balance: round2(orderTotal - paid) };
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
    const current = repair.id === state.repair.id;
    const t = current ? totals() : { paid: 0, orderTotal: repair.final_price, balance: repair.final_price };
    return {
      ok: true,
      repair: clone(repair),
      history: state.events.filter(x => x.event_type === 'status_changed').map((event, index) => ({
        id: `history-${index}`,
        repair_id: repair.id,
        old_status: event.old_value?.status || 'in_work',
        new_status: event.new_value?.status || repair.status,
        changed_by: event.employee,
        created_at: event.created_at,
      })),
      paymentSummary: {
        paid: t.paid || 0,
        total: t.orderTotal || repair.final_price || 0,
        remaining: t.balance || 0,
        payments: current ? clone(state.payments) : [],
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
        warranty_until: state.repair.warranty_until,
      },
      items: clone(state.items),
      payments: clone(state.payments),
      totals: t,
    };
  };

  await page.addInitScript(() => {
    localStorage.setItem('ma_crm_session_v1', 'e2e.full.mock.session');
    localStorage.setItem('ma_crm_employee_v1', 'Тест Менеджер');
  });

  await page.route(`${SUPABASE_FUNCTIONS}**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch (_) { body = {}; }
    const slug = new URL(request.url()).pathname.split('/').pop();
    const op = String(body.op || '');
    state.requestOps.push(`${slug}:${op}`);
    const reply = async (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(data),
    });

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
      if (op === 'issue-repair') {
        countWrite(op);
        const amount = Number(body.amount || 0);
        if (amount > 0) {
          state.payments.push({
            id: `payment-issue-${state.nextId++}`,
            repair_id: state.repair.id,
            kind: 'payment',
            category: 'final',
            method: body.method || 'cash',
            amount,
            note: 'Оплата при выдаче',
            created_by: 'Тест Менеджер',
            created_at: '2026-09-13T10:00:00.000Z',
          });
        }
        state.repair.status = 'issued';
        state.repair.issued_at = '2026-09-13T10:00:00.000Z';
        state.repair.updated_at = state.repair.issued_at;
        state.payroll = [{
          id: 'payroll-full-1',
          repair_id: state.repair.id,
          employee: state.repair.master,
          entry_type: 'service_percent',
          basis_amount: totals().profit,
          rate_percent: 30,
          amount: round2(totals().profit * 0.3),
        }];
        pushEvent('order_issued', 'Заказ выдан');
        await reply({ ok: true, repair: clone(state.repair), result: { issued: true } });
        return;
      }
      await reply({ ok: true });
      return;
    }

    if (slug === 'ma-crm-order-api') {
      if (op === 'detail') {
        const id = String(body.id || body.repairId || '');
        await reply(orderDetail(id === state.otherRepair.id ? state.otherRepair : state.repair));
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
              services: [{
                id: 'svc-display',
                category_id: 'cat-modul',
                name: 'Замена дисплея',
                default_price: 5000,
                default_cost: 1500,
                sort_order: 10,
              }],
            },
            { id: 'cat-board', name: 'Ремонт платы', sort_order: 20, services: [] },
          ],
          uncategorizedServices: [],
          products: [{
            id: 'product-battery',
            name: 'Аккумулятор iPhone 13',
            sku: 'BAT-IP13',
            unit: 'шт',
            cost_price: 1200,
            sale_price: 2500,
            stock: 3,
          }],
          employees: [
            { name: 'Георгий', employee: 'Георгий', role: 'master' },
            { name: 'Олег', employee: 'Олег', role: 'master' },
          ],
        });
        return;
      }
      if (op === 'events') {
        await reply({ ok: true, events: clone(state.events) });
        return;
      }
      if (op === 'payroll-entries') {
        await reply({ ok: true, entries: clone(state.payroll) });
        return;
      }
      if (op === 'upsert-item') {
        const key = String(body.idempotencyKey || '');
        if (key && state.seenItemKeys.has(key)) {
          await reply({ ...commerce(), duplicate: true, item: clone(state.seenItemKeys.get(key)), finalPrice: totals().orderTotal });
          return;
        }
        countWrite(op);
        const item = {
          id: `item-full-${state.nextId++}`,
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
        state.repair.final_price = totals().orderTotal;
        pushEvent('item_added', `Добавлена позиция: ${item.title}`);
        await reply({ ...commerce(), item: clone(item), duplicate: false, finalPrice: totals().orderTotal });
        return;
      }
      if (op === 'delete-item') {
        countWrite(op);
        const index = state.items.findIndex(item => item.id === body.id);
        if (index >= 0) {
          const [removed] = state.items.splice(index, 1);
          pushEvent('item_deleted', `Удалена позиция: ${removed.title}`);
        }
        state.repair.final_price = totals().orderTotal;
        await reply({ ...commerce(), finalPrice: totals().orderTotal });
        return;
      }
      if (op === 'add-payment') {
        const key = String(body.idempotencyKey || '');
        if (key && state.seenPaymentKeys.has(key)) {
          await reply({ ...commerce(), result: { duplicate: true }, idempotencyKey: key });
          return;
        }
        countWrite(op);
        const payment = {
          id: `payment-full-${state.nextId++}`,
          repair_id: state.repair.id,
          kind: body.kind || 'payment',
          category: body.category || 'payment',
          method: body.method || 'cash',
          amount: Number(body.amount || 0),
          note: body.note || '',
          created_by: 'Тест Менеджер',
          created_at: '2026-09-13T09:30:00.000Z',
        };
        state.payments.push(payment);
        if (key) state.seenPaymentKeys.set(key, payment);
        pushEvent(payment.kind === 'refund' ? 'payment_refund' : 'payment_added', payment.kind === 'refund' ? 'Оформлен возврат' : 'Добавлена оплата', { new_value: { amount: payment.amount } });
        await reply({ ...commerce(), result: { duplicate: false, payment: clone(payment) }, idempotencyKey: key });
        return;
      }
      if (op === 'set-status') {
        countWrite(op);
        const oldStatus = state.repair.status;
        state.repair.status = body.status;
        state.repair.updated_at = '2026-09-13T09:40:00.000Z';
        pushEvent('status_changed', '', { old_value: { status: oldStatus }, new_value: { status: body.status } });
        await reply({ ok: true, repair: clone(state.repair), result: { oldStatus, newStatus: body.status } });
        return;
      }
      if (op === 'update-order') {
        countWrite(op);
        const updates = {
          device: body.device,
          model: body.model,
          imei: body.imei,
          issue: body.issue,
          estimated_price: body.estimatedPrice,
          manager: body.manager,
          master: body.master,
          comment: body.comment,
          due_at: body.dueAt,
          warranty_days: body.warrantyDays,
          warranty_note: body.warrantyNote,
        };
        for (const [key, value] of Object.entries(updates)) if (value !== undefined) state.repair[key] = value;
        pushEvent('order_updated', 'Изменены данные заказа');
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
          files: clone(state.files),
          canCreateWarranty: true,
        });
        return;
      }
      if (op === 'upload-file') {
        countWrite(op);
        const file = {
          id: `file-full-${state.nextId++}`,
          repair_id: state.repair.id,
          file_name: body.fileName,
          size_bytes: Math.ceil(String(body.base64 || '').length * 0.75),
          uploaded_by: 'Тест Менеджер',
          url: 'https://example.test/uploaded-file',
        };
        state.files.push(file);
        pushEvent('file_uploaded', `Добавлен файл: ${file.file_name}`);
        await reply({ ok: true, file: clone(file) });
        return;
      }
      if (op === 'delete-file') {
        countWrite(op);
        state.files = state.files.filter(file => file.id !== body.id);
        pushEvent('file_deleted', 'Удалён файл');
        await reply({ ok: true });
        return;
      }
      if (op === 'create-warranty') {
        countWrite(op);
        state.warrantyCreated = {
          id: 'repair-warranty-full-1',
          order_no: 4701,
          warranty_case: true,
          warranty_parent_id: state.repair.id,
          issue: body.reason,
        };
        pushEvent('warranty_created', 'Создан гарантийный заказ');
        await reply({ ok: true, repair: clone(state.warrantyCreated) });
        return;
      }
      await reply({ ok: true, rows: [], files: clone(state.files), total: 0 });
      return;
    }

    if (slug === 'ma-crm-phase1-api') {
      if (op === 'detail') await reply(commerce());
      else await reply(commerce());
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

async function openPrimaryOrder(page, testInfo) {
  await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#crmMain')).toBeVisible();
  await expect(page.locator('#loginOverlay')).toHaveClass(/hidden/);
  await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');
  const mobile = testInfo.project.name === 'iphone-webkit';
  const nav = mobile ? page.locator('#mobileBottomNav [data-view="orders"]') : page.locator('.sidebar-nav .nav-item[data-view="orders"]');
  await nav.click();
  const order = mobile ? page.locator('#repairMobileList [data-repair-id="repair-full-1"]') : page.locator('#repairTableBody [data-repair-id="repair-full-1"]');
  await expect(order).toBeVisible();
  await order.click();
  await expect(page.locator('#repairDetailOverlay')).toBeVisible();
  await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №4607');
  await expect(page.locator('#phase1Root')).toBeVisible();
}

async function setStatusMobile(page, code, label) {
  await page.locator('.hc-status-current').click();
  await page.locator(`.status-stepper [data-set-status="${code}"]`).click();
  await expect(page.locator('.hc-status-current')).toContainText(label);
}

test.describe('MA CRM full order module', () => {
  test('complete mobile order lifecycle: edit, items, payments, statuses, issue, history and payroll', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Full mobile journey runs in WebKit iPhone emulation.');
    test.setTimeout(70_000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const state = await installFullMocks(page);
    await openPrimaryOrder(page, testInfo);

    await expect(page.locator('#hcOrderTabs [data-hc-tab]')).toHaveCount(5);
    await expect(page.locator('.hc-status-current')).toContainText('В работе');

    await page.locator('.hc-edit-toggle').click();
    await page.locator('#detailModel').fill('iPhone 13 Pro');
    await page.locator('#detailIssue').fill('Не включается после падения');
    await page.locator('#detailComment').fill('Проверить Face ID');
    await page.locator('#detailMaster').selectOption({ label: 'Олег' });
    await page.locator('#saveRepairChanges').click();
    await expect.poll(() => state.writeCounts['update-order'] || 0).toBe(1);
    await expect(page.locator('#repairDetailBody')).toContainText('iPhone 13 Pro');
    expect(state.repair.master).toBe('Олег');

    await page.locator('#phaseWarrantyDays').fill('30');
    await page.locator('#phaseWarrantyNote').fill('30 дней на работу и деталь');
    await page.locator('#phaseSaveMeta').click();
    await expect.poll(() => state.writeCounts['update-order'] || 0).toBe(2);
    expect(Number(state.repair.warranty_days)).toBe(30);

    await page.locator('#hcOrderTabs [data-hc-tab="items"]').click();
    await page.locator('.hc-add-toggle').click();
    await expect(page.locator('#maItemPicker')).toBeVisible();
    await page.locator('[data-main="services"]').click();
    await page.locator('[data-category="cat-modul"]').click();
    await page.locator('[data-service="svc-display"]').click();
    await page.locator('#maPickQty').fill('2');
    await page.locator('#maPickDiscount').fill('500');
    await expect(page.locator('#maPickProfit')).toContainText('6 500 ₽');
    await page.locator('.ma-item-submit').dblclick({ delay: 5 });
    await expect.poll(() => state.writeCounts['upsert-item'] || 0).toBe(1);
    await expect(page.locator('#phaseItemRows')).toContainText('Замена дисплея');
    await expect(page.locator('.hc-order-amount')).toContainText('10 000 ₽');

    await page.locator('.hc-add-toggle').click();
    await page.locator('[data-main="products"]').click();
    await page.locator('#maProductSearch').fill('BAT-IP13');
    await page.locator('[data-product="product-battery"]').click();
    await expect(page.locator('#maPickCost')).toHaveValue('1200');
    await page.locator('.ma-item-submit').click();
    await expect.poll(() => state.writeCounts['upsert-item'] || 0).toBe(2);
    await expect(page.locator('#phaseItemRows')).toContainText('Аккумулятор iPhone 13');
    await expect(page.locator('.hc-order-amount')).toContainText('12 500 ₽');
    expect(state.items.find(item => item.inventory_product_id === 'product-battery')).toBeTruthy();

    const batteryRow = page.locator('#phaseItemRows .phase-line', { hasText: 'Аккумулятор iPhone 13' });
    await batteryRow.locator('[data-phase-delete-item]').click();
    await expect.poll(() => state.writeCounts['delete-item'] || 0).toBe(1);
    await expect(page.locator('#phaseItemRows')).not.toContainText('Аккумулятор iPhone 13');
    await expect(page.locator('.hc-order-amount')).toContainText('10 000 ₽');

    await page.locator('#hcOrderTabs [data-hc-tab="payments"]').click();
    await page.locator('#phasePaymentCategory').selectOption('additional');
    await page.locator('#phasePaymentMethod').selectOption('card');
    await page.locator('#phasePaymentAmount').fill('2000');
    await page.locator('#phasePaymentNote').fill('Доплата картой');
    await page.locator('#phasePaymentForm button[type="submit"]').dblclick({ delay: 5 });
    await expect.poll(() => state.writeCounts['add-payment'] || 0).toBe(1);
    await expect(page.locator('#phasePaymentRows')).toContainText('Доплата');
    await expect(page.locator('#phasePaymentRows')).toContainText('2 000 ₽');

    await page.locator('#phasePaymentCategory').selectOption('refund');
    await page.locator('#phasePaymentMethod').selectOption('transfer');
    await page.locator('#phasePaymentAmount').fill('500');
    await page.locator('#phasePaymentNote').fill('Частичный возврат');
    await page.locator('#phasePaymentForm button[type="submit"]').click();
    await expect.poll(() => state.writeCounts['add-payment'] || 0).toBe(2);
    await expect(page.locator('#phasePaymentRows')).toContainText('Возврат');
    expect(state.payments.filter(payment => payment.kind === 'refund')).toHaveLength(1);

    await setStatusMobile(page, 'accepted', 'Принят');
    await setStatusMobile(page, 'diagnostics', 'Диагностика');
    await setStatusMobile(page, 'waiting_part', 'Ждём запчасть');
    await setStatusMobile(page, 'ready', 'Готов');
    await expect.poll(() => state.writeCounts['set-status'] || 0).toBe(4);

    await page.locator('.hc-status-current').click();
    await page.locator('.status-stepper [data-set-status="issued"]').click();
    await expect(page.locator('.issue-dialog')).toBeVisible();
    await expect(page.locator('.issue-total')).toContainText('10 000 ₽');
    await page.locator('#issueDocAct').uncheck();
    await page.locator('#issueDocReceipt').uncheck();
    await page.locator('input[name="issueMethod"][value="card"]').check();
    await page.locator('.issue-submit').dblclick({ delay: 5 });
    await expect.poll(() => state.writeCounts['issue-repair'] || 0).toBe(1);
    await expect(page.locator('.issue-overlay')).toHaveCount(0);
    await expect(page.locator('.hc-status-current')).toContainText('Выдан');
    expect(state.repair.issued_at).toBeTruthy();
    expect(state.payroll).toHaveLength(1);

    await page.locator('#hcOrderTabs [data-hc-tab="history"]').click();
    await expect(page.locator('#maOrderEventsPanel')).toBeVisible();
    await expect(page.locator('#maOrderEventsPanel')).toContainText('Добавлена позиция');
    await expect(page.locator('#maOrderEventsPanel')).toContainText('Добавлена оплата');
    await expect(page.locator('#maOrderEventsPanel')).toContainText('Оформлен возврат');
    await expect(page.locator('#maOrderEventsPanel')).toContainText('Заказ выдан');
    await expect(page.locator('#maOrderPayrollPanel')).toContainText('Олег');

    const documentHtml = await page.evaluate(async () => {
      const commerce = window.MAOrderController.getSection('commerce') || await window.MAOrderController.refreshSection('commerce', { force: true });
      return window.MAOrderDocuments.html(window.MAOrderController.repair, commerce, { act: true, receipt: true }, { amount: 1000, method: 'card' });
    });
    expect(documentHtml).toContain('Акт выполненных работ');
    expect(documentHtml).toContain('Приёмная квитанция');
    expect(documentHtml).toContain('Замена дисплея');
    expect(documentHtml).toContain('iPhone 13 Pro');

    const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
  });

  test('files, print, WhatsApp and warranty case work without touching production', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Files and warranty journey runs in WebKit iPhone emulation.');
    test.setTimeout(50_000);
    page.on('dialog', dialog => dialog.accept());
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const state = await installFullMocks(page);
    await openPrimaryOrder(page, testInfo);
    await expect(page.locator('#crmFinalTools')).toBeAttached();

    await page.locator('#hcOrderTabs [data-hc-tab="files"]').click();
    await expect(page.locator('#crmFinalTools')).toBeVisible();
    await expect(page.locator('#finalFiles')).toContainText('Фото до ремонта.webp');

    await page.evaluate(() => {
      window.__openedUrls = [];
      window.__printHtml = '';
      window.open = url => {
        window.__openedUrls.push(String(url || ''));
        return {
          closed: false,
          document: {
            open() {},
            write(value) { window.__printHtml += String(value || ''); },
            close() {},
          },
          close() { this.closed = true; },
        };
      };
    });
    await page.locator('#finalPrint').click();
    await expect.poll(() => page.evaluate(() => window.__printHtml.includes('Приёмная квитанция'))).toBe(true);

    await page.locator('#finalWhatsApp').click();
    await expect.poll(() => page.evaluate(() => window.__openedUrls.some(url => url.startsWith('https://wa.me/79000000000')))).toBe(true);

    await page.locator('#finalFileInput').setInputFiles({
      name: 'after-repair.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('safe-e2e-image-data'),
    });
    await expect.poll(() => state.writeCounts['upload-file'] || 0).toBe(1);
    await expect(page.locator('#finalFiles')).toContainText('after-repair.webp');

    const uploadedRow = page.locator('#finalFiles .final-file', { hasText: 'after-repair.webp' });
    await uploadedRow.locator('[data-final-delete-file]').click();
    await expect.poll(() => state.writeCounts['delete-file'] || 0).toBe(1);
    await expect(page.locator('#finalFiles')).not.toContainText('after-repair.webp');

    await page.locator('#finalWarranty').click();
    await expect(page.locator('.final-dialog')).toBeVisible();
    await page.locator('#finalWarrantyReason').fill('Повторно пропало изображение');
    await page.locator('#finalWarrantyCreate').click();
    await expect.poll(() => state.writeCounts['create-warranty'] || 0).toBe(1);
    expect(state.warrantyCreated.warranty_parent_id).toBe('repair-full-1');
    expect(state.warrantyCreated.issue).toBe('Повторно пропало изображение');
    await expect(page.locator('#repairDetailOverlay')).toHaveClass(/hidden/);
    expect(pageErrors).toEqual([]);
  });

  test('rapid order switching keeps only the newest order and performs no writes', async ({ page }) => {
    const state = await installFullMocks(page);
    await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#crmMain')).toBeVisible();
    await page.waitForFunction(() => window.MAOrderController?.version === '5' && window.MAOrderView?.version === '2');
    await page.evaluate(() => {
      window.MAOrderController.open('repair-full-1');
      window.MAOrderController.open('repair-full-2');
      window.MAOrderController.open('repair-full-1');
      window.MAOrderController.open('repair-full-2');
    });
    await expect(page.locator('#repairDetailTitle')).toHaveText('Заказ №4608');
    await expect(page.locator('#repairDetailBody')).toContainText('Samsung A54');
    await expect(page.locator('#repairDetailBody')).not.toContainText('iPhone 13');
    expect(Object.values(state.writeCounts).reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  test('desktop order edit works and closing the modal does not write extra data', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop journey runs in Chromium.');
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const state = await installFullMocks(page);
    await openPrimaryOrder(page, testInfo);
    await page.locator('#detailComment').fill('Desktop E2E comment');
    await page.locator('#saveRepairChanges').click();
    await expect.poll(() => state.writeCounts['update-order'] || 0).toBe(1);
    expect(state.repair.comment).toBe('Desktop E2E comment');
    await page.locator('#closeRepairDetail').click();
    await expect(page.locator('#repairDetailOverlay')).toHaveClass(/hidden/);
    expect(Object.values(state.writeCounts).reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(pageErrors).toEqual([]);
  });
});
