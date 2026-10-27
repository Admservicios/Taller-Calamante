import { test, expect, type Page } from '@playwright/test';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
import { demoProducts } from '../../src/lib/products';
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-27T15:00:00Z'));
  const base = initialServices[0];
  const services = [
    { ...base, id: 'oct-a', date: '2026-10-03', km: 100000, amount: 10.1 },
    { ...base, id: 'oct-b', date: '2026-10-15', km: 110000, amount: 20.2 },
    { ...base, id: 'january', date: '2026-01-01', km: 70000, amount: 100.05 },
    { ...base, id: 'previous-year', date: '2025-12-01', km: 60000, amount: 50.01 },
    {
      ...base,
      id: 'annulled',
      date: '2026-10-20',
      km: 111000,
      amount: 999,
      annulment: { at: '2026-10-25T15:00:00Z', reason: 'Anulado de prueba' },
    },
  ];
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(
        newDatabase({
          ...emptyData(),
          products: demoProducts,
          customers: initialCustomers,
          vehicles: initialVehicles,
          services,
        }),
      ),
    },
  );
}
const read = (page: Page) => page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);

test('Inicio concentra el resumen por período, excluye anulados y muestra cifras y gráficos solo al pedirlos', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Inicio', exact: true })).toBeVisible();
  const before = await read(page);
  const summary = page.getByRole('region', { name: 'Resumen de mantenimientos', exact: true });
  await expect(summary.locator('.home-amount > strong')).toHaveText('$\u00a030,30');
  await expect(summary).toContainText('2 servicios en el período elegido');
  await expect(summary.locator('.home-extra-figures')).toBeHidden();
  await expect(page.locator('.home-charts .chart-row')).toBeHidden();
  await expect(page.locator('.qr-promo')).toHaveCount(0);
  await summary.getByText('Ver más cifras', { exact: true }).click();
  await expect(summary.locator('.home-extra-figures')).toContainText('15,15');
  await expect(summary.locator('.home-extra-figures > div').last().locator('dd')).toHaveText('1');
  await page.getByLabel('Período del resumen').selectOption('anio');
  await expect(summary.locator('.home-amount > strong')).toHaveText('$\u00a0130,35');
  await page.getByLabel('Período del resumen').selectOption('todo');
  await expect(summary.locator('.home-amount > strong')).toHaveText('$\u00a0180,36');
  await page.reload();
  await expect(page.getByLabel('Período del resumen')).toHaveValue('todo');
  await expect(summary.locator('.home-amount > strong')).toHaveText('$\u00a0180,36');
  await page.getByText('Ver gráficos del taller', { exact: true }).click();
  await expect(page.locator('.home-charts .chart-row')).toBeVisible();
  expect(await read(page)).toBe(before);
});

for (const [route, search, advanced] of [
  ['/mantenimientos', 'Buscar mantenimientos', 'Cliente del vehículo'],
  ['/vehiculos', 'Buscar vehículos', 'Cliente de vehículos'],
  ['/clientes', 'Buscar clientes', 'Filtrar clientes por vehículos'],
  ['/proximos-servicios', 'Buscar próximos servicios', 'Cliente de próximos servicios'],
]) {
  test(`tarea principal visible y opciones adicionales plegadas: ${route}`, async ({ page }) => {
    await seed(page);
    await page.goto(route);
    await expect(page.getByLabel(search, { exact: true })).toBeVisible();
    const options = page.locator('.more-options');
    await expect(options).not.toHaveAttribute('open');
    await expect(page.getByLabel(advanced, { exact: true })).toBeHidden();
    if (route === '/mantenimientos')
      await expect(page.getByRole('region', { name: 'Resumen del historial' })).toBeHidden();
    if (route === '/clientes') {
      await expect(page.locator('.customer-stats')).toHaveCount(0);
      await expect(page.locator('.customer-detail')).toHaveCount(0);
    }
    await options.locator(':scope > summary').click();
    await expect(page.getByLabel(advanced, { exact: true })).toBeVisible();
    await options.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(options).not.toHaveAttribute('open');
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `/tmp/calamante-simple-${route.slice(1)}.png`, fullPage: true });
    await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('un filtro de un enlace se abre, se puede plegar sin perderlo y se conserva al volver de editar', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos?cliente=c2&desde=2026-10-01');
  const options = page.locator('.more-options');
  await expect(options).toHaveAttribute('open', '');
  await expect(options.locator(':scope > summary')).toContainText('2 opciones aplicadas');
  await options.locator(':scope > summary').click();
  await expect(options).not.toHaveAttribute('open');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page
    .locator('tbody tr')
    .first()
    .getByRole('link', { name: /Editar servicio/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Editar mantenimiento', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(options).toHaveAttribute('open', '');
  await expect(page.getByLabel('Desde', { exact: true })).toHaveValue('2026-10-01');
  const report = page.getByRole('region', { name: 'Resumen del historial' });
  await expect(report).toBeHidden();
  await page.getByText('Ver resumen de este listado', { exact: true }).click();
  await expect(
    report
      .getByRole('article', { name: 'Importe de servicios activos', exact: true })
      .locator('strong'),
  ).toHaveText('$\u00a030,30');
  await page.getByLabel('Estado del mantenimiento').selectOption('todos');
  await expect(
    report.getByRole('article', { name: 'Servicios anulados del resultado' }).locator('strong'),
  ).toHaveText('1');
  await expect(
    report
      .getByRole('article', { name: 'Importe de servicios activos', exact: true })
      .locator('strong'),
  ).toHaveText('$\u00a030,30');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
});

test('las ayudas del formulario y el historial de stock no estorban ni marcan cambios pendientes', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  const before = await read(page);
  await expect(
    page.getByText('Historial público pendiente de implementar', { exact: true }),
  ).toHaveCount(0);
  const info = page.getByText('Ver otros vencimientos y cómo se actualizan', { exact: true });
  await info.click();
  await info.click();
  await page.getByRole('button', { name: 'Volver', exact: true }).click();
  await expect(page).toHaveURL(/mantenimientos$/);
  expect(await read(page)).toBe(before);
  await page.goto('/productos');
  await page.getByRole('button', { name: 'Stock y movimientos ACE-001', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/Cantidad/)).toBeVisible();
  await expect(dialog.locator('.stock-history-details')).not.toHaveAttribute('open');
  await dialog.locator('.stock-history-details > summary').click();
  await expect(dialog.getByText('Todavía no hay movimientos.', { exact: true })).toBeVisible();
});
