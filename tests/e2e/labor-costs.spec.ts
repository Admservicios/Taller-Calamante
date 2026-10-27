import { test, expect, type Page } from '@playwright/test';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
async function seed(page: Page, legacy = false) {
  await page.clock.setFixedTime(new Date('2026-10-27T15:00:00Z'));
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(
        newDatabase({
          ...emptyData(),
          customers: initialCustomers,
          vehicles: initialVehicles,
          services: legacy ? [initialServices[0]] : [],
        }),
      ),
    },
  );
}
const read = (page: Page): Promise<LocalData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);

test('carga mano de obra, sugiere total, conserva ajustes y propaga correcciones al detalle, PDF, CSV y respaldo', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel(/Detalle del Servicio/).fill('Mantenimiento con repuestos y mano de obra.');
  await page.getByRole('button', { name: 'Agregar artículo manual', exact: true }).click();
  await page.getByLabel('Descripción artículo 1', { exact: true }).fill('Insumo de prueba');
  await page.getByLabel('Cantidad artículo 1', { exact: true }).fill('4.5');
  await page.getByLabel('Precio unitario artículo 1', { exact: true }).fill('100.25');
  const labor = page.getByLabel('Mano de obra (ARS)');
  const total = page.getByLabel('Importe total');
  await total.fill('999');
  await labor.fill('1234.56');
  await expect(total).toHaveValue('999');
  await expect(page.locator('.service-price-suggestion')).toContainText('1.685,69');
  await page.getByRole('button', { name: 'Usar total sugerido', exact: true }).click();
  await expect(total).toHaveValue('1685.69');
  await total.fill('1600');
  await expect(page.locator('.service-price-suggestion')).toContainText('Ajuste / descuento');
  await page
    .locator('.service-price-fields')
    .screenshot({ path: '/tmp/calamante-mano-obra-desktop.png' });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.service-price-fields')
    .screenshot({ path: '/tmp/calamante-mano-obra-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
  const fs = await import('node:fs/promises');
  const pdf = (await fs.readFile((await (await download).path())!)).toString('latin1');
  expect(pdf).toContain('Mano de obra incluida: ARS 1.234,56');
  expect(pdf).toContain('ARS 1.600,00');
  expect(pdf).toContain('Ajuste / descuento:');
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await expect(page.locator('tbody')).toContainText('Mano de obra:');
  const saved = (await read(page)).services[0];
  expect(saved).toMatchObject({ laborAmount: 1234.56, amount: 1600 });
  await page.goto(`/mantenimientos/${saved.id}/editar`);
  await expect(labor).toHaveValue('1234.56');
  await labor.fill('2000.50');
  await expect(total).toHaveValue('1600');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  const updated = await read(page);
  expect(updated.services[0]).toMatchObject({ laborAmount: 2000.5, amount: 1600 });
  expect(updated.services[0].changes!.at(-1)!.changes).toContainEqual({
    field: 'Mano de obra',
    before: '1234.56',
    after: '2000.5',
  });
  await page.goto('/mantenimientos');
  await page.locator('.more-options > summary').click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  expect(await fs.readFile((await (await csvDownload).path())!, 'utf8')).toContain('"2000,50"');
  const row = page.locator(`tr[data-service-id="${saved.id}"]`);
  await row.getByRole('button', { name: /Más opciones de/ }).click();
  await row.getByRole('button', { name: /Ver cambios/ }).click();
  const costs = page.getByRole('region', { name: 'Importe del mantenimiento' });
  await expect(costs).toContainText('2.000,50');
  await expect(costs).toContainText('1.600,00');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(
    await page.getByRole('dialog').evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await page.goto('/backups');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).first().click();
  const backup = JSON.parse(await fs.readFile((await (await backupDownload).path())!, 'utf8'));
  expect(backup.data.services[0].laborAmount).toBe(2000.5);
});

test('servicio anterior permanece sin desglose; cero es explícito y borrar el campo lo vuelve a dejar sin registrar', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto(`/mantenimientos/${initialServices[0].id}/editar`);
  const labor = page.getByLabel('Mano de obra (ARS)');
  await expect(labor).toHaveValue('');
  const initialTotal = initialServices[0].amount.toString();
  await expect(page.getByLabel('Importe total')).toHaveValue(initialTotal);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  expect((await read(page)).services[0]).not.toHaveProperty('laborAmount');
  await page.goto(`/mantenimientos/${initialServices[0].id}/editar`);
  await labor.fill('0');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  expect((await read(page)).services[0].laborAmount).toBe(0);
  await page.goto(`/mantenimientos/${initialServices[0].id}/editar`);
  await labor.fill('');
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-mano-obra-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  expect((await read(page)).services[0]).not.toHaveProperty('laborAmount');
  expect((await read(page)).services[0].amount).toBe(Number(initialTotal));
});
