const { test, expect } = require('@playwright/test');

const FUNCTIONS = 'https://yedzfmibceboncrytbqz.supabase.co/functions/v1/';

async function installShellMocks(page) {
  await page.addInitScript(() => {
    localStorage.setItem('ma_crm_session_v1', 'e2e.shell.session');
    localStorage.setItem('ma_crm_employee_v1', 'Тест Менеджер');
  });

  await page.route(`${FUNCTIONS}**`, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }
    let body = {};
    try { body = JSON.parse(request.postData() || '{}'); } catch (_) {}
    const slug = new URL(request.url()).pathname.split('/').pop();
    const op = String(body.op || '');
    let response = { ok: true, rows: [], files: [], transactions: [], products: [], stock: [] };

    if (slug === 'ma-crm-api' && op === 'bootstrap') {
      response = {
        ok: true,
        actor: { kind: 'admin', employee: 'Администратор', role: 'admin' },
        services: ['Мобильный Ангел', 'Nova'],
        employees: [
          { name: 'Тест Менеджер', role: 'manager' },
          { name: 'Георгий', role: 'master' },
        ],
      };
    } else if (slug === 'ma-crm-api' && op === 'list-repairs') {
      response = { ok: true, repairs: [] };
    } else if (slug === 'ma-crm-api' && op === 'list-sales') {
      response = { ok: true, sales: [] };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(response),
    });
  });
}

test.describe('MA CRM iPhone shell', () => {
  test('hamburger opens on a real touch tap and backdrop closes it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Touch menu behavior is iPhone-specific.');
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await installShellMocks(page);
    await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#crmMain')).toBeVisible();
    await expect(page.locator('#openSidebar')).toBeVisible();

    await page.locator('#openSidebar').tap();
    await expect(page.locator('#crmSidebar')).toHaveClass(/open/);
    await expect(page.locator('#sidebarBackdrop')).toBeVisible();

    await page.locator('#sidebarBackdrop').tap({ position: { x: 340, y: 200 } });
    await expect(page.locator('#crmSidebar')).not.toHaveClass(/open/);
    await expect(page.locator('#sidebarBackdrop')).toHaveClass(/hidden/);
    expect(pageErrors).toEqual([]);
  });

  test('orphaned scroll lock is repaired and dashboard remains vertically scrollable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-webkit', 'Scroll lock regression is iPhone-specific.');
    await installShellMocks(page);
    await page.goto('/crm.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#crmMain')).toBeVisible();

    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'e2eScrollSpacer';
      spacer.style.height = '1800px';
      document.getElementById('crmMain').appendChild(spacer);
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new Event('pageshow'));
    });

    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});
