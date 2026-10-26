import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-26T15:00:00Z'));
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
          services: initialServices,
        }),
      ),
    },
  );
}
const read = (page: Page): Promise<LocalData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
async function save(page: Page, editing = false) {
  await page
    .getByRole('button', {
      name: editing ? 'Guardar cambios' : 'Guardar mantenimiento',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
}

async function addItem(
  page: Page,
  index: number,
  description: string,
  quantity: string,
  price: string,
  unit = 'Unidad',
) {
  await page.getByRole('button', { name: 'Agregar artículo manual', exact: true }).click();
  await page.getByLabel(`Descripción artículo ${index}`, { exact: true }).fill(description);
  await page.getByLabel(`Cantidad artículo ${index}`, { exact: true }).fill(quantity);
  await page.getByLabel(`Unidad artículo ${index}`, { exact: true }).selectOption(unit);
  await page.getByLabel(`Precio unitario artículo ${index}`, { exact: true }).fill(price);
}

test('artículos con cantidades fraccionadas: total, corrección, persistencia y PDF sin modificar el importe manual', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await expect(page.getByRole('group', { name: 'Tareas frecuentes' })).toHaveCount(0);
  await page.getByLabel(/Detalle del Servicio/).fill('Cambio de aceite y filtros.');
  await addItem(page, 1, 'Shell Helix HX8 5W-30', '4.5', '10000', 'Litro');
  await page.getByLabel('Código artículo 1', { exact: true }).fill('ACE-001');
  await addItem(page, 2, 'Filtro MANN W712/95', '1', '12000');
  await expect(page.getByLabel('Subtotal artículo 1', { exact: true })).toHaveText(/45\.000,00/);
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(
    /57\.000,00/,
  );
  await page
    .locator('.supply-items-editor')
    .screenshot({ path: '/tmp/calamante-articulos-desktop.png' });
  await page.getByLabel('Importe total').fill('95000');
  await save(page);
  let data = await read(page);
  const created = data.services.find((s) => !initialServices.some((old) => old.id === s.id))!;
  await page.goto(`/mantenimientos/${created.id}/editar`);
  await expect(page.getByLabel('Cantidad artículo 1', { exact: true })).toHaveValue('4.5');
  await expect(page.getByLabel('Precio unitario artículo 1', { exact: true })).toHaveValue('10000');
  await page.getByLabel('Precio unitario artículo 2', { exact: true }).fill('13000.50');
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(
    /58\.000,50/,
  );
  await expect(page.getByLabel('Importe total')).toHaveValue('95000');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
  const pdf = (await readFile((await (await pending).path())!)).toString('latin1');
  expect(pdf).toContain('58.000,50');
  expect(pdf).toContain('95.000,00');
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  data = await read(page);
  expect(data.services).toHaveLength(initialServices.length + 1);
  expect(data.services.find((s) => s.id === created.id)).toMatchObject({
    amount: 95000,
    supplyItems: [{ quantity: 4.5, unit: 'Litro', unitPrice: 10000 }, { unitPrice: 13000.5 }],
  });
});

test('editar y quitar renglones recalcula; un artículo incompleto no se guarda ni se presenta como total cero', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel(/Detalle del Servicio/).fill('Detalle del trabajo con artículos.');
  await page.getByLabel('Importe total').fill('0');
  const before = await read(page);
  await page.getByRole('button', { name: 'Agregar artículo manual', exact: true }).click();
  await expect(page.getByLabel('Descripción artículo 1', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(
    'Por completar',
  );
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  expect(await read(page)).toEqual(before);
  await page.getByLabel('Descripción artículo 1', { exact: true }).fill('Artículo de cortesía');
  await page.getByLabel('Precio unitario artículo 1', { exact: true }).fill('0');
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(/0,00/);
  await addItem(page, 2, 'Arandela', '2', '100.25');
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(
    /200,50/,
  );
  await page.getByRole('button', { name: 'Quitar artículo 1', exact: true }).click();
  await expect(page.getByLabel('Descripción artículo 1', { exact: true })).toHaveValue('Arandela');
  await page.getByRole('button', { name: 'Quitar artículo 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Agregar artículo manual', exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(/0,00/);
  await save(page);
});

test('detalle antiguo se conserva sin valorizar y se puede complementar sin alterar los vencimientos', async ({
  page,
}) => {
  await seed(page);
  const service = initialServices.find((s) => s.vehicleId === 'v2')!;
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await expect(page.getByLabel('Detalle anterior de insumos')).toHaveValue(service.supplies);
  await expect(page.getByLabel('Total de insumos y repuestos', { exact: true })).toHaveText(/0,00/);
  await page.getByLabel('Importe total').fill('60000');
  await save(page, true);
  let edited = (await read(page)).services.find((s) => s.id === service.id)!;
  expect(edited.supplies).toBe(service.supplies);
  expect(edited.supplyItems).toBeUndefined();
  const vehiclesBeforeItems = (await read(page)).vehicles;
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await addItem(page, 1, 'Filtro de habitáculo', '1', '12000');
  await save(page, true);
  const data = await read(page);
  edited = data.services.find((s) => s.id === service.id)!;
  expect(edited.suppliesLegacy).toBe(service.supplies);
  expect(edited.supplyItems).toHaveLength(1);
  expect(edited.changes!.at(-1)!.changes.map((c) => c.field)).toContain('Artículos utilizados');
  expect(data.vehicles).toEqual(vehiclesBeforeItems);
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await page.getByLabel('Detalle anterior de insumos').fill('');
  await expect(page.getByLabel('Detalle anterior de insumos')).toBeVisible();
});

test('celular: tarjetas legibles, cambios de tipo conservan artículos y salir protege las modificaciones', async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await addItem(page, 1, 'Aceite Shell Helix HX8 5W-30', '4.5', '10000', 'Litro');
  await page.getByLabel('Tipo de servicio').selectOption('Frenos');
  await expect(page.getByLabel('Descripción artículo 1', { exact: true })).toHaveValue(
    'Aceite Shell Helix HX8 5W-30',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Descripción artículo 1', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/calamante-articulos-mobile.png', fullPage: true });
  const pending = page.waitForEvent('dialog');
  const action = page.getByRole('button', { name: 'Volver', exact: true }).click();
  const dialog = await pending;
  expect(dialog.message()).toContain('sin guardar');
  await dialog.dismiss();
  await action;
  await expect(page.getByLabel('Precio unitario artículo 1', { exact: true })).toHaveValue('10000');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('alineación y balanceo sigue editable y los artículos se conservan al cambiar de categoría', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel('Tipo de servicio').selectOption('Alineación y balanceo');
  await page.getByLabel(/Detalle del Servicio/).fill('Corrección de deriva');
  await page.getByLabel('Alineación realizada').selectOption('Ejes delantero y trasero');
  await page.getByLabel('Ruedas balanceadas').selectOption('2 ruedas delanteras');
  await addItem(page, 1, 'Contrapesos', '4', '500');
  await page.getByLabel('Importe total').fill('40000');
  await save(page);
  const created = (await read(page)).services.find((s) => s.type === 'Alineación y balanceo')!;
  await page.goto(`/mantenimientos/${created.id}/editar`);
  await expect(page.getByLabel('Alineación realizada')).toHaveValue('Ejes delantero y trasero');
  await page.getByLabel('Ruedas balanceadas').selectOption('Las 4 ruedas');
  await save(page, true);
  const edited = (await read(page)).services.find((s) => s.id === created.id)!;
  expect(edited.work).toBe(
    'Alineación: Ejes delantero y trasero. Balanceo: Las 4 ruedas. Corrección de deriva',
  );
  expect(edited.supplyItems![0].description).toBe('Contrapesos');
});
