import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  initialCustomers,
  initialServices,
  initialVehicles,
  type Vehicle,
} from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';

async function seed(page: Page, vehicle: Vehicle = initialVehicles[1]) {
  await page.clock.setFixedTime(new Date('2026-10-22T15:00:00Z'));
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
          vehicles: [vehicle],
          services: initialServices.filter((s) => s.vehicleId === vehicle.id),
        }),
      ),
    },
  );
}
async function data(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
async function register(page: Page, type: string, km: number, nextKm: number, work: string) {
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel(/Tipo de servicio/).selectOption(type);
  await page.getByLabel(/Kilometraje actual/).fill(String(km));
  await page.getByLabel(/Kilometraje objetivo/).fill(String(nextKm));
  await page.getByLabel(/Detalle del Servicio/).fill(work);
  await page.getByLabel(/Importe total/).fill('45000');
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
}
async function reminders(page: Page) {
  await page.goto('/vehiculos/v2');
  await page.getByRole('tab', { name: 'Recordatorios', exact: true }).click();
}

test('frenos no reinicia aceite; renovar aceite conserva frenos, el PDF y los respaldos', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await seed(page);
  await register(page, 'Frenos', 123000, 153000, 'Pastillas de freno con vencimiento propio.');
  await page.reload();
  let vehicle = (await data(page)).vehicles[0];
  const oil = vehicle.maintenancePlans.find(
    (p: { category: string }) => p.category === 'aceite-filtros',
  );
  expect(oil).toMatchObject({
    nextDate: '2026-11-05',
    nextKm: 122300,
    lastDate: '2026-10-05',
    lastKm: 112300,
  });
  const brakes = vehicle.maintenancePlans.find(
    (p: { category: string }) => p.category === 'frenos',
  );
  expect(brakes).toMatchObject({ lastKm: 123000, nextKm: 153000 });
  await reminders(page);
  const oilCard = page.getByRole('article', { name: 'Service de aceite y filtros', exact: true });
  await expect(oilCard).toContainText('Vencido');
  await expect(oilCard).toContainText('Recorridos desde este servicio: 10.700 km.');
  await expect(page.getByRole('article', { name: 'Frenos', exact: true })).toContainText('Al día');
  await page.goto('/proximos-servicios');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Filtrar vencimientos').selectOption('Vencido');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Service de aceite y filtros');
  await page.getByLabel('Filtrar vencimientos').selectOption('Al día');
  await page.getByRole('link', { name: 'Registrar', exact: true }).click();
  await expect(page.getByLabel(/Tipo de servicio/)).toHaveValue('Frenos');
  await register(
    page,
    'Cambio de aceite',
    123500,
    133500,
    'Nuevo cambio de aceite sin modificar frenos.',
  );
  vehicle = (await data(page)).vehicles[0];
  expect(
    vehicle.maintenancePlans.find((p: { category: string }) => p.category === 'frenos'),
  ).toEqual(brakes);
  expect(
    vehicle.maintenancePlans.find((p: { category: string }) => p.category === 'aceite-filtros'),
  ).toMatchObject({ lastKm: 123500, nextKm: 133500 });
  const pdfDownload = page.waitForEvent('download');
  await page
    .getByRole('row')
    .filter({ hasText: 'Pastillas de freno con vencimiento propio.' })
    .getByRole('button', { name: /^Descargar PDF/ })
    .click();
  const pdf = (await readFile((await (await pdfDownload).path())!)).toString('latin1');
  expect(pdf).toContain('153.000 km');
  expect(pdf).not.toContain('133.500 km');
  await page.goto('/backups');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).first().click();
  const backup = await readFile((await (await pending).path())!);
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const second = await other.newPage();
    await second.clock.setFixedTime(new Date('2026-10-22T15:00:00Z'));
    await second.goto('/backups');
    await second
      .getByLabel('Seleccionar respaldo JSON o ZIP')
      .setInputFiles({ name: 'vencimientos.json', mimeType: 'application/json', buffer: backup });
    await second.getByRole('button', { name: 'Revisar y restaurar' }).click();
    await second.getByRole('dialog').getByRole('checkbox').check();
    await second.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
    await expect(second.getByRole('dialog')).toHaveCount(0);
    await second.reload();
    expect((await data(second)).vehicles[0].maintenancePlans).toEqual(vehicle.maintenancePlans);
  } finally {
    await other.close();
  }
});

test('corregir un vencimiento anterior y agregar otro no altera el historial; editar km conserva ambos', async ({
  page,
}) => {
  await seed(page, { ...initialVehicles[1], km: 123000, nextKm: 133000, nextDate: '2027-04-22' });
  await reminders(page);
  const before = await data(page);
  await page
    .getByRole('button', { name: 'Editar vencimiento de Service de aceite y filtros' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Editar vencimiento' });
  await expect(dialog.getByLabel('Kilometraje del último servicio')).toHaveValue('112300');
  await dialog.getByLabel('Fecha de vencimiento').fill('2026-11-05');
  await dialog.getByLabel('Kilometraje de vencimiento').fill('110000');
  await dialog.getByRole('button', { name: 'Guardar vencimiento' }).click();
  await expect(dialog.getByRole('alert')).toContainText('posterior al último servicio');
  expect((await data(page)).vehicles).toEqual(before.vehicles);
  await dialog.getByLabel('Kilometraje de vencimiento').fill('122300');
  await dialog.getByRole('button', { name: 'Guardar vencimiento' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('article', { name: 'Service de aceite y filtros', exact: true }),
  ).toContainText('Vencido');
  await page.getByRole('button', { name: 'Agregar vencimiento', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Agregar vencimiento' });
  await add.getByLabel('Tipo de servicio').selectOption('Frenos');
  await add.getByLabel('Fecha de vencimiento').fill('2027-10-22');
  await add.getByLabel('Kilometraje de vencimiento').fill('153000');
  await add.getByRole('button', { name: 'Guardar vencimiento' }).click();
  await expect(add).toHaveCount(0);
  const plans = (await data(page)).vehicles[0].maintenancePlans;
  expect(plans).toHaveLength(2);
  expect((await data(page)).services).toEqual(before.services);
  await page.getByRole('button', { name: 'Editar vehículo', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Kilometraje registrado').fill('124000');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar vehículo', exact: true })
    .click();
  await page.reload();
  expect((await data(page)).vehicles[0].maintenancePlans).toEqual(plans);
  expect((await data(page)).services).toEqual(before.services);
});

test('dos servicios con nombre propio conservan vencimientos separados y se ven en celular', async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, km, nextKm] of [
    ['Correa de distribución', 113000, 173000],
    ['Refrigerante', 114000, 154000],
  ] as const) {
    await page.goto('/mantenimientos/nuevo?vehiculo=v2');
    await page.getByLabel(/Tipo de servicio/).selectOption('Otro mantenimiento');
    await page.getByLabel(/Nombre del servicio/).fill(name);
    await page.getByLabel(/Detalle del Servicio/).fill(`Trabajo completo de ${name}.`);
    await page.getByLabel(/Importe total/).fill('45000');
    await page.getByLabel(/Kilometraje actual/).fill(String(km));
    await page.getByLabel(/Kilometraje objetivo/).fill(String(nextKm));
    await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
    await expect(page).toHaveURL(/vehiculos\/v2$/);
  }
  await reminders(page);
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(
    page.getByRole('article', { name: 'Correa de distribución', exact: true }),
  ).toContainText('173.000 km');
  await expect(page.getByRole('article', { name: 'Refrigerante', exact: true })).toContainText(
    '154.000 km',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
