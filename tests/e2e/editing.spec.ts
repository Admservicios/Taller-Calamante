import { showMoreOptions } from './helpers/options';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  initialCustomers,
  initialVehicles,
  initialServices,
  type Service,
} from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
import { servicePlan } from '../../src/lib/maintenancePlans';

const oil: Service = {
  ...initialServices[0],
  id: 'edit-oil',
  type: 'Cambio de aceite',
  vehicleId: 'v2',
  date: '2026-01-10',
  km: 10000,
  public: true,
};
oil.maintenance = servicePlan(oil, {
  date: '2026-07-10',
  km: 20000,
  recommendation: 'Cambio de aceite y filtros',
});
const brakes: Service = {
  ...oil,
  id: 'edit-brakes',
  type: 'Frenos',
  date: '2026-02-10',
  km: 13000,
  public: false,
};
brakes.maintenance = servicePlan(brakes, {
  date: '2027-02-10',
  km: 43000,
  recommendation: 'Revisión de frenos',
});
async function seed(page: Page, legacy = false) {
  await page.clock.setFixedTime(new Date('2026-10-23T15:00:00Z'));
  const data: LocalData = {
    ...emptyData(),
    customers: initialCustomers,
    vehicles: [
      {
        ...initialVehicles[1],
        manualKm: 0,
        km: 13000,
        maintenancePlans: [oil.maintenance!, brakes.maintenance!],
      },
      { ...initialVehicles[0], manualKm: 0, km: 0, maintenancePlans: [] },
    ],
    services: [oil, brakes],
  };
  if (legacy) {
    data.services = data.services.map(({ maintenance: _plan, ...service }) => service);
    delete data.vehicles[0].maintenancePlans;
  }
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: DATABASE_KEY, value: JSON.stringify(newDatabase(data)) },
  );
}
async function data(page: Page): Promise<LocalData> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
async function edit(page: Page, id = 'edit-brakes') {
  await page.goto(`/mantenimientos/${id}/editar`);
  await showMoreOptions(page);
  await expect(
    page.getByRole('heading', { name: 'Editar mantenimiento', exact: true }),
  ).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
}

test('editar desde el historial conserva el ID, corrige kilómetros y datos, y genera el PDF actualizado', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await page.getByRole('link', { name: 'Editar servicio de AF 456 EF del 2026-02-10' }).click();
  await page.getByLabel('Kilometraje actual').fill('12000');
  await expect(page.getByLabel('Kilometraje objetivo')).toHaveValue('42000');
  await page.getByLabel('Fecha del servicio').fill('2026-02-11');
  await expect(page.getByLabel('Fecha recomendada')).toHaveValue('2027-02-11');
  await page.getByLabel('Detalle del Servicio').fill('Pastillas delanteras y traseras corregidas');
  await page.getByLabel('Detalle anterior de insumos').fill('Pastillas Bosch corregidas');
  await page
    .getByLabel('Observaciones privadas', { exact: true })
    .fill('Importe corregido por error de carga');
  await page.getByLabel('Importe total').fill('76000');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar y generar PDF' }).click();
  expect((await readFile((await (await pending).path())!)).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  await showMoreOptions(page);
  const result = await data(page);
  expect(result.services).toHaveLength(2);
  expect(result.services.find((s) => s.id === brakes.id)).toMatchObject({
    km: 12000,
    amount: 76000,
    supplies: 'Pastillas Bosch corregidas',
    notes: 'Importe corregido por error de carga',
    maintenance: { lastKm: 12000, nextKm: 42000, nextDate: '2027-02-11' },
  });
  expect(result.vehicles[0].km).toBe(12000);
  expect(result.vehicles[0].maintenancePlans?.[0]).toEqual(oil.maintenance);
  await expect(page.locator('tbody')).toContainText('Pastillas delanteras y traseras corregidas');
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(2);
  await edit(page, oil.id);
  await page.getByLabel('Importe total').fill('50000');
  await save(page);
  expect((await data(page)).services.find((s) => s.id === oil.id)?.public).toBe(true);
});

