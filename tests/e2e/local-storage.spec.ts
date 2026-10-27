import { showMoreOptions } from './helpers/options';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import practiceBackup from '../../src/data/taller-calamante-practica-stock.json' with { type: 'json' };
import {
  DATABASE_KEY,
  SAFETY_COPY_KEY,
  emptyData,
  makeBackup,
  newDatabase,
} from '../../src/lib/localDatabase';

const sample = {
  ...emptyData(),
  customers: initialCustomers,
  vehicles: initialVehicles,
  services: initialServices,
};
async function seed(page: Page) {
  await page.addInitScript(
    ({ key, data }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, data);
    },
    { key: DATABASE_KEY, data: JSON.stringify(newDatabase(sample)) },
  );
}
async function addCustomer(page: Page, name: string) {
  await page.goto('/clientes');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await dialog.getByLabel(/Nombre y apellido/).fill(name);
  await dialog.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
}
async function dataFromBrowser(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
test('base vacía, persistencia de cliente y aislamiento entre navegadores', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await showMoreOptions(page);
  await expect(page.locator('.demo-banner')).toContainText('Base local');
  await expect(page.locator('body')).not.toContainText('NaN');
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(page.getByText('No encontramos clientes')).toBeVisible();
  await addCustomer(page, 'Cliente local de prueba');
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByRole('button', { name: /^Cliente local de prueba/ })).toBeVisible();
  const data = await dataFromBrowser(page);
  expect(data.customers).toHaveLength(1);
  expect(data.customers[0].name).toBe('Cliente local de prueba');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const secondPage = await other.newPage();
    await secondPage.goto('/clientes');
    await expect(secondPage.getByText('No encontramos clientes')).toBeVisible();
  } finally {
    await other.close();
  }
});

test('demo separada y vista pública sin datos locales', async ({ page }) => {
  await addCustomer(page, 'Persona privada local');
  await page.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await expect(page.locator('.demo-banner')).toContainText('Vista de demostración');
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(page.getByRole('button', { name: /^Juan Pérez/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Persona privada local/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver a mis datos' }).click();
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(page.getByRole('button', { name: /^Persona privada local/ })).toBeVisible();
  expect((await dataFromBrowser(page)).customers).toHaveLength(1);
  await page.goto('/publico/demo/v2');
  await showMoreOptions(page);
  await expect(page.locator('body')).not.toContainText('Persona privada local');
});

test('mantenimiento y kilometraje sobreviven a una recarga; el QR local no expone registros', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByLabel(/Detalle del Servicio/).fill('Mantenimiento local persistente');
  await page.getByLabel(/Importe total/).fill('120000');
  await page.getByLabel(/Kilometraje actual/).fill('113000');
  await page.getByLabel(/Kilometraje objetivo/).fill('123000');
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByText('Mantenimiento local persistente', { exact: true })).toBeVisible();
  const data = await dataFromBrowser(page);
  expect(data.services).toHaveLength(9);
  expect(data.vehicles.find((v: { id: string }) => v.id === 'v2').km).toBe(113000);
  await expect(page.getByRole('link', { name: 'Descargar QR demo' })).toHaveCount(0);
  await page.goto('/publico/demo/v2');
  await showMoreOptions(page);
  await expect(page.locator('body')).not.toContainText('Mantenimiento local persistente');
});

test('crear un vehículo nuevo y actualizar el taller en la base local', async ({ page }) => {
  await addCustomer(page, 'Propietario de prueba');
  await page.goto('/vehiculos');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Nuevo vehículo' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Patente/).fill('AE 100 ZZ');
  await dialog.getByLabel(/^Marca/).fill('Toyota');
  await dialog.getByLabel(/^Modelo/).fill('Corolla');
  await dialog.getByLabel(/Kilometraje registrado/).fill('25000');
  await dialog.getByRole('button', { name: 'Guardar vehículo' }).click();
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByRole('heading', { name: 'Toyota Corolla' })).toBeVisible();
  await page.goto('/ajustes');
  await showMoreOptions(page);
  await page.getByLabel(/Nombre del taller/).fill('Taller de prueba local');
  await page.getByRole('button', { name: 'Guardar taller' }).click();
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByLabel(/Nombre del taller/)).toHaveValue('Taller de prueba local');
  await expect(page.locator('.profile-button')).toContainText('Taller de prueba local');
});

