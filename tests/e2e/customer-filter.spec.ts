import { showMoreOptions } from './helpers/options';
import { expect, test, type Page } from '@playwright/test';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
const LONG_NAME =
  'María González con un nombre extenso para verificar la lectura completa del cliente en el celular';
async function seed(page: Page, many = false) {
  const customers = structuredClone(initialCustomers);
  if (many) customers[1].name = LONG_NAME;
  if (many)
    for (let i = 0; i < 500; i++)
      customers.push({
        ...initialCustomers[0],
        id: `extra-${i}`,
        name: `Cliente ${String(i).padStart(3, '0')}`,
        document: `90.${String(i).padStart(6, '0')}`,
        phone: `11 9999-${String(i).padStart(4, '0')}`,
      });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(newDatabase({ ...emptyData(), customers, vehicles: initialVehicles })),
    },
  );
}
for (const [route, label] of [
  ['/vehiculos', 'Cliente de vehículos'],
  ['/mantenimientos', 'Cliente del vehículo'],
  ['/proximos-servicios', 'Cliente de próximos servicios'],
]) {
  test(`buscar y seleccionar cliente sin alterar datos: ${route}`, async ({ page }) => {
    await seed(page);
    await page.goto(route);
    await showMoreOptions(page);
    const before = await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);
    const trigger = page.getByRole('button', { name: label, exact: true });
    await trigger.click();
    const search = page.getByRole('combobox', { name: 'Buscar cliente', exact: true });
    await expect(search).toBeFocused();
    await search.fill('maria gonzalez');
    await expect(page.getByRole('option', { name: 'María González', exact: true })).toBeVisible();
    expect(page.url()).not.toContain('cliente=');
    await search.press('Enter');
    await expect(trigger).toContainText('María González');
    await expect(page).toHaveURL(/cliente=c2/);
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.reload();
    await showMoreOptions(page);
    await expect(trigger).toContainText('María González');
    await trigger.click();
    await page.getByRole('option', { name: 'Todos los clientes', exact: true }).click();
    await expect(trigger).toContainText('Todos los clientes');
    expect(page.url()).not.toContain('cliente=');
    expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBe(before);
  });
}

test('DNI y teléfono sin separadores, sin resultados, Escape, Tab y clic afuera', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/vehiculos');
  await showMoreOptions(page);
  const trigger = page.getByRole('button', { name: 'Cliente de vehículos', exact: true });
  await trigger.focus();
  await trigger.press('ArrowDown');
  const search = page.getByRole('combobox', { name: 'Buscar cliente', exact: true });
  await search.fill('28334112');
  await expect(page.getByRole('option', { name: 'María González', exact: true })).toBeVisible();
  await search.fill('1198765432');
  await expect(page.getByRole('option', { name: 'María González', exact: true })).toBeVisible();
  await search.fill('no existe 783645');
  await expect(page.locator('.customer-filter-popup').getByRole('status')).toContainText(
    'No encontramos',
  );
  await search.press('Enter');
  expect(page.url()).not.toContain('cliente=');
  await search.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await trigger.click();
  await search.fill('gonzalez');
  await search.press('ArrowUp');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(trigger).toContainText('María González');
  await trigger.click();
  await search.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByLabel('Marca del vehículo')).toBeFocused();
  await trigger.click();
  await page.getByRole('heading', { name: 'Vehículos', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).toContainText('María González');
});

test('muchos clientes: lista limitada, búsqueda por DNI y selección visible al volver a abrir', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/vehiculos');
  await showMoreOptions(page);
  const trigger = page.getByRole('button', { name: 'Cliente de vehículos', exact: true });
  await trigger.click();
  await expect(
    page.getByRole('listbox', { name: 'Clientes disponibles' }).getByRole('option'),
  ).toHaveCount(81);
  await expect(page.locator('.customer-filter-popup').getByRole('status')).toContainText(
    'Mostrando 80',
  );
  await page.getByRole('combobox', { name: 'Buscar cliente', exact: true }).fill('90000499');
  await page.getByRole('option', { name: 'Cliente 499', exact: true }).click();
  await expect(trigger).toContainText('Cliente 499');
  await trigger.click();
  await expect(page.getByRole('option', { name: 'Cliente 499', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('en celular se mantiene dentro de la pantalla y funciona con nombres largos y modo oscuro', async ({
  page,
}) => {
  await seed(page, true);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/proximos-servicios');
  await showMoreOptions(page);
  const trigger = page.getByRole('button', { name: 'Cliente de próximos servicios', exact: true });
  await trigger.click();
  await page.getByRole('combobox', { name: 'Buscar cliente', exact: true }).fill('gonzalez');
  await expect(page.getByRole('option', { name: LONG_NAME, exact: true })).toBeVisible();
  const box = await page.locator('.customer-filter-popup').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-buscador-clientes-mobile.png', fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await expect(page.getByRole('option', { name: LONG_NAME, exact: true })).toBeVisible();
});
