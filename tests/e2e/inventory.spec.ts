import { showMoreOptions } from './helpers/options';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { demoProducts } from '../../src/lib/products';
import { stockBalance } from '../../src/lib/inventory';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
async function seed(page: Page, opening = true) {
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
          products: demoProducts,
          customers: initialCustomers,
          vehicles: initialVehicles,
          services: initialServices,
          ...(opening
            ? {
                stockMovements: [
                  {
                    id: 'stock-initial',
                    productId: 'demo-oil',
                    unit: 'Litro',
                    kind: 'opening',
                    deltaMilli: 10000,
                    at: '2026-10-27T12:00:00Z',
                    reason: 'Inventario inicial ficticio',
                  },
                ],
              }
            : {}),
        }),
      ),
    },
  );
}
const read = (page: Page): Promise<LocalData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
async function stock(page: Page) {
  await page.goto('/productos');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Stock y movimientos ACE-001', exact: true }).click();
  return page.getByRole('dialog');
}
async function draft(page: Page, quantity = '4.5') {
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByLabel(/Detalle del Servicio/).fill('Servicio con control de stock');
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  await page.getByLabel('Buscar producto', { exact: true }).fill('ACE-001');
  await page.getByRole('button', { name: 'Agregar ACE-001', exact: true }).click();
  await page.getByLabel('Cantidad artículo 1', { exact: true }).fill(quantity);
  await page.getByLabel('Importe total').fill('65000');
}
async function save(page: Page, edit = false) {
  await page
    .getByRole('button', { name: edit ? 'Guardar cambios' : 'Guardar mantenimiento', exact: true })
    .click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
}

test('saldo inicial, ingreso y ajuste con motivo: guarda y rechaza cantidades que dejan negativo', async ({
  page,
}) => {
  await seed(page, false);
  const dialog = await stock(page);
  await dialog.getByLabel(/Cantidad/).fill('10.5');
  await dialog.getByLabel(/Motivo/).fill('Conteo inicial del depósito');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(stockBalance(await read(page), 'demo-oil')).toBe(10500);
  await page.getByRole('button', { name: 'Stock y movimientos ACE-001', exact: true }).click();
  await dialog.getByLabel('Tipo de movimiento').selectOption('minus');
  await dialog.getByLabel(/Cantidad/).fill('11');
  await dialog.getByLabel(/Motivo/).fill('Ajuste de prueba inválido');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('negativo');
  expect(stockBalance(await read(page), 'demo-oil')).toBe(10500);
  await dialog.getByLabel('Tipo de movimiento').selectOption('receipt');
  await dialog.getByLabel(/Cantidad/).fill('2');
  await dialog.getByLabel(/Motivo/).fill('Compra de aceite de prueba');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await showMoreOptions(page);
  expect(stockBalance(await read(page), 'demo-oil')).toBe(12500);
});

test('consume al guardar, corrige la diferencia, anula y recupera; ZIP conserva el historial completo', async ({
  page,
}) => {
  await seed(page);
  await draft(page);
  await save(page);
  let state = await read(page);
  const service = state.services.find((s) => s.work === 'Servicio con control de stock')!;
  expect(stockBalance(state, 'demo-oil')).toBe(5500);
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await showMoreOptions(page);
  await page.getByLabel('Cantidad artículo 1', { exact: true }).fill('6');
  await save(page, true);
  expect(stockBalance(await read(page), 'demo-oil')).toBe(4000);
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await showMoreOptions(page);
  await page.getByLabel('Precio unitario artículo 1', { exact: true }).fill('9500');
  await save(page, true);
  expect((await read(page)).stockMovements).toHaveLength(3);
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  let row = page.locator(`tr[data-service-id="${service.id}"]`);
  await row.getByRole('button', { name: /Anular servicio/ }).click();
  await page.getByLabel('Motivo de anulación').fill('Anulación para verificar devolución');
  await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(stockBalance(await read(page), 'demo-oil')).toBe(10000);
  await page.goto('/mantenimientos?estado=anulados');
  await showMoreOptions(page);
  row = page.locator(`tr[data-service-id="${service.id}"]`);
  await row.getByRole('button', { name: /Recuperar servicio/ }).click();
  await page.getByLabel('Motivo de recuperación').fill('Recuperación del trabajo confirmado');
  await page.getByRole('button', { name: 'Confirmar recuperación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  state = await read(page);
  expect(stockBalance(state, 'demo-oil')).toBe(4000);
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo', exact: true }).click();
  const entries = unzipSync(await readFile((await (await pending).path())!));
  const backup = JSON.parse(new TextDecoder().decode(entries['backup.json']));
  expect(backup.data.stockMovements).toEqual(state.stockMovements);
  expect(backup.data.services.find((s: { id: string }) => s.id === service.id).stockManaged).toBe(
    true,
  );
});

test('falta de stock y fallo de almacenamiento conservan servicio, fotos y saldos para reintentar una sola vez', async ({
  page,
}) => {
  await seed(page);
  await draft(page, '11');
  const before = await read(page);
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Stock insuficiente');
  expect(await read(page)).toEqual(before);
  await page.getByLabel('Cantidad artículo 1', { exact: true }).fill('4.5');
  await page
    .getByLabel('Seleccionar fotos')
    .setInputFiles(new URL('../fixtures/foto-prueba.jpg', import.meta.url).pathname);
  await expect(page.locator('.photo-previews img')).toHaveCount(1);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restoreWrite: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('Fallo de prueba');
      return original.call(this, name, value);
    };
  }, DATABASE_KEY);
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('No se pudo guardar');
  expect(await read(page)).toEqual(before);
  await page.evaluate(() => (window as unknown as { restoreWrite: () => void }).restoreWrite());
  await save(page);
  const after = await read(page);
  expect(stockBalance(after, 'demo-oil')).toBe(5500);
  expect(after.photos).toHaveLength(1);
  expect(after.services).toHaveLength(before.services.length + 1);
});

