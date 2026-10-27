import { test, expect, type Page } from '@playwright/test';
import fixture from '../../src/data/taller-calamante-practica-stock.json' with { type: 'json' };
import { DATABASE_KEY, newDatabase, parseBackup } from '../../src/lib/localDatabase';
import { itemMoney, totalItemCents, itemCents } from '../../src/lib/supplyItems';
const data = parseBackup(JSON.stringify(fixture)).data;
const service = data.services.find((s) => !s.annulment && (s.supplyItems?.length ?? 0) >= 3)!;
async function seed(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: DATABASE_KEY, value: JSON.stringify(newDatabase(data)) },
  );
}
const rowFor = (page: Page) => page.locator(`tr[data-service-id="${service.id}"]`);

test('menú de acciones, cierre por teclado y fuera, insumos legibles en escritorio y celular sin modificar datos', async ({
  page,
}) => {
  await seed(page);
  await page.goto(
    `/mantenimientos?buscar=${data.vehicles.find((v) => v.id === service.vehicleId)!.plate}&desde=${service.date}&hasta=${service.date}`,
  );
  const row = rowFor(page);
  await expect(row).toBeVisible();
  const before = await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);
  const trigger = row.getByRole('button', { name: /Más opciones de/ });
  await expect(row.getByRole('link', { name: /Editar servicio/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Anular servicio/ })).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(row.getByRole('button', { name: /^Descargar PDF/ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(row.getByRole('button', { name: /^Descargar PDF/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('heading', { name: 'Mantenimientos', exact: true }).click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await row.getByRole('button', { name: /Ver cambios/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Detalle y cambios del mantenimiento' });
  const supplies = dialog.getByRole('region', { name: 'Insumos y repuestos del mantenimiento' });
  await expect(supplies.getByRole('table', { name: 'Artículos utilizados' })).toBeVisible();
  await expect(supplies.locator('tbody tr')).toHaveCount(service.supplyItems!.length);
  await expect(supplies.locator('.service-supplies-total strong')).toHaveText(
    itemMoney(totalItemCents(service.supplyItems!)),
  );
  for (const [index, item] of service.supplyItems!.entries()) {
    const line = supplies.locator('tbody tr').nth(index);
    await expect(line).toContainText(item.description);
    await expect(line).toContainText(itemMoney(itemCents(item)));
  }
  await page.screenshot({ path: '/tmp/calamante-detalle-insumos-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(
    await supplies
      .locator('.table-scroll')
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await supplies.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/calamante-detalle-insumos-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  const menu = row.locator('.service-actions-popup');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await expect(row.getByRole('button', { name: /Anular servicio/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/calamante-menu-servicio-mobile.png', fullPage: false });
  await page.keyboard.press('Escape');
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBe(before);
});

test('los insumos antiguos conservan su texto y no inventan importes', async ({ page }) => {
  const legacy = data.services.find((s) => !s.annulment && s.supplyItems === undefined)!;
  await seed(page);
  await page.goto(`/mantenimientos?desde=${legacy.date}&hasta=${legacy.date}`);
  const row = page.locator(`tr[data-service-id="${legacy.id}"]`);
  await row.getByRole('button', { name: /Más opciones de/ }).click();
  await row.getByRole('button', { name: /Ver cambios/ }).click();
  const supplies = page.getByRole('region', { name: 'Insumos y repuestos del mantenimiento' });
  await expect(supplies).toContainText(legacy.supplies);
  await expect(supplies.locator('table')).toHaveCount(0);
  await expect(supplies.locator('.service-supplies-total')).toHaveCount(0);
});
