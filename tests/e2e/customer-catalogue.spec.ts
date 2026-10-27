import { showMoreOptions } from './helpers/options';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-26T15:00:00Z'));
  const customers = Array.from({ length: 32 }, (_, i) => ({
    ...initialCustomers[0],
    id: `c-${i}`,
    name: `Cliente ${String(i).padStart(2, '0')}`,
    document: `40.000.${String(i).padStart(3, '0')}`,
    phone: `11 4567-${String(i).padStart(4, '0')}`,
    email: `cliente${i}@ejemplo.com`,
    active: i !== 31,
    notes: 'Nota privada de prueba',
  }));
  customers[31].name = 'María Álvarez';
  const vehicles = [{ ...initialVehicles[0], customerId: 'c-31', plate: 'XY 123 ZZ' }];
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(newDatabase({ ...emptyData(), customers, vehicles })),
    },
  );
}
const read = (page: Page) => page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);

test('búsqueda normalizada, filtros combinados y cambios de cliente actualizan el listado', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/clientes');
  await showMoreOptions(page);
  const search = page.getByLabel('Buscar clientes', { exact: true });
  for (const term of ['maria alvarez', '40000031', '1145670031', 'XY-123-ZZ']) {
    await search.fill(term);
    await expect(page.locator('.customer-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.customer-table tbody')).toContainText('María Álvarez');
  }
  await page.getByLabel('Filtrar clientes por estado').selectOption('activos');
  await expect(page.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeDisabled();
  await page.getByLabel('Filtrar clientes por estado').selectOption('inactivos');
  await page.getByLabel('Filtrar clientes por vehículos').selectOption('con');
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar María Álvarez', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Nombre y apellido/).fill('María Álvarez corregida');
  await dialog.getByLabel('Cliente activo', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(0);
  await page.getByLabel('Filtrar clientes por estado').selectOption('activos');
  await expect(page.locator('.customer-table tbody')).toContainText('María Álvarez corregida');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  expect(await readFile((await (await pending).path())!, 'utf8')).toContain(
    'María Álvarez corregida',
  );
});

test('paginación acotada y filtros conservados al cerrar la ficha, recargar y volver del vehículo', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Página 2 de 4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Cliente 10 DNI/ }).click();
  await page.getByRole('button', { name: 'Cerrar ficha del cliente', exact: true }).click();
  await expect(page.getByText('Página 2 de 4', { exact: true })).toBeVisible();
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByText('Página 2 de 4', { exact: true })).toBeVisible();
  await page.getByLabel('Filtrar clientes por vehículos').selectOption('con');
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^María Álvarez DNI/ }).click();
  await page.locator('.customer-detail').getByRole('link').first().click();
  await expect(page).toHaveURL(/vehiculos\/v1$/);
  await page.goBack();
  await showMoreOptions(page);
  await expect(page.getByLabel('Filtrar clientes por vehículos')).toHaveValue('con');
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Ordenar clientes').selectOption('nombre-desc');
  await page.getByLabel('Clientes por página').selectOption('25');
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(25);
  await expect(page.getByLabel('Ordenar clientes')).toHaveValue('nombre-desc');
  await expect(page.getByLabel('Clientes por página')).toHaveValue('25');
  await page.goto('/clientes?pagina=NaN&cantidad=600&estado=error&vehiculos=error&orden=error');
  await showMoreOptions(page);
  await expect(page.getByText('Página 1 de 4', { exact: true })).toBeVisible();
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(10);
  await page.goto('/clientes?pagina=99999');
  await showMoreOptions(page);
  await expect(page.getByText('Página 4 de 4', { exact: true })).toBeVisible();
});

test('CSV de todas las páginas, sin notas privadas ni escrituras; descarga fallida permite reintentar', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/clientes');
  await showMoreOptions(page);
  const before = await read(page);
  await page.getByLabel('Ordenar clientes').selectOption('vehiculos');
  await expect(page.locator('.customer-table tbody tr').first()).toContainText('María Álvarez');
  let pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  let file = await pending;
  expect(file.suggestedFilename()).toBe('taller-calamante-clientes-2026-10-26.csv');
  const csv = await readFile((await file.path())!, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(33);
  expect(csv).toContain('"XY 123 ZZ"');
  expect(csv).not.toContain('Nota privada de prueba');
  expect(csv).not.toContain('40.000.031');
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = () => {
      URL.createObjectURL = original;
      throw new Error('Fallo simulado');
    };
  });
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  await expect(
    page.getByText('No se pudo descargar el CSV. Volvé a intentarlo.', { exact: true }),
  ).toBeVisible();
  pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  file = await pending;
  expect(await readFile((await file.path())!, 'utf8')).toBe(csv);
  expect(await read(page)).toBe(before);
});

test('celular sin desbordes y demo identificada en el archivo y las filas', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/clientes');
  await showMoreOptions(page);
  await expect(
    page.getByRole('button', { name: 'Cerrar ficha del cliente', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Buscar clientes', { exact: true }).fill('maria');
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toContain('-demo-');
  expect(await readFile((await file.path())!, 'utf8')).toContain('"Demostración"');
  await page.screenshot({ path: '/tmp/calamante-clientes-mobile.png', fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await read(page)).toBeNull();
});
