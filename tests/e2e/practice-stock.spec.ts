import { showMoreOptions } from './helpers/options';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import fixture from '../../src/data/taller-calamante-practica-stock.json' with { type: 'json' };
import { emptyData, newDatabase, DATABASE_KEY, SAFETY_COPY_KEY } from '../../src/lib/localDatabase';
import { initialCustomers } from '../../src/lib/demo';
import { unzipSync, strFromU8 } from 'fflate';
test('ZIP de práctica se descarga sin modificar la base y la reemplaza únicamente al confirmar', async ({
  page,
}) => {
  const original = {
    ...emptyData(),
    customers: [{ ...initialCustomers[0], name: 'Cliente previo a la práctica' }],
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: DATABASE_KEY, value: JSON.stringify(newDatabase(original)) },
  );
  await page.goto('/backups');
  await showMoreOptions(page);
  const read = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
  const before = await read();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Descargar práctica con stock · ZIP', exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('taller-calamante-practica-stock.zip');
  const bytes = await readFile((await file.path())!);
  const data = JSON.parse(strFromU8(unzipSync(bytes)['backup.json'])).data;
  expect(data).toEqual(fixture.data);
  expect(await read()).toEqual(before);
  await page
    .getByLabel('Seleccionar respaldo JSON o ZIP')
    .setInputFiles({ name: file.suggestedFilename(), mimeType: 'application/zip', buffer: bytes });
  await expect(page.locator('.backup-candidate')).toContainText(
    '24 productos · 128 movimientos de stock',
  );
  await page.getByRole('button', { name: 'Revisar y restaurar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Se reemplazarán');
  await expect(dialog).toContainText('24 productos y 128 movimientos de stock');
  expect(await read()).toEqual(before);
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar y restaurar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await showMoreOptions(page);
  expect(await read()).toEqual(fixture.data);
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, SAFETY_COPY_KEY),
  ).toEqual(before);
  await page.goto('/productos');
  await showMoreOptions(page);
  await page.getByLabel('Buscar productos').fill('REP-099');
  await expect(
    page
      .locator('.product-card')
      .filter({
        has: page.getByRole('button', { name: 'Stock y movimientos REP-099', exact: true }),
      })
      .locator('.product-stock'),
  ).toContainText('0 Unidad');
  await page.getByLabel('Buscar productos').fill('HAB-001');
  await expect(
    page
      .locator('.product-card')
      .filter({
        has: page.getByRole('button', { name: 'Stock y movimientos HAB-001', exact: true }),
      })
      .locator('.product-stock'),
  ).toContainText('2 Unidad');
  await page.getByRole('button', { name: 'Stock y movimientos HAB-001', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Historial de movimientos');
});

test('agregar un artículo no quita el foco ni el importe si ya se comenzó a completar otro campo', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.evaluate(() => {
    const add = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Agregar artículo manual'),
    )!;
    add.click();
    const amount = document.querySelector<HTMLInputElement>('input[name="amount"]')!;
    amount.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      amount,
      '35000',
    );
    amount.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByLabel(/Importe total/)).toBeFocused();
  await expect(page.getByLabel(/Importe total/)).toHaveValue('35000');
});