test('rechaza una corrección incoherente; permite cambiar tipo y vehículo y actualiza ambas fichas', async ({
  page,
}) => {
  await seed(page);
  await edit(page);
  const before = await data(page);
  await page.getByLabel('Kilometraje actual').fill('9000');
  await save(page);
  await expect(page.getByRole('alert')).toContainText('contradice');
  expect(await data(page)).toEqual(before);
  await page.getByLabel('Kilometraje actual').fill('12000');
  await page.getByLabel('Tipo de servicio').selectOption('Filtro de habitáculo');
  await page.getByLabel('Cliente', { exact: true }).selectOption(initialVehicles[0].customerId);
  await page.getByLabel('Vehículo', { exact: true }).selectOption('v1');
  await save(page);
  await expect(page).toHaveURL(/vehiculos\/v1$/);
  const result = await data(page);
  expect(result.services).toHaveLength(2);
  expect(result.vehicles[0]).toMatchObject({ km: 10000, maintenancePlans: [oil.maintenance] });
  expect(result.vehicles[1]).toMatchObject({
    km: 12000,
    maintenancePlans: [{ category: 'otro-filtro-de-habitaculo', lastKm: 12000 }],
  });
  await page.goto('/clientes');
  await showMoreOptions(page);
  await page
    .getByLabel('Buscar clientes')
    .fill(initialCustomers.find((c) => c.id === initialVehicles[0].customerId)!.name);
  await expect(page.locator('tbody')).toContainText(
    initialCustomers.find((c) => c.id === initialVehicles[0].customerId)!.name,
  );
});

test('las visitas antiguas sin vencimiento se pueden corregir sin inventar intervalos', async ({
  page,
}) => {
  await seed(page, true);
  await edit(page, oil.id);
  await expect(page.getByLabel('Este registro tiene un vencimiento propio')).not.toBeChecked();
  await page.getByLabel('Importe total').fill('36000');
  await save(page);
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  const result = await data(page);
  expect(result.services.find((s) => s.id === oil.id)?.maintenance).toBeUndefined();
  expect(result.vehicles[0].maintenancePlans?.[0]).toMatchObject({
    legacy: true,
    nextKm: initialVehicles[1].nextKm,
  });
});

test('conserva fotos al editar y mover un servicio; permite quitar y agregar fotos sin perder los archivos originales', async ({
  page,
}) => {
  await seed(page);
  await edit(page);
  await page.getByLabel('Seleccionar fotos').setInputFiles({
    name: 'motor.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../fixtures/foto-prueba.jpg', import.meta.url)),
  });
  await expect(page.getByRole('button', { name: 'Quitar motor.jpg', exact: true })).toBeVisible();
  await save(page);
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  const photo = (await data(page)).photos![0];
  await edit(page);
  await expect(page.getByLabel('Conservar motor.jpg')).toBeChecked();
  await page.getByLabel('Cliente', { exact: true }).selectOption(initialVehicles[0].customerId);
  await page.getByLabel('Vehículo', { exact: true }).selectOption('v1');
  await save(page);
  await expect(page).toHaveURL(/vehiculos\/v1$/);
  await page.getByRole('tab', { name: 'Fotos', exact: true }).click();
  await expect(page.locator('.maintenance-photo-card img')).toBeVisible();
  expect((await data(page)).photos![0]).toEqual(photo);
  await edit(page);
  await page.getByLabel('Conservar motor.jpg').uncheck();
  await page.getByLabel('Seleccionar fotos').setInputFiles({
    name: 'nuevo.jpg',
    mimeType: 'image/jpeg',
    buffer: await readFile(new URL('../fixtures/foto-prueba.jpg', import.meta.url)),
  });
  const before = await data(page);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Object.assign(window, {
      restoreWrite: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('fallo de prueba');
      return original.call(this, name, value);
    };
  }, DATABASE_KEY);
  await save(page);
  await expect(page.locator('.toast[role="status"]')).toContainText('No se pudo guardar');
  expect(await data(page)).toEqual(before);
  await page.evaluate(() => {
    (window as unknown as { restoreWrite: () => void }).restoreWrite();
  });
  await save(page);
  await expect(page).toHaveURL(/vehiculos\/v1$/);
  expect((await data(page)).photos).toHaveLength(1);
  expect((await data(page)).photos![0].name).toBe('nuevo.jpg');
});

