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

test('alta con tareas frecuentes y campos de insumos: reabrir, corregir y emitir PDF sin duplicar la visita', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByRole('button', { name: '+ Cambio de aceite de motor', exact: true }).click();
  await page.getByRole('button', { name: '+ Cambio de filtro de aceite', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '+ Cambio de aceite de motor', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel(/Trabajos realizados/)).toHaveValue(
    'Cambio de aceite de motor\nCambio de filtro de aceite',
  );
  await page.getByLabel('Aceite de motor', { exact: true }).fill('Shell Helix HX8');
  await page.getByLabel('Viscosidad', { exact: true }).fill('5W-30');
  await page.getByLabel('Filtro de aceite', { exact: true }).fill('MANN W712/95');
  await page.getByLabel('Filtro de habitáculo', { exact: true }).fill('CUK 2939');
  await page
    .getByRole('textbox', { name: 'Otros repuestos y detalles', exact: true })
    .fill('Arandela de tapón');
  await page.getByLabel('Importe total').fill('95000');
  await save(page);
  let data = await read(page);
  const created = data.services.find((s) => !initialServices.some((old) => old.id === s.id))!;
  await page.goto(`/mantenimientos/${created.id}/editar`);
  await expect(page.getByLabel('Aceite de motor', { exact: true })).toHaveValue('Shell Helix HX8');
  await expect(page.getByLabel('Viscosidad', { exact: true })).toHaveValue('5W-30');
  await expect(page.getByLabel('Filtro de habitáculo', { exact: true })).toHaveValue('CUK 2939');
  await page.getByLabel('Aceite de motor', { exact: true }).fill('Motul 8100');
  await page.getByLabel('Filtro de aceite', { exact: true }).fill('MANN W75');
  await page
    .getByRole('combobox', { name: 'Trabajo recomendado', exact: true })
    .selectOption('__custom__');
  await page
    .getByLabel('Trabajo recomendado personalizado', { exact: true })
    .fill('Revisar aceite y filtros en próxima visita');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
  const pdf = (await readFile((await (await pending).path())!)).toString('latin1');
  expect(pdf).toContain('Motul 8100');
  expect(pdf).not.toContain('Shell Helix HX8');
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  data = await read(page);
  expect(data.services).toHaveLength(initialServices.length + 1);
  expect(data.services.find((s) => s.id === created.id)).toMatchObject({
    suppliesDetail: {
      oil: 'Motul 8100',
      viscosity: '5W-30',
      oilFilter: 'MANN W75',
      cabinFilter: 'CUK 2939',
      other: 'Arandela de tapón',
    },
  });
  await page.goto(`/mantenimientos/${created.id}/editar`);
  await expect(page.getByLabel('Trabajo recomendado personalizado', { exact: true })).toHaveValue(
    'Revisar aceite y filtros en próxima visita',
  );
});

test('alineación y balanceo se editan con los mismos selectores sin duplicar el detalle', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel('Tipo de servicio').selectOption('Alineación y balanceo');
  await expect(page.getByLabel('Aceite de motor', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '+ Corrección de deriva', exact: true }).click();
  await page.getByLabel('Alineación realizada').selectOption('Ejes delantero y trasero');
  await page.getByLabel('Ruedas balanceadas').selectOption('2 ruedas delanteras');
  await page.getByLabel('Importe total').fill('40000');
  await save(page);
  const created = (await read(page)).services.find((s) => s.type === 'Alineación y balanceo')!;
  await page.goto(`/mantenimientos/${created.id}/editar`);
  await expect(page.getByLabel('Alineación realizada')).toHaveValue('Ejes delantero y trasero');
  await expect(page.getByLabel('Ruedas balanceadas')).toHaveValue('2 ruedas delanteras');
  await expect(page.getByLabel(/Trabajos realizados/)).toHaveValue('Corrección de deriva');
  await page.getByLabel('Tipo de servicio').selectOption('Frenos');
  await expect(page.getByLabel(/Trabajos realizados/)).toContainText(
    'Alineación: Ejes delantero y trasero.',
  );
  await page.getByLabel('Tipo de servicio').selectOption('Alineación y balanceo');
  await page.getByLabel('Ruedas balanceadas').selectOption('Las 4 ruedas');
  await save(page, true);
  const edited = (await read(page)).services.find((s) => s.id === created.id)!;
  expect(edited.work).toBe(
    'Alineación: Ejes delantero y trasero. Balanceo: Las 4 ruedas. Corrección de deriva',
  );
  expect(edited.work.match(/Alineación:/g)).toHaveLength(1);
});

test('registros antiguos conservan el texto; una corrección puede distribuir los insumos', async ({
  page,
}) => {
  await seed(page);
  const service = initialServices.find((s) => s.vehicleId === 'v2')!;
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await expect(
    page.getByRole('textbox', { name: 'Insumos y repuestos registrados', exact: true }),
  ).toHaveValue(service.supplies);
  await expect(page.getByLabel('Aceite de motor', { exact: true })).toHaveValue('');
  await page.getByLabel('Importe total').fill('60000');
  await save(page, true);
  let edited = (await read(page)).services.find((s) => s.id === service.id)!;
  expect(edited.supplies).toBe(service.supplies);
  expect(edited.suppliesDetail).toBeUndefined();
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await page.getByLabel('Aceite de motor', { exact: true }).fill('Shell Helix HX8');
  await page.getByLabel('Viscosidad', { exact: true }).fill('5W-30');
  await page
    .getByRole('textbox', { name: 'Insumos y repuestos registrados', exact: true })
    .fill('MANN W712/95');
  await save(page, true);
  edited = (await read(page)).services.find((s) => s.id === service.id)!;
  expect(edited.suppliesDetail).toMatchObject({
    oil: 'Shell Helix HX8',
    viscosity: '5W-30',
    other: 'MANN W712/95',
  });
  expect(edited.changes!.at(-1)!.changes.map((c) => c.field)).toContain('Campos de insumos');
});

test('celular: insumos opcionales, cambios de tipo y tareas conservan datos y protección al salir', async ({
  page,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel('Aceite de motor', { exact: true }).fill('Aceite cargado antes de cambiar');
  await page.getByLabel('Tipo de servicio').selectOption('Frenos');
  await expect(page.getByLabel('Aceite de motor', { exact: true })).toHaveValue(
    'Aceite cargado antes de cambiar',
  );
  await expect(page.getByLabel('Filtro de aire', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Mostrar todos los campos de insumos', exact: true })
    .click();
  await page.getByLabel('Filtro de aire', { exact: true }).fill('Filtro cargado');
  await page.getByRole('button', { name: 'Mostrar insumos del servicio', exact: true }).click();
  await expect(page.getByLabel('Filtro de aire', { exact: true })).toHaveValue('Filtro cargado');
  await page.getByRole('button', { name: '+ Revisión de discos', exact: true }).click();
  await expect(page.getByLabel(/Trabajos realizados/)).toHaveValue('Revisión de discos');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel(/Trabajos realizados/).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/calamante-mantenimiento-carga-mobile.png', fullPage: true });
  const pending = page.waitForEvent('dialog');
  const action = page.getByRole('button', { name: 'Volver', exact: true }).click();
  const dialog = await pending;
  expect(dialog.message()).toContain('sin guardar');
  await dialog.dismiss();
  await action;
  await expect(page.getByLabel('Aceite de motor', { exact: true })).toHaveValue(
    'Aceite cargado antes de cambiar',
  );
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
