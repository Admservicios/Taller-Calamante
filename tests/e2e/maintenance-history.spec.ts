import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import {
  initialCustomers,
  initialVehicles,
  initialServices,
  type Service,
} from '../../src/lib/demo';
import {
  DATABASE_KEY,
  emptyData,
  newDatabase,
  parseBackup,
  type LocalData,
} from '../../src/lib/localDatabase';
import { servicePlan } from '../../src/lib/maintenancePlans';

const oil: Service = {
  ...initialServices[0],
  id: 'history-oil',
  vehicleId: 'v2',
  type: 'Cambio de aceite',
  date: '2026-01-10',
  km: 10000,
};
oil.maintenance = servicePlan(oil, {
  date: '2026-07-10',
  km: 20000,
  recommendation: 'Aceite y filtros',
});
const brakes: Service = {
  ...oil,
  id: 'history-brakes',
  type: 'Frenos',
  date: '2026-02-10',
  km: 13000,
};
brakes.maintenance = servicePlan(brakes, {
  date: '2027-02-10',
  km: 43000,
  recommendation: 'Revisión de frenos',
});
async function seed(page: Page, many = false) {
  await page.clock.setFixedTime(new Date('2026-10-23T15:00:00Z'));
  const data: LocalData = {
    ...emptyData(),
    customers: initialCustomers,
    vehicles: [
      {
        ...initialVehicles[1],
        km: 13000,
        manualKm: 0,
        maintenancePlans: [oil.maintenance!, brakes.maintenance!],
      },
      { ...initialVehicles[0], km: 200, manualKm: 200, maintenancePlans: [] },
    ],
    services: [oil, brakes],
  };
  if (many)
    for (let i = 1; i <= 11; i++)
      data.services.push({
        ...oil,
        id: `extra-${i}`,
        vehicleId: 'v1',
        type: 'Revisión general',
        date: `2026-01-${String(i).padStart(2, '0')}`,
        km: 100 + i,
        maintenance: undefined,
      });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: DATABASE_KEY, value: JSON.stringify(newDatabase(data)) },
  );
}
const row = (page: Page, id = brakes.id) => page.locator(`tr[data-service-id="${id}"]`);
async function data(page: Page): Promise<LocalData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
async function annul(page: Page) {
  await row(page)
    .getByRole('button', { name: /Anular servicio/ })
    .click();
  await page.getByLabel('Motivo de anulación').fill('Carga duplicada de prueba');
  await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('filtra por cliente, categoría, fechas y texto; pagina y conserva los filtros al editar', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/mantenimientos');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page
    .getByRole('combobox', { name: 'Tipo de servicio', exact: true })
    .selectOption('frenos');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible();
  await row(page)
    .getByRole('link', { name: /Editar servicio/ })
    .click();
  await page.goBack();
  await expect(page.getByRole('combobox', { name: 'Tipo de servicio', exact: true })).toHaveValue(
    'frenos',
  );
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByLabel('Cliente del vehículo').selectOption(initialVehicles[1].customerId);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Desde', { exact: true }).fill('2026-02-10');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-02-10');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Buscar mantenimientos').fill('frenos');
  await expect(row(page)).toBeVisible();
  await page.reload();
  await expect(row(page)).toBeVisible();
  await page.getByLabel('Hasta', { exact: true }).fill('2026-01-01');
  await expect(page.getByRole('alert')).toContainText('Desde');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.getByLabel('Registros por página').selectOption('25');
  await expect(page.locator('tbody tr')).toHaveCount(13);
});

