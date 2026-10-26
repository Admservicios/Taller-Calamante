import { expect, test, type Page } from '@playwright/test';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, localToday, newDatabase } from '../../src/lib/localDatabase';

async function demo(page: Page) {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
}
async function answer(page: Page, accept: boolean, action: () => Promise<unknown>) {
  const pending = page.waitForEvent('dialog');
  const acted = action();
  const dialog = await pending;
  expect(dialog.message()).toContain('cambios sin guardar');
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await acted;
}

test('mantenimiento: conservar al cancelar navegación y salir al confirmar; guardar no pregunta', async ({
  page,
}) => {
  await demo(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel(/Detalle del Servicio/).fill('Trabajo que todavía no guardé');
  const clientes = page
    .getByRole('navigation')
    .getByRole('link', { name: 'Clientes', exact: true });
  await answer(page, false, () => clientes.click());
  await expect(page).toHaveURL(/mantenimientos\/nuevo/);
  await expect(page.getByLabel(/Detalle del Servicio/)).toHaveValue(
    'Trabajo que todavía no guardé',
  );
  await answer(page, false, () =>
    page.getByRole('button', { name: 'Cancelar', exact: true }).click(),
  );
  await expect(page.getByLabel(/Detalle del Servicio/)).toHaveValue(
    'Trabajo que todavía no guardé',
  );
  await answer(page, true, () => clientes.click());
  await expect(page).toHaveURL(/clientes$/);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel(/Detalle del Servicio/).fill('Trabajo confirmado');
  await page.getByLabel(/Importe total/).fill('1000');
  const unexpected: string[] = [];
  page.on('dialog', async (d) => {
    unexpected.push(d.message());
    await d.dismiss();
  });
  await page.getByRole('button', { name: 'Guardar en demo', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  expect(unexpected).toEqual([]);
});

test('Atrás del navegador conserva el formulario si se rechaza salir', async ({ page }) => {
  await demo(page);
  await page.goto('/mantenimientos');
  await page.getByRole('link', { name: 'Registrar mantenimiento', exact: true }).click();
  await page.getByLabel(/Detalle del Servicio/).fill('No perder al volver atrás');
  await answer(page, false, () => page.goBack());
  await expect(page).toHaveURL(/mantenimientos\/nuevo/);
  await expect(page.getByLabel(/Detalle del Servicio/)).toHaveValue('No perder al volver atrás');
  await answer(page, true, () => page.goBack());
  await expect(page).toHaveURL(/mantenimientos$/);
});

test('cliente: Escape y Cancelar conservan lo escrito hasta confirmar el descarte', async ({
  page,
}) => {
  await demo(page);
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await form.getByLabel('Nombre y apellido').fill('Cliente todavía sin guardar');
  await answer(page, false, () => page.keyboard.press('Escape'));
  await expect(form.getByLabel('Nombre y apellido')).toHaveValue('Cliente todavía sin guardar');
  await answer(page, false, () => form.getByRole('button', { name: 'Cancelar' }).click());
  await expect(form).toBeVisible();
  await answer(page, true, () => form.getByRole('button', { name: 'Cerrar diálogo' }).click());
  await expect(form).toHaveCount(0);
});

test('ajustes: proteger cambios al cambiar pestaña y liberar la navegación después de guardar', async ({
  page,
}) => {
  await demo(page);
  await page.goto('/ajustes');
  const name = page.locator('input[name="workshop"]');
  await name.fill('Taller corregido');
  // Pulsar la pestaña activa conserva tanto los campos como su protección.
  await page.getByRole('button', { name: 'Taller', exact: true }).click();
  await answer(page, false, () =>
    page.getByRole('button', { name: 'Aplicación', exact: true }).click(),
  );
  await expect(name).toHaveValue('Taller corregido');
  await page.getByRole('button', { name: 'Guardar taller' }).click();
  await expect(page.getByText('Guardado en demo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Aplicación', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Aplicación y uso sin conexión/ })).toBeVisible();
});

test('Dashboard: contar varios servicios de un vehículo sin mezclarlos con vehículos', async ({
  page,
}) => {
  const v = initialVehicles[0];
  const today = localToday();
  const future = new Date(`${today}T12:00:00Z`);
  future.setUTCDate(future.getUTCDate() + 90);
  const data = {
    ...emptyData(),
    customers: initialCustomers.filter((c) => c.id === v.customerId),
    vehicles: [
      {
        ...v,
        maintenancePlans: [
          {
            category: 'oil',
            label: 'Aceite de prueba',
            recommendation: 'Aceite',
            nextDate: today,
            nextKm: v.km + 10000,
          },
          {
            category: 'brakes',
            label: 'Frenos de prueba',
            recommendation: 'Frenos',
            nextDate: future.toISOString().slice(0, 10),
            nextKm: v.km + 500,
          },
        ],
      },
    ],
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: DATABASE_KEY,
    value: JSON.stringify(newDatabase(data)),
  });
  await page.goto('/');
  const card = page.locator('.stat-card').filter({ hasText: 'Servicios por atender' });
  await expect(card.locator('strong')).toHaveText('2');
  await expect(card.locator('small')).toHaveText('1 vencido · 1 próximo');
  await expect(page.locator('.donut strong')).toHaveText('1');
});

test('Dashboard: ancho móvil contenido y tabla accesible con desplazamiento propio', async ({
  page,
}) => {
  await demo(page);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `ancho ${width}`,
    ).toBe(true);
    const table = page.locator('.dashboard-main .table-scroll');
    await table.evaluate((e) => {
      e.scrollLeft = e.scrollWidth;
    });
    if (width <= 390) expect(await table.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  }
});
