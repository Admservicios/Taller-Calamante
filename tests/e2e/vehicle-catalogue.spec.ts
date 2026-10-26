import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialVehicles, type Vehicle } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
const today = '2026-10-26';
const base = initialVehicles[1];
async function seed(page: Page, many = false) {
  await page.clock.setFixedTime(new Date(`${today}T15:00:00Z`));
  const vehicles: Vehicle[] = [
    {
      ...base,
      id: 'urgent',
      plate: 'AB 123 CD',
      km: 20000,
      manualKm: 20000,
      maintenancePlans: [
        {
          category: 'aceite-filtros',
          label: 'Service de aceite y filtros',
          recommendation: 'Cambio de aceite y filtros',
          nextDate: '2026-10-01',
          nextKm: 25000,
        },
        {
          category: 'frenos',
          label: 'Frenos',
          recommendation: 'Revisar frenos',
          nextDate: '2027-05-01',
          nextKm: 50000,
        },
      ],
    },
    {
      ...base,
      id: 'soon',
      plate: 'AA 111 ZZ',
      km: 8000,
      manualKm: 8000,
      maintenancePlans: [
        {
          category: 'otro-filtro-de-habitaculo',
          label: 'Filtro de habitáculo',
          recommendation: 'Cambio de filtro',
          nextDate: '2026-11-01',
          nextKm: 20000,
        },
      ],
    },
    {
      ...base,
      id: 'none',
      customerId: initialCustomers[0].id,
      plate: 'CC 111 XX',
      brand: 'Ford',
      km: 90000,
      manualKm: 90000,
      maintenancePlans: [],
    },
  ];
  if (many)
    for (let i = 1; i <= 24; i++)
      vehicles.push({
        ...vehicles[2],
        id: `extra-${i}`,
        plate: `XX ${String(i).padStart(3, '0')} ZZ`,
        brand: 'Chevrolet',
        km: 100 + i,
        manualKm: 100 + i,
      });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(newDatabase({ ...emptyData(), customers: initialCustomers, vehicles })),
    },
  );
}
const read = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);

test('tarjetas y tabla comparten filtros, orden y paginación; volver de la ficha conserva la vista', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/vehiculos');
  await expect(page.locator('.vehicle-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('.vehicle-card')).toHaveCount(12);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByLabel('Cliente de vehículos').selectOption(base.customerId);
  await expect(page.locator('.vehicle-card')).toHaveCount(2);
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible();
  await page.getByLabel('Marca del vehículo').selectOption('toyota');
  await page.getByLabel('Estado de mantenimiento').selectOption('Próximo');
  await expect(page.locator('.vehicle-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tabla', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('AA 111 ZZ');
  await page.getByRole('link', { name: 'Ver ficha', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/soon$/);
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Tabla', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Estado de mantenimiento')).toHaveValue('Próximo');
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Tabla', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Vehículos por página').selectOption('48');
  await expect(page.locator('tbody tr')).toHaveCount(27);
  await page.getByLabel('Buscar vehículos').fill('AB-123-CD');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('AB 123 CD');
});

test('prioridad correcta, CSV completo de todas las páginas y registro desde la tabla', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/vehiculos');
  await page.getByLabel('Ordenar vehículos').selectOption('urgencia');
  await expect(page.locator('.vehicle-card').first()).toHaveAttribute('data-vehicle-id', 'urgent');
  await page.getByLabel('Ordenar vehículos').selectOption('kilometraje');
  await expect(page.locator('.vehicle-card').first()).toHaveAttribute('data-vehicle-id', 'none');
  const before = await read(page);
  let pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  let file = await pending;
  expect(file.suggestedFilename()).toBe('taller-calamante-vehiculos-2026-10-26.csv');
  let csv = await readFile((await file.path())!, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(28);
  expect(csv).toContain('2026-10-01 | 25000 km | Vencido');
  expect(csv).toContain('2027-05-01 | 50000 km | Al día');
  expect(await read(page)).toEqual(before);
  await page.getByLabel('Estado de mantenimiento').selectOption('Sin datos');
  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  csv = await readFile((await (await pending).path())!, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(26);
  expect(csv).not.toContain('AB 123 CD');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page.getByLabel('Buscar vehículos').fill('AB123CD');
  await page.getByRole('button', { name: 'Tabla', exact: true }).click();
  await page.getByRole('link', { name: 'Registrar', exact: true }).click();
  await expect(page.getByLabel(/Tipo de servicio/)).toHaveValue('Service general');
  await expect(page.getByLabel('Vehículo', { exact: true })).toHaveValue('urgent');
});

test('vistas en celular no desbordan y la edición mantiene actualizados cliente, filtros y CSV', async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/vehiculos');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Tabla', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Buscar vehículos').fill('AB123CD');
  await page
    .locator('tr[data-vehicle-id="urgent"]')
    .getByRole('link', { name: 'Ver ficha', exact: true })
    .click();
  await page.getByRole('button', { name: 'Editar vehículo', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Patente').fill('COR 456');
  await dialog.getByLabel('Cliente propietario').selectOption(initialCustomers[0].id);
  await dialog.getByRole('button', { name: 'Guardar vehículo', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/vehiculos?vista=tabla&buscar=COR456');
  await expect(page.locator('tbody')).toContainText('Juan Pérez');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const csv = await readFile((await (await pending).path())!, 'utf8');
  expect(csv).toContain('"COR 456"');
  expect(csv).toContain('"Juan Pérez"');
  await page.screenshot({ path: '/tmp/calamante-vehiculos-tabla-mobile.png', fullPage: true });
});

test('demo identificada y descarga deshabilitada sin coincidencias', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  await page.goto('/vehiculos');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toContain('-demo-');
  expect(await readFile((await file.path())!, 'utf8')).toContain('"Demostración"');
  await page.getByLabel('Buscar vehículos').fill('Sin resultados 8644971');
  await expect(page.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeDisabled();
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBeNull();
});