test('anula, conserva fotos y auditoría en ZIP y recupera el mantenimiento con sus vencimientos', async ({
  page,
}) => {
  await seed(page);
  await page.goto(`/mantenimientos/${brakes.id}/editar`);
  await page.getByLabel('Seleccionar fotos').setInputFiles({
    name: 'frenos.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../fixtures/foto-prueba.jpg', import.meta.url)),
  });
  await expect(page.getByRole('button', { name: 'Quitar frenos.jpg', exact: true })).toBeVisible();
  await page.getByLabel('Importe total').fill('12345');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  const before = await data(page);
  const photos = before.photos;
  await page.goto('/mantenimientos');
  await annul(page);
  await expect(row(page)).toHaveCount(0);
  const cancelled = await data(page);
  expect(cancelled.services.find((s) => s.id === brakes.id)?.annulment?.reason).toBe(
    'Carga duplicada de prueba',
  );
  expect(cancelled.vehicles[0]).toMatchObject({ km: 10000, maintenancePlans: [oil.maintenance] });
  expect(cancelled.photos).toEqual(photos);
  await page.goto('/vehiculos/v2');
  await expect(page.locator('tbody')).not.toContainText('Frenos');
  await page.goto('/backups');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  const entries = unzipSync(await readFile((await (await download).path())!));
  const backup = parseBackup(strFromU8(entries['backup.json']));
  expect(
    backup.data.services.find((s) => s.id === brakes.id)?.changes?.map((c) => c.action),
  ).toEqual(['edited', 'annulled']);
  expect(Object.keys(entries).filter((k) => k.startsWith('photos/'))).toHaveLength(1);
  await page.goto('/mantenimientos?estado=anulados');
  await expect(row(page)).toBeVisible();
  await expect(row(page).getByRole('link', { name: /Editar servicio/ })).toHaveCount(0);
  await row(page)
    .getByRole('button', { name: /Ver cambios/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Importe');
  await expect(dialog).toContainText('Carga duplicada de prueba');
  await expect(dialog.locator('.maintenance-photo-card img')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await row(page)
    .getByRole('button', { name: /Recuperar servicio/ })
    .click();
  await page.getByLabel('Motivo de recuperación').fill('Registro confirmado por el taller');
  await page.getByRole('button', { name: 'Confirmar recuperación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row(page)).toHaveCount(0);
  await page.getByLabel('Estado del mantenimiento').selectOption('activos');
  await expect(row(page)).toBeVisible();
  await page.reload();
  const recovered = await data(page);
  expect(recovered.photos).toEqual(photos);
  expect(recovered.vehicles[0].km).toBe(13000);
  expect(recovered.services.find((s) => s.id === brakes.id)?.changes?.map((c) => c.action)).toEqual(
    ['edited', 'annulled', 'restored'],
  );
  expect(recovered.services.find((s) => s.id === brakes.id)?.annulment).toBeUndefined();
  expect(recovered.vehicles[0].maintenancePlans).toEqual(before.vehicles[0].maintenancePlans);
});

test('una anulación fallida conserva la base y el motivo para volver a guardar', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos');
  await row(page)
    .getByRole('button', { name: /Anular servicio/ })
    .click();
  await page.getByLabel('Motivo de anulación').fill('Registro incorrecto');
  const before = await data(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restoreWrite: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('sin espacio');
      return original.call(this, name, value);
    };
  }, DATABASE_KEY);
  await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar');
  expect(await data(page)).toEqual(before);
  await expect(page.getByLabel('Motivo de anulación')).toHaveValue('Registro incorrecto');
  await page.evaluate(() => {
    (window as unknown as { restoreWrite: () => void }).restoreWrite();
  });
  await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('en celular los filtros y los diálogos no desbordan y un motivo sin guardar queda protegido', async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/mantenimientos');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await row(page)
    .getByRole('button', { name: /Anular servicio/ })
    .click();
  await page.getByLabel('Motivo de anulación').fill('No descartar sin confirmar');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByLabel('Motivo de anulación')).toHaveValue('No descartar sin confirmar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-anular-mobile.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await data(page)).services[1].annulment).toBeUndefined();
});

test('resumen y CSV usan todos los resultados filtrados, incluyen centavos y separan anulados', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/mantenimientos');
  const summary = page.getByRole('region', { name: 'Resumen del historial' });
  await expect(
    summary.getByRole('article', { name: 'Servicios activos del resultado' }).locator('strong'),
  ).toHaveText('13');
  const before = await data(page);
  let pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  let downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe('taller-calamante-mantenimientos-2026-10-23.csv');
  let csv = await readFile((await downloaded.path())!, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(14); // Incluye las otras páginas.
  expect(await data(page)).toEqual(before);
  await page
    .getByRole('combobox', { name: 'Tipo de servicio', exact: true })
    .selectOption('frenos');
  await expect(
    summary.getByRole('article', { name: 'Servicios activos del resultado' }).locator('strong'),
  ).toHaveText('1');
  await row(page)
    .getByRole('link', { name: /Editar servicio/ })
    .click();
  await page.getByLabel('Importe total').fill('123.45');
  await page.getByLabel('Observaciones privadas', { exact: true }).fill('NOTA-PRIVADA-INFORME');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.goto('/mantenimientos?tipo=frenos');
  await expect(
    summary
      .getByRole('article', { name: 'Importe de servicios activos', exact: true })
      .locator('strong'),
  ).toHaveText('$\u00a0123,45');
  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  csv = await readFile((await (await pending).path())!, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(2);
  expect(csv).toContain('"123,45";"Activo"');
  expect(csv).not.toContain('NOTA-PRIVADA-INFORME');
  await annul(page);
  await expect(page.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeDisabled();
  await page.getByLabel('Estado del mantenimiento').selectOption('todos');
  await expect(
    summary.getByRole('article', { name: 'Servicios activos del resultado' }).locator('strong'),
  ).toHaveText('0');
  await expect(
    summary.getByRole('article', { name: 'Servicios anulados del resultado' }).locator('strong'),
  ).toHaveText('1');
  await expect(
    summary
      .getByRole('article', { name: 'Importe de servicios activos', exact: true })
      .locator('strong'),
  ).toHaveText('$\u00a00,00');
  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  csv = await readFile((await (await pending).path())!, 'utf8');
  expect(csv).toContain('"123,45";"Anulado"');
  expect(csv).not.toContain('Carga duplicada de prueba');
  await row(page)
    .getByRole('button', { name: /Recuperar servicio/ })
    .click();
  await page.getByLabel('Motivo de recuperación').fill('Importe verificado');
  await page.getByRole('button', { name: 'Confirmar recuperación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    summary
      .getByRole('article', { name: 'Importe de servicios activos', exact: true })
      .locator('strong'),
  ).toHaveText('$\u00a0123,45');
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-resumen-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await page.setViewportSize({ width: 320, height: 780 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('CSV de demostración identificado y exportación vacía deshabilitada', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  await page.goto('/mantenimientos');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toContain('-demo-');
  expect(await readFile((await downloaded.path())!, 'utf8')).toContain('"Demostración"');
  await page.getByLabel('Buscar mantenimientos').fill('Sin resultados 879642');
  await expect(page.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeDisabled();
  const summary = page.getByRole('region', { name: 'Resumen del historial' });
  await expect(
    summary.getByRole('article', { name: 'Servicios activos del resultado' }).locator('strong'),
  ).toHaveText('0');
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBeNull();
});
