import { test, expect, type Page } from '@playwright/test';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
import { demoProducts } from '../../src/lib/products';
const products = [
  { ...demoProducts[0], id: 'low', code: 'LOW', minimumStock: 5 },
  { ...demoProducts[1], id: 'empty', code: 'EMPTY', minimumStock: 0 },
  { ...demoProducts[2], id: 'ok', code: 'OK', minimumStock: 2 },
  { ...demoProducts[0], id: 'unknown', code: 'UNKNOWN' },
  { ...demoProducts[0], id: 'inactive', code: 'INACTIVE', minimumStock: 5, active: false },
];
async function seed(page: Page) {
  const data = {
    ...emptyData(),
    products,
    stockMovements: [
      {
        id: 'open-low',
        productId: 'low',
        unit: products[0].unit,
        kind: 'opening' as const,
        deltaMilli: 5000,
        at: '2026-10-27T12:00:00Z',
        reason: 'Saldo inicial',
      },
      {
        id: 'open-ok',
        productId: 'ok',
        unit: products[2].unit,
        kind: 'opening' as const,
        deltaMilli: 3000,
        at: '2026-10-27T12:00:00Z',
        reason: 'Saldo inicial',
      },
    ],
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: DATABASE_KEY, value: JSON.stringify(newDatabase(data)) },
  );
}
const read = (page: Page): Promise<LocalData> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
test('Inicio enlaza reposición; filtros, lista y tarjetas conservan el mismo resultado sin modificar datos', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/');
  const before = await read(page);
  const notice = page.getByRole('link', { name: /2 productos necesitan reposición/ });
  await expect(notice).toBeVisible();
  await notice.click();
  await expect(page.getByLabel('Filtrar productos por existencias')).toHaveValue('reponer');
  await expect(page.locator('.product-card')).toHaveCount(2);
  await expect(page.locator('.product-card').filter({ hasText: 'LOW' })).toContainText('Reponer');
  await expect(page.locator('.product-card').filter({ hasText: 'EMPTY' })).toContainText(
    'Sin existencias',
  );
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(page.locator('.product-list tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.product-list tbody tr')).toHaveCount(2);
  await page.getByLabel('Buscar productos').fill('LOW');
  await expect(page.locator('.product-list tbody tr')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-stock-minimo-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(page.locator('.product-list tbody tr')).toHaveCount(4);
  expect(await read(page)).toEqual(before);
});
test('un ingreso resuelve el aviso; editar y vaciar el mínimo no cambia existencias', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/productos?stock=reponer');
  await page.getByRole('button', { name: 'Stock y movimientos LOW', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Mínimo: 5');
  await dialog.getByLabel('Tipo de movimiento').selectOption('receipt');
  await dialog.getByLabel(/Cantidad/).fill('1');
  await dialog.getByLabel(/Motivo/).fill('Ingreso de reposición de prueba');
  await dialog.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  const before = await read(page);
  await page.getByRole('button', { name: 'Editar producto LOW', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Stock mínimo (opcional)').fill('6.001');
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.product-card').filter({ hasText: 'LOW' })).toContainText('Reponer');
  expect((await read(page)).stockMovements).toEqual(before.stockMovements);
  await page.getByRole('button', { name: 'Editar producto LOW', exact: true }).click();
  await dialog.getByLabel('Stock mínimo (opcional)').fill('');
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await read(page)).products!.find((p) => p.id === 'low')).not.toHaveProperty(
    'minimumStock',
  );
  expect((await read(page)).stockMovements).toEqual(before.stockMovements);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /1 producto necesita reposición/ })).toBeVisible();
});
