import { showMoreOptions } from './helpers/options';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { demoProducts } from '../../src/lib/products';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
async function seed(page: Page, many = false) {
  await page.clock.setFixedTime(new Date('2026-10-26T15:00:00Z'));
  const products = [...demoProducts];
  if (many)
    for (let i = 0; i < 52; i++)
      products.push({
        ...demoProducts[0],
        id: `extra-${i}`,
        code: `X-${i}`,
        description: `Repuesto ${i}`,
      });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(
        newDatabase({
          ...emptyData(),
          products,
          stockMovements: products.map((product) => ({
            id: `opening-${product.id}`,
            productId: product.id,
            unit: product.unit,
            kind: 'opening',
            at: '2026-10-26T12:00:00Z',
            deltaMilli: 100000,
            reason: 'Stock ficticio para las pruebas',
          })),
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

test('crear, buscar, corregir, desactivar y reactivar productos con validación de código único', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/productos');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Código').fill('ACE-001');
  await dialog.getByLabel('Descripción').fill('Otro aceite');
  await dialog.getByLabel('Precio sugerido').fill('15000');
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('código');
  await dialog.getByLabel('Código').fill('REP-001');
  await dialog.getByLabel('Marca').fill('Prueba');
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Buscar productos').fill('rep001');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar producto REP-001', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Producto activo').uncheck();
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.getByLabel('Estado de los productos').selectOption('inactivos');
  await page.reload();
  await showMoreOptions(page);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar producto REP-001', exact: true }).click();
  await dialog.getByLabel('Producto activo').check();
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  expect((await read(page)).products!.find((p) => p.code === 'REP-001')!.active).toBe(true);
});

test('agregar desde catálogo conserva la referencia y el precio propio aunque cambie el producto; ZIP incluye catálogo', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByLabel(/Detalle del Servicio/).fill('Servicio con producto de catálogo');
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  await page.getByLabel('Buscar producto', { exact: true }).fill('ace001');
  await page.getByRole('button', { name: 'Agregar ACE-001', exact: true }).click();
  await expect(page.getByLabel('Descripción artículo 1', { exact: true })).toHaveValue(
    'Helix HX8 5W-30 · Shell',
  );
  await expect(page.getByLabel('Descripción artículo 1', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  );
  await page.getByLabel('Cantidad artículo 1', { exact: true }).fill('4.5');
  await page.getByLabel('Precio unitario artículo 1', { exact: true }).fill('9500');
  await page.getByLabel('Importe total').fill('60000');
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  const service = (await read(page)).services.find(
    (s) => s.work === 'Servicio con producto de catálogo',
  )!;
  await page.goto('/productos');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Editar producto ACE-001', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Precio sugerido').fill('16000');
  await dialog.getByLabel('Producto activo').uncheck();
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/mantenimientos/${service.id}/editar`);
  await showMoreOptions(page);
  await expect(page.getByLabel('Precio unitario artículo 1', { exact: true })).toHaveValue('9500');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  expect((await read(page)).products).toHaveLength(3);
  expect(
    (await read(page)).services.find((s) => s.id === service.id)!.supplyItems![0],
  ).toMatchObject({ productId: 'demo-oil', unitPrice: 9500 });
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  await page.getByLabel('Buscar producto', { exact: true }).fill('ace001');
  await expect(page.getByRole('button', { name: 'Agregar ACE-001', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar catálogo', exact: true }).click();
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo', exact: true }).click();
  const entries = unzipSync(await readFile((await (await pending).path())!));
  const backup = JSON.parse(new TextDecoder().decode(entries['backup.json']));
  expect(backup.data.products).toHaveLength(3);
  expect(
    backup.data.services.find((s: { id: string }) => s.id === service.id).supplyItems[0].productId,
  ).toBe('demo-oil');
});

test('paginación y celular, buscador acotado, desvincular permite edición manual y protege cambios', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/productos');
  await showMoreOptions(page);
  await expect(page.locator('.product-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.reload();
  await showMoreOptions(page);
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Agregar / })).toHaveCount(50);
  await page.getByLabel('Buscar producto', { exact: true }).fill('shell');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-productos-selector-mobile.png', fullPage: true });
  await page.getByLabel('Buscar producto', { exact: true }).fill('ACE-001');
  await page.getByRole('button', { name: 'Agregar ACE-001', exact: true }).click();
  await page.getByRole('button', { name: 'Desvincular artículo 1', exact: true }).click();
  await page.getByLabel('Descripción artículo 1', { exact: true }).fill('Repuesto manual');
  await expect(page.getByLabel('Unidad artículo 1', { exact: true })).toBeEnabled();
  const pending = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name: 'Volver', exact: true }).click();
  const warning = await pending;
  expect(warning.message()).toContain('sin guardar');
  await warning.dismiss();
  await click;
  await expect(page.getByLabel('Descripción artículo 1', { exact: true })).toHaveValue(
    'Repuesto manual',
  );
});

test('demo tiene catálogo separado y un editor obsoleto no sobrescribe correcciones de otra pestaña', async ({
  page,
  context,
}) => {
  await seed(page);
  await page.goto('/productos');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Editar producto ACE-001', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Precio sugerido').fill('19000');
  const second = await context.newPage();
  await second.goto('/productos');
  await showMoreOptions(second);
  await second.getByRole('button', { name: 'Editar producto ACE-001', exact: true }).click();
  await second.getByRole('dialog').getByLabel('Precio sugerido').fill('17000');
  await second.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(second.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('cambió');
  expect((await read(page)).products![0].unitPrice).toBe(17000);
  await second.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await second.goto('/productos');
  await showMoreOptions(second);
  await expect(second.locator('.product-card')).toHaveCount(3);
  expect((await read(second)).products![0].unitPrice).toBe(17000);
});

test('buscar y cerrar el catálogo no guarda ni marca cambios pendientes; Enter conserva el foco', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  const before = await read(page);
  await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
  const search = page.getByLabel('Buscar producto', { exact: true });
  await search.fill('shell');
  await search.press('Enter');
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/mantenimientos\/nuevo/);
  await page.getByRole('button', { name: 'Cerrar catálogo', exact: true }).click();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page).toHaveURL(/mantenimientos$/);
  expect(await read(page)).toEqual(before);
});

test('lista y tarjetas conservan productos, filtros y página sin modificar la base', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/productos');
  const views = page.getByRole('group', { name: 'Vista de productos' });
  await expect(views.getByRole('button', { name: 'Tarjetas', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  const codes = await page.locator('.product-card .product-code').allTextContents();
  const before = await read(page);
  await views.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Lista de productos' })).toBeVisible();
  await expect(page.locator('.product-list tbody tr')).toHaveCount(20);
  expect(await page.locator('.product-list .product-code').allTextContents()).toEqual(codes);
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  await page.reload();
  await expect(views.getByRole('button', { name: 'Lista', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Página 2 de 3', { exact: true })).toBeVisible();
  await page.getByLabel('Buscar productos').fill('ace001');
  await expect(page.locator('.product-list tbody tr')).toHaveCount(1);
  await views.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('ACE-001');
  await expect(page.getByLabel('Buscar productos')).toHaveValue('ace001');
  await views.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(views.getByRole('button', { name: 'Lista', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.product-list tbody tr')).toHaveCount(20);
  await page.getByLabel('Buscar productos').fill('Producto inexistente 987654');
  await expect(page.getByText('No encontramos productos', { exact: true })).toBeVisible();
  expect(await read(page)).toEqual(before);
});

test('lista de productos: editar y consultar stock desde celular, sin desbordamiento', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/productos?vista=lista&buscar=ace001');
  const row = page.locator('.product-list tbody tr');
  await expect(row).toHaveCount(1);
  const before = await read(page);
  await page.getByRole('button', { name: 'Editar producto ACE-001', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Precio sugerido').fill('12345.67');
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toContainText('12.345,67');
  expect((await read(page)).stockMovements).toEqual(before.stockMovements);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page
      .locator('.product-list .table-scroll')
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await expect(
    row.getByRole('button', { name: 'Editar producto ACE-001', exact: true }),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Stock y movimientos ACE-001', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.stock-balance')).toContainText('100');
  await page.getByRole('button', { name: 'Cerrar diálogo', exact: true }).click();
  await page.screenshot({ path: '/tmp/calamante-productos-lista-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Activar modo oscuro', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-productos-lista-desktop.png', fullPage: true });
});
