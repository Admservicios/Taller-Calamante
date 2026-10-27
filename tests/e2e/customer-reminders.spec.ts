import { showMoreOptions } from './helpers/options';
import { expect, test, type Page } from '@playwright/test';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase, type LocalData } from '../../src/lib/localDatabase';
import type { MaintenancePlan } from '../../src/lib/maintenancePlans';
const today = '2026-10-26';
const oil: MaintenancePlan = {
  category: 'aceite-filtros',
  label: 'Service de aceite y filtros',
  recommendation: 'Cambio de aceite y filtros',
  nextDate: '2026-10-25',
  nextKm: 20000,
  lastDate: '2026-04-25',
  lastKm: 10000,
};
const brakes: MaintenancePlan = {
  category: 'frenos',
  label: 'Frenos',
  recommendation: 'Revisar pastillas',
  nextDate: '2027-02-01',
  nextKm: 40000,
  lastDate: '2026-02-01',
  lastKm: 10000,
};
async function seed(page: Page, many = false, noPhone = false) {
  await page.clock.setFixedTime(new Date(`${today}T15:00:00Z`));
  const data: LocalData = {
    ...emptyData(),
    customers: initialCustomers.map((c) => (noPhone ? { ...c, phone: '' } : c)),
    vehicles: [
      { ...initialVehicles[1], km: 15000, manualKm: 15000, maintenancePlans: [oil, brakes] },
      {
        ...initialVehicles[0],
        km: 5000,
        manualKm: 5000,
        maintenancePlans: [{ ...brakes, nextDate: '2026-11-01', nextKm: 6000, lastKm: 4000 }],
      },
    ],
    services: [],
  };
  if (many)
    for (let i = 1; i <= 23; i++)
      data.vehicles.push({
        ...initialVehicles[0],
        id: `extra-${i}`,
        plate: `XX ${String(i).padStart(3, '0')} ZZ`,
        maintenancePlans: [{ ...brakes, nextDate: '2026-12-30', nextKm: 80000 }],
      });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: DATABASE_KEY, value: JSON.stringify(newDatabase(data)) },
  );
}
async function read(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
const oilRow = (page: Page) =>
  page.locator('tr[data-vehicle-id="v2"][data-plan-category="aceite-filtros"]');

test('agenda filtra, cuenta servicios por estado, pagina y conserva filtros al registrar', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/proximos-servicios');
  await showMoreOptions(page);
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Cliente de próximos servicios', exact: true }).click();
  await page.getByRole('combobox', { name: 'Buscar cliente', exact: true }).fill('María González');
  await page.getByRole('option', { name: 'María González', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('Página 1 de 1', { exact: true })).toBeVisible();
  await page.getByLabel('Tipo de próximos servicios').selectOption('aceite-filtros');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(oilRow(page)).toContainText('Venció hace 1 día');
  await expect(oilRow(page)).toContainText('Faltan 5.000 km');
  await oilRow(page).getByRole('link', { name: 'Registrar', exact: true }).click();
  await expect(page.getByLabel(/Tipo de servicio/)).toHaveValue('Service general');
  await page.goBack();
  await showMoreOptions(page);
  await expect(page.getByLabel('Tipo de próximos servicios')).toHaveValue('aceite-filtros');
  await page.reload();
  await showMoreOptions(page);
  await expect(oilRow(page)).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page.getByLabel('Filtrar vencimientos').selectOption('Vencido');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Buscar próximos servicios').fill('hilux');
  await expect(oilRow(page)).toBeVisible();
});

test('prepara y copia varios vencimientos independientes sin modificar la base ni abrir sitios externos', async ({
  page,
  context,
}) => {
  await seed(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/proximos-servicios');
  await showMoreOptions(page);
  const before = await read(page);
  await oilRow(page)
    .getByRole('button', { name: /Preparar aviso/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Preparar aviso al cliente' });
  const text = dialog.getByLabel('Texto del aviso');
  await expect(text).toHaveValue(/20\.000 km/);
  await expect(text).not.toHaveValue(/40\.000 km/);
  await dialog.getByRole('button', { name: /^Frenos/ }).click();
  await expect(text).toHaveValue(/40\.000 km/);
  const expected = await text.inputValue();
  await dialog.getByRole('button', { name: 'Copiar aviso', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Aviso copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
  expect(context.pages()).toHaveLength(1);
  expect(await read(page)).toEqual(before);
  await dialog.getByRole('button', { name: /^Frenos/ }).click();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Service de aceite/ }).click();
  await expect(dialog.getByRole('button', { name: 'Copiar aviso', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await expect(dialog).toHaveCount(0);
});

test('sin portapapeles permite selección manual; sin teléfono permite abrir la ficha; funciona en celular', async ({
  page,
}) => {
  await seed(page, false, true);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/proximos-servicios');
  await showMoreOptions(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await oilRow(page)
    .getByRole('button', { name: /Preparar aviso/ })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Sin teléfono registrado');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = () => false;
  });
  await dialog.getByRole('button', { name: 'Copiar aviso', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('texto quedó seleccionado');
  const selected = await dialog.getByLabel('Texto del aviso').evaluate((e) => {
    const t = e as HTMLTextAreaElement;
    return t.selectionStart === 0 && t.selectionEnd === t.value.length;
  });
  expect(selected).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/calamante-aviso-mobile.png', fullPage: true });
  await dialog.getByRole('link', { name: 'Ver ficha del cliente' }).click();
  await expect(page).toHaveURL(/clientes\?cliente=c2$/);
});

test('aviso usa los datos actuales si otra pestaña modifica el cliente o un vencimiento', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/proximos-servicios');
  await showMoreOptions(page);
  await oilRow(page)
    .getByRole('button', { name: /Preparar aviso/ })
    .click();
  await page.evaluate((key) => {
    const current = JSON.parse(localStorage.getItem(key)!);
    current.data.customers.find((c: { id: string }) => c.id === 'c2').name = 'Cliente actualizado';
    current.data.vehicles.find((v: { id: string }) => v.id === 'v2').maintenancePlans[0].nextKm =
      23000;
    localStorage.setItem(key, JSON.stringify(current));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, DATABASE_KEY);
  await expect(page.getByLabel('Texto del aviso')).toHaveValue(/Hola Cliente actualizado/);
  await expect(page.getByLabel('Texto del aviso')).toHaveValue(/23\.000 km/);
});

test('demo identifica el texto y preparar avisos no crea una base local', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  await page.goto('/proximos-servicios');
  await showMoreOptions(page);
  await page
    .getByRole('button', { name: /Preparar aviso/ })
    .first()
    .click();
  await expect(page.getByLabel('Texto del aviso')).toHaveValue(
    /^\[DEMOSTRACIÓN · DATOS FICTICIOS\]/,
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBeNull();
});