test('corrige nombre, categoría y vehículo de un documento conservando exactamente el PDF', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/vehiculos/v2');
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
  const bytes = await readFile(new URL('../fixtures/documento-prueba.pdf', import.meta.url));
  await page
    .getByLabel('Archivo PDF o imagen', { exact: true })
    .setInputFiles({ name: 'mal.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await page.getByRole('button', { name: 'Editar documento mal.pdf' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del archivo').fill('seguro-corregido.pdf');
  await dialog.getByLabel('Tipo de documento').selectOption('Seguro');
  await dialog.getByLabel('Vehículo asociado').selectOption('v1');
  await dialog.getByRole('button', { name: 'Guardar cambios del documento' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.goto('/vehiculos/v1');
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
  await expect(page.getByRole('article', { name: 'seguro-corregido.pdf' })).toContainText('Seguro');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar documento seguro-corregido.pdf' }).click();
  expect(await readFile((await (await pending).path())!)).toEqual(bytes);
  await page.goto('/backups');
  await showMoreOptions(page);
  const zip = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  expect((await readFile((await (await zip).path())!)).subarray(0, 2).toString()).toBe('PK');
});

test('un formulario abierto no sobrescribe un mantenimiento corregido en otra pestaña', async ({
  page,
}) => {
  await seed(page);
  await edit(page);
  await page.getByLabel('Importe total').fill('45000');
  await page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key)!);
    value.data.services.find((s: { id: string }) => s.id === 'edit-brakes').amount = 999;
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, DATABASE_KEY);
  await save(page);
  await expect(page.getByRole('alert')).toContainText('otra pestaña');
  expect((await data(page)).services.find((s) => s.id === brakes.id)?.amount).toBe(999);
});

test('editar cliente, vehículo y categoría de recordatorio propaga sus datos y evita lecturas imposibles', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/clientes');
  await showMoreOptions(page);
  const customer = initialCustomers.find((c) => c.id === initialVehicles[1].customerId)!;
  await page.getByRole('button', { name: `Editar ${customer.name}`, exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre y apellido').fill('Cliente corregido Calamante');
  await dialog.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await expect(page.locator('tbody')).toContainText('Cliente corregido Calamante');
  await page.goto('/vehiculos/v2');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Editar vehículo', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Kilometraje registrado').fill('5000');
  await dialog.getByRole('button', { name: 'Guardar vehículo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Corregí primero');
  await dialog.getByLabel('Kilometraje registrado').fill('14000');
  await dialog.getByLabel('Patente').fill('COR 123');
  await dialog.getByLabel('Color', { exact: true }).fill('Azul');
  await dialog.getByLabel('Cliente propietario').selectOption(initialVehicles[0].customerId);
  await dialog.getByRole('button', { name: 'Guardar vehículo', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByRole('heading', { name: 'Toyota Hilux SRX', exact: true })).toBeVisible();
  expect((await data(page)).vehicles[0]).toMatchObject({
    plate: 'COR 123',
    color: 'Azul',
    km: 14000,
    manualKm: 14000,
    customerId: initialVehicles[0].customerId,
  });
  await page.getByRole('tab', { name: 'Recordatorios', exact: true }).click();
  await page.getByRole('button', { name: 'Editar vencimiento de Frenos', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Tipo de servicio').selectOption('Filtro de habitáculo');
  await dialog.getByRole('button', { name: 'Guardar vencimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await data(page)).vehicles[0].maintenancePlans?.map((p) => p.category)).toEqual([
    'aceite-filtros',
    'otro-filtro-de-habitaculo',
  ]);
  await page.goto('/mantenimientos');
  await showMoreOptions(page);
  await expect(page.locator('tbody')).toContainText('COR 123');
  await expect(page.locator('tbody')).not.toContainText('Cliente corregido Calamante');
  await page.screenshot({ path: '/tmp/calamante-editar-historial.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await edit(page);
  await page.screenshot({ path: '/tmp/calamante-editar-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