test('guardar con PDF, volver a descargarlo y conservar un único mantenimiento', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByLabel(/Detalle del Servicio/).fill('Trabajo para comprobante PDF.');
  await page.getByRole('button', { name: 'Agregar artículo manual', exact: true }).click();
  await page.getByLabel('Descripción artículo 1').fill('Filtro de habitáculo: MANN CUK 2939');
  await page.getByLabel('Precio unitario artículo 1').fill('12000');
  await page.getByLabel('Observaciones privadas', { exact: true }).fill('SECRETO-PDF-NO-INCLUIR');
  await page.getByLabel(/Importe total/).fill('58400.75');
  await page.getByLabel(/Kilometraje actual/).fill('113000');
  await page.getByLabel(/Kilometraje objetivo/).fill('123000');
  await page.getByLabel('Trabajo recomendado').selectOption('Cambio de aceite y filtros');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toMatch(/AF-456-EF.*\.pdf$/);
  await downloaded.saveAs('/tmp/taller-calamante-comprobante-prueba.pdf');
  const pdf = (await readFile((await downloaded.path())!)).toString('latin1');
  expect(pdf).toMatch(/^%PDF-/);
  expect(pdf).toContain('Trabajo para comprobante PDF.');
  expect(pdf).toContain('ARS 58.400,75');
  expect(pdf).toContain('Filtro de habitáculo: MANN CUK 2939');
  expect(pdf).toContain('123.000 km');
  expect(pdf).toContain('Cambio de aceite y filtros');
  expect(pdf).not.toContain('SECRETO-PDF-NO-INCLUIR');
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  await showMoreOptions(page);
  const before = await dataFromBrowser(page);
  expect(before.services).toHaveLength(initialServices.length + 1);
  expect(before.services[0].supplies).toContain('Filtro de habitáculo: MANN CUK 2939');
  const row = page.getByRole('row').filter({ hasText: 'Trabajo para comprobante PDF.' });
  const second = page.waitForEvent('download');
  await row.getByRole('button', { name: /^Descargar PDF/ }).click();
  expect((await readFile((await (await second).path())!)).toString('latin1')).toContain(
    'Trabajo para comprobante PDF.',
  );
  expect(await dataFromBrowser(page)).toEqual(before);
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await page
    .getByRole('button', { name: /^Más opciones de/ })
    .first()
    .click();
  const third = page.waitForEvent('download');
  await page
    .getByRole('button', { name: /^Descargar PDF/ })
    .first()
    .click();
  expect((await readFile((await (await third).path())!)).toString('latin1')).toMatch(/^%PDF-/);
  expect(await dataFromBrowser(page)).toEqual(before);
});

test('fallo de generación PDF conserva el servicio y permite descargarlo después', async ({
  page,
}) => {
  await seed(page);
  await page.route('**/*jspdf*', (route) => route.abort());
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByLabel(/Detalle del Servicio/).fill('Servicio guardado aunque falle el PDF.');
  await page.getByLabel(/Importe total/).fill('45000');
  await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await expect(page.locator('.toast[role="status"]')).toContainText(
    'El mantenimiento quedó guardado',
  );
  expect((await dataFromBrowser(page)).services).toHaveLength(initialServices.length + 1);
  await page.unroute('**/*jspdf*');
  await page.reload();
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page
    .getByRole('row')
    .filter({ hasText: 'Servicio guardado aunque falle el PDF.' })
    .getByRole('button', { name: /^Descargar PDF/ })
    .click();
  expect((await pending).suggestedFilename()).toMatch(/\.pdf$/);
  expect((await dataFromBrowser(page)).services).toHaveLength(initialServices.length + 1);
});

test('almacenamiento lleno impide guardar y generar un comprobante de un servicio no guardado', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  const before = await dataFromBrowser(page);
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, value: string) {
      if (k === key) throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, DATABASE_KEY);
  await page.getByLabel(/Detalle del Servicio/).fill('Este servicio no debe guardarse.');
  await page.getByLabel(/Importe total/).fill('45000');
  await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('No se pudo guardar');
  await expect(page).toHaveURL(/mantenimientos\/nuevo/);
  expect(downloads).toBe(0);
  expect(await dataFromBrowser(page)).toEqual(before);
});

test('alineación y balanceo: detalle, persistencia y respaldo desde el móvil', async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await expect(page.getByLabel(/Alineación realizada/)).toHaveCount(0);
  await page.getByLabel(/Tipo de servicio/).selectOption('Alineación y balanceo');
  await expect(
    page.getByRole('heading', { name: 'Alineación y balanceo', exact: true }),
  ).toBeVisible();
  await page.getByLabel(/Detalle del Servicio/).fill('     ');
  await page.getByLabel(/Importe total/).fill('45000');
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Describí los trabajos realizados');
  await page.getByLabel(/Detalle del Servicio/).fill('Se corrigió la deriva y la vibración.');
  await page.getByLabel(/Alineación realizada/).selectOption('No realizada');
  await page.getByLabel(/Ruedas balanceadas/).selectOption('No realizado');
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Indicá una alineación o un balanceo');
  expect((await dataFromBrowser(page)).services).toHaveLength(initialServices.length);
  await page.getByLabel(/Alineación realizada/).selectOption('Ejes delantero y trasero');
  await page.getByLabel(/Ruedas balanceadas/).selectOption('2 ruedas delanteras');
  await page.getByLabel('Trabajo recomendado').selectOption('Alineación y balanceo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  await showMoreOptions(page);
  const work =
    'Alineación: Ejes delantero y trasero. Balanceo: 2 ruedas delanteras. Se corrigió la deriva y la vibración.';
  await expect(page.getByText(work, { exact: true })).toBeVisible();
  const data = await dataFromBrowser(page);
  const added = data.services.find((s: { work: string }) => s.work === work);
  expect(added).toMatchObject({ type: 'Alineación y balanceo', amount: 45000, public: false });
  expect(data.services.filter((s: { id: string }) => s.id !== added.id)).toEqual(initialServices);
  const updatedVehicle = data.vehicles.find((v: { id: string }) => v.id === 'v2');
  expect(
    updatedVehicle.maintenancePlans.find(
      (p: { category: string }) => p.category === 'alineacion-balanceo',
    ).recommendation,
  ).toBe('Alineación y balanceo');
  expect(
    updatedVehicle.maintenancePlans.find(
      (p: { category: string }) => p.category === 'aceite-filtros',
    ).nextKm,
  ).toBe(initialVehicles[1].nextKm);
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await page.getByRole('textbox', { name: 'Buscar mantenimientos' }).fill('alineación');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Alineación y balanceo');
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).first().click();
  const backup = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(backup.data.services.find((s: { id: string }) => s.id === added.id)).toEqual(added);
});