test('unidad con movimientos bloqueada y editor de stock obsoleto no sobrescribe otra pestaña; celular sin desborde', async ({
  page,
  context,
}) => {
  await seed(page, false);
  let dialog = await stock(page);
  await dialog.getByLabel(/Cantidad/).fill('7');
  await dialog.getByLabel(/Motivo/).fill('Conteo anterior de prueba');
  const second = await context.newPage();
  const secondDialog = await stock(second);
  await secondDialog.getByLabel(/Cantidad/).fill('10');
  await secondDialog.getByLabel(/Motivo/).fill('Conteo confirmado en otra pestaña');
  await secondDialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(secondDialog).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('cambió');
  expect(stockBalance(await read(page), 'demo-oil')).toBe(10000);
  await second.getByRole('button', { name: 'Editar producto ACE-001', exact: true }).click();
  await secondDialog.getByLabel('Unidad de medida').selectOption('Unidad');
  await secondDialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(secondDialog.getByRole('alert')).toContainText('unidad');
  await secondDialog.getByLabel('Unidad de medida').selectOption('Litro');
  await secondDialog.getByLabel('Precio sugerido').fill('14000');
  await secondDialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(secondDialog).toHaveCount(0);
  await second.setViewportSize({ width: 320, height: 800 });
  dialog = await stock(second);
  expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await second.screenshot({ path: '/tmp/calamante-stock-mobile.png', fullPage: true });
  await expect(dialog).toContainText('10 Litro');
});

test('editar un servicio antiguo conserva artículos sin inventar movimientos retroactivos', async ({
  page,
}) => {
  await seed(page);
  const old = initialServices[0];
  await page.goto(`/mantenimientos/${old.id}/editar`);
  await showMoreOptions(page);
  const before = await read(page);
  await expect(page.getByText(/Servicio anterior al control de stock:/)).toBeVisible();
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  await page.getByLabel('Buscar producto', { exact: true }).fill('ACE-001');
  await page.getByRole('button', { name: 'Agregar ACE-001', exact: true }).click();
  await save(page, true);
  const after = await read(page);
  expect(after.stockMovements).toEqual(before.stockMovements);
  expect(after.services.find((s) => s.id === old.id)!.stockManaged).toBeUndefined();
});

test('recuperación sin existencias explica el error dentro del diálogo y conserva la anulación', async ({
  page,
}) => {
  await seed(page);
  await draft(page);
  await save(page);
  const service = (await read(page)).services.find(
    (s) => s.work === 'Servicio con control de stock',
  )!;
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await page
    .locator(`tr[data-service-id="${service.id}"]`)
    .getByRole('button', { name: /Anular servicio/ })
    .click();
  await page.getByLabel('Motivo de anulación').fill('Anulación confirmada de prueba');
  await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const dialog = await stock(page);
  await dialog.getByLabel('Tipo de movimiento').selectOption('minus');
  await dialog.getByLabel(/Cantidad/).fill('10');
  await dialog.getByLabel(/Motivo/).fill('Retiro de existencias para la prueba');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const before = await read(page);
  await page.goto('/mantenimientos?estado=anulados');
  await showMoreOptions(page);
  await page
    .locator(`tr[data-service-id="${service.id}"]`)
    .getByRole('button', { name: /Recuperar servicio/ })
    .click();
  await page.getByLabel('Motivo de recuperación').fill('Intento sin stock de prueba');
  await page.getByRole('button', { name: 'Confirmar recuperación', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Stock insuficiente');
  expect(await read(page)).toEqual(before);
  await expect(page.getByLabel('Motivo de recuperación')).toHaveValue(
    'Intento sin stock de prueba',
  );
});
