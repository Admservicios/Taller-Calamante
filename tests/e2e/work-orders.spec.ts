import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { demoProducts } from '../../src/lib/products';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
import { stockBalance } from '../../src/lib/inventory';
async function seed(page: Page) {
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
          vehicles: [{ ...initialVehicles[1], km: 1000, manualKm: 1000, maintenancePlans: [] }],
          services: [{ ...initialServices[0], id: 'old', date: '2026-10-10', km: 900 }],
          stockMovements: [
            {
              id: 'initial',
              productId: 'demo-oil',
              unit: 'Litro',
              kind: 'opening',
              deltaMilli: 10000,
              at: '2026-10-27T12:00:00Z',
              reason: 'Saldo inicial',
            },
          ],
        }),
      ),
    },
  );
}
const read = (page: Page): Promise<LocalData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
async function newQuote(page: Page, quantity = '4.5') {
  await page.goto('/mantenimientos/nuevo?estado=presupuesto&vehiculo=v2');
  await expect(page.getByRole('combobox', { name: 'Estado', exact: true })).toHaveValue(
    'presupuesto',
  );
  await page.getByLabel(/Detalle del Servicio/).fill('Cambio de aceite cotizado para el cliente.');
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar ACE-001', exact: true }).click();
  await page.getByLabel('Cantidad artículo 1', { exact: true }).fill(quantity);
  await page.getByLabel('Mano de obra (ARS)').fill('28000');
  await page.getByRole('button', { name: 'Usar total sugerido', exact: true }).click();
}
async function emit(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar y emitir presupuesto PDF', exact: true }).click();
  const file = await pending;
  return (await readFile((await file.path())!)).toString('latin1');
}
test('presupuesto, confirmación y realización usan el mismo formulario y descuentan stock una sola vez', async ({
  page,
}) => {
  await seed(page);
  await newQuote(page);
  await page.getByLabel('Seleccionar fotos').setInputFiles('tests/fixtures/foto-prueba.jpg');
  await page.locator('.photo-previews img').waitFor();
  await page.getByLabel('Observaciones privadas', { exact: true }).fill('NO-MOSTRAR-PRESUPUESTO');
  const pdf = await emit(page);
  expect(pdf).toContain('Presupuesto');
  expect(pdf).toContain('73.000,00');
  expect(pdf).not.toContain('NO-MOSTRAR');
  await expect(page).toHaveURL(/vista=pendientes/);
  let data = await read(page);
  expect(data.jobs).toHaveLength(1);
  expect(data.services).toHaveLength(1);
  expect(stockBalance(data, 'demo-oil')).toBe(10000);
  expect(data.vehicles[0].km).toBe(1000);
  const id = data.jobs![0].id;
  await page.goto('/mantenimientos?vista=historial');
  await expect(page.locator('tr[data-service-id]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Historial del taller', exact: true }),
  ).toBeVisible();
  await page.goto(`/mantenimientos/${id}/editar`);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('en-trabajo');
  await page.getByRole('button', { name: 'Guardar trabajo', exact: true }).click();
  await expect(page).toHaveURL(/vista=pendientes/);
  data = await read(page);
  expect(data.jobs![0].stage).toBe('en-trabajo');
  expect(stockBalance(data, 'demo-oil')).toBe(10000);
  await page.goto(`/mantenimientos/${id}/editar`);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('completado');
  await page.getByLabel('Kilometraje actual').fill('1500');
  await page.getByRole('button', { name: 'Completar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  data = await read(page);
  expect(data.jobs).toHaveLength(0);
  expect(data.services).toHaveLength(2);
  expect(data.services[0].id).toBe(id);
  expect(data.services[0].quotes).toHaveLength(1);
  expect(data.photos).toHaveLength(1);
  expect(data.photos![0].serviceId).toBe(id);
  expect(data.vehicles[0].km).toBe(1500);
  expect(stockBalance(data, 'demo-oil')).toBe(5500);
  await page.goto(`/mantenimientos/${id}/editar?estado=presupuesto`);
  await expect(page.getByRole('combobox', { name: 'Estado', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  expect(stockBalance(await read(page), 'demo-oil')).toBe(5500);
});
test('las versiones emitidas conservan precios; el trabajo y sus fotos vuelven desde ZIP y se pueden cancelar en celular', async ({
  page,
}) => {
  await seed(page);
  await newQuote(page);
  await page.getByLabel('Seleccionar fotos').setInputFiles('tests/fixtures/foto-prueba.jpg');
  await page.locator('.photo-previews img').waitFor();
  await emit(page);
  let data = await read(page);
  const id = data.jobs![0].id;
  const version = data.jobs![0].quotes![0];
  await page.goto(`/mantenimientos/${id}/editar`);
  await page.getByLabel('Importe total').fill('80000');
  await emit(page);
  data = await read(page);
  expect(data.jobs![0].quotes).toHaveLength(2);
  expect(data.jobs![0].quotes![0]).toEqual(version);
  expect(data.photos).toHaveLength(1);
  await page.goto('/backups');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo', exact: true }).click();
  const archive = await readFile((await (await downloading).path())!);
  await page
    .getByLabel('Seleccionar respaldo JSON o ZIP')
    .setInputFiles({ name: 'presupuesto.zip', mimeType: 'application/zip', buffer: archive });
  await page.getByRole('button', { name: 'Revisar y restaurar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar y restaurar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await read(page)).jobs![0].quotes).toHaveLength(2);
  expect((await read(page)).photos).toHaveLength(1);
  await page.goto(`/mantenimientos/${id}/editar`);
  await expect(page.locator('input[type=checkbox]')).not.toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('cancelado');
  await page.getByLabel('Motivo de cancelación').fill('El cliente no acepta el presupuesto.');
  await page.getByRole('button', { name: 'Guardar cancelación', exact: true }).click();
  await expect(page).toHaveURL(/vista=pendientes/);
  await page.getByLabel('Filtrar por estado del trabajo').selectOption('cancelado');
  await expect(page.locator('[data-job-id]')).toHaveCount(1);
  await page.locator('.quote-history > summary').click();
  const originalPdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF versión 1', exact: true }).click();
  expect((await readFile((await (await originalPdf).path())!)).toString('latin1')).toContain(
    '73.000,00',
  );
  data = await read(page);
  expect(data.jobs![0].stage).toBe('cancelado');
  expect(data.services).toHaveLength(1);
  expect(stockBalance(data, 'demo-oil')).toBe(10000);
  await page.screenshot({ path: '/tmp/calamante-presupuestos-mobile.png', fullPage: true });
});
test('no reserva existencias y conserva el presupuesto cuando falta stock para completar', async ({
  page,
}) => {
  await seed(page);
  await newQuote(page, '20');
  await page.getByRole('button', { name: 'Guardar presupuesto', exact: true }).click();
  await expect(page).toHaveURL(/vista=pendientes/);
  const before = await read(page);
  const id = before.jobs![0].id;
  await page.goto(`/mantenimientos/${id}/editar`);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('completado');
  await page.getByRole('button', { name: 'Completar mantenimiento', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await read(page)).toEqual(before);
  await expect(
    page.getByRole('heading', { name: 'Completar mantenimiento', exact: true }),
  ).toBeVisible();
});

test('dos pestañas no completan dos veces el mismo trabajo', async ({ page, context }) => {
  await seed(page);
  await newQuote(page);
  await page.getByRole('button', { name: 'Guardar presupuesto', exact: true }).click();
  await expect(page).toHaveURL(/vista=pendientes/);
  const id = (await read(page)).jobs![0].id;
  await page.goto(`/mantenimientos/${id}/editar`);
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('completado');
  const second = await context.newPage();
  await second.goto(`/mantenimientos/${id}/editar`);
  await second.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('completado');
  await second.getByRole('button', { name: 'Completar mantenimiento', exact: true }).click();
  await expect(second).toHaveURL(/vehiculos\/v2$/);
  await expect(page.locator('.toast')).toContainText('cambió en otra pestaña');
  await page.getByRole('button', { name: 'Completar mantenimiento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cambió');
  const data = await read(page);
  expect(data.jobs).toHaveLength(0);
  expect(data.services.filter((s) => s.id === id)).toHaveLength(1);
  expect(stockBalance(data, 'demo-oil')).toBe(5500);
  expect(data.stockMovements).toHaveLength(2);
});

test('un fallo al guardar no emite un PDF ni pierde el presupuesto que se está preparando', async ({
  page,
}) => {
  await seed(page);
  await newQuote(page);
  const before = await read(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('Sin espacio');
      return original.call(this, name, value);
    };
  }, DATABASE_KEY);
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  await page.getByRole('button', { name: 'Guardar y emitir presupuesto PDF', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No se pudo guardar' }).first(),
  ).toBeVisible();
  expect(await read(page)).toEqual(before);
  expect(downloads).toHaveLength(0);
  await expect(page.getByLabel('Importe total')).toHaveValue('73000.00');
});