test('exportar y restaurar con confirmación y copia previa', async ({ page }) => {
  await seed(page);
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).first().click();
  const content = await readFile((await (await pending).path())!, 'utf8');
  const backup = JSON.parse(content);
  expect(backup.format).toBe('motortrack-backup');
  await addCustomer(page, 'Cliente agregado después del respaldo');
  expect((await dataFromBrowser(page)).customers).toHaveLength(9);
  await page.goto('/backups');
  await showMoreOptions(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'respaldo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await dataFromBrowser(page)).customers).toHaveLength(9);
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await dataFromBrowser(page)).toEqual(backup.data);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).data.customers.length,
      SAFETY_COPY_KEY,
    ),
  ).toBe(9);
  await page.reload();
  await showMoreOptions(page);
  expect(await dataFromBrowser(page)).toEqual(backup.data);
});

test('descargar la base de práctica e importarla conserva las relaciones y persiste al recargar', async ({
  page,
}) => {
  await addCustomer(page, 'Cliente previo a la práctica');
  const before = await dataFromBrowser(page);
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar datos de práctica', exact: true }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe('taller-calamante-practica-stock.json');
  const content = await readFile((await downloaded.path())!, 'utf8');
  expect(JSON.parse(content)).toEqual(practiceBackup);
  expect(await dataFromBrowser(page)).toEqual(before);
  await page.getByLabel('Seleccionar respaldo JSON').setInputFiles({
    name: downloaded.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
  await expect(page.locator('.backup-candidate')).toContainText(
    '12 clientes · 16 vehículos · 48 mantenimientos',
  );
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await expect(page.getByRole('dialog')).toContainText('No se combinan registros');
  expect(await dataFromBrowser(page)).toEqual(before);
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await showMoreOptions(page);
  expect(await dataFromBrowser(page)).toEqual(practiceBackup.data);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, SAFETY_COPY_KEY),
  ).toEqual(before);
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(page.getByRole('button', { name: /^Julián Acosta/ })).toBeVisible();
  await page.goto('/vehiculos/practica-v02');
  await showMoreOptions(page);
  await expect(page.getByRole('heading', { name: /Toyota Hilux SRX/ })).toBeVisible();
  await expect(page.getByText(/Corrección de convergencia/)).toBeVisible();
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await page.getByRole('textbox', { name: 'Buscar mantenimientos' }).fill('alineación');
  await expect(page.locator('tbody tr')).toHaveCount(
    practiceBackup.data.services.filter((s) => s.type === 'Alineación y balanceo').length,
  );
});

test('respaldo inválido y almacenamiento lleno no destruyen registros', async ({ page }) => {
  await seed(page);
  await page.goto('/backups');
  await showMoreOptions(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'invalido.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole('alert')).toContainText('Respaldo inválido');
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBe(before);
  await page.goto('/clientes');
  await showMoreOptions(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, value: string) {
      if (k === key) throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, k, value);
    };
  }, DATABASE_KEY);
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Nombre y apellido/)
    .fill('No debe guardarse');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cliente' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.toast[role="status"]')).toContainText('No se pudo guardar');
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBe(before);
});

test('base dañada: se conserva hasta restaurar un respaldo validado', async ({ page }) => {
  await page.addInitScript((key) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, '{datos incompletos');
  }, DATABASE_KEY);
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(page.getByRole('alert')).toContainText('No se puede usar la base local');
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBe(
    '{datos incompletos',
  );
  await page.goto('/backups');
  await showMoreOptions(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'valido.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(makeBackup(sample))),
  });
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await dataFromBrowser(page)).customers).toHaveLength(8);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAFETY_COPY_KEY)).toBe(
    '{datos incompletos',
  );
});
