import { showMoreOptions } from './helpers/options';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';

async function seed(page: Page) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: DATABASE_KEY,
    value: JSON.stringify(
      newDatabase({
        ...emptyData(),
        customers: initialCustomers,
        vehicles: initialVehicles,
        services: initialServices,
      }),
    ),
  });
}
for (const width of [320, 1440]) {
  test(`guardar desde la barra visible al final del formulario, con PDF y un único registro · ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.goto('/mantenimientos/nuevo?vehiculo=v2');
    await showMoreOptions(page);
    await page
      .getByLabel(/Detalle del Servicio/)
      .fill('Servicio guardado desde la barra persistente.');
    await page.getByLabel(/Importe total/).fill('12345.50');
    await page
      .locator('textarea[name="notes"]')
      .fill('Nota privada que se conserva al desplazarse.');
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    const save = page.getByRole('button', { name: 'Guardar y generar PDF', exact: true });
    await expect(save).toBeInViewport();
    const box = await save.boundingBox();
    const header = await page.locator('.topbar').boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const pending = page.waitForEvent('download');
    await save.click();
    await expect(page).toHaveURL(/vehiculos\/v2$/);
    expect((await readFile((await (await pending).path())!)).toString('latin1')).toMatch(/^%PDF-/);
    const data = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).data,
      DATABASE_KEY,
    );
    expect(data.services).toHaveLength(initialServices.length + 1);
    expect(
      data.services.find(
        (service: { work: string }) =>
          service.work === 'Servicio guardado desde la barra persistente.',
      ),
    ).toMatchObject({
      amount: 12345.5,
      notes: 'Nota privada que se conserva al desplazarse.',
    });
  });
}

test('celular: seleccionar cliente abre su ficha con foco y cerrar devuelve al listado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.goto('/clientes');
  await showMoreOptions(page);
  const row = page.getByRole('button', { name: /^María González/ });
  await row.click();
  const profile = page.getByRole('complementary', { name: 'Ficha de María González' });
  await expect(profile).toBeFocused();
  await expect(
    profile.getByRole('heading', { name: 'María González', exact: true }),
  ).toBeInViewport();
  await profile.getByRole('button', { name: 'Cerrar ficha del cliente' }).click();
  await expect(profile).toHaveCount(0);
  await expect(row).toBeFocused();
  await expect(row).toBeInViewport();
});

test('celular: los campos inválidos reciben foco sin quedar debajo de Guardar; claro y oscuro legibles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  const work = page.getByLabel(/Detalle del Servicio/);
  await expect(work).toBeFocused();
  await expect(work).toBeInViewport();
  const fieldBox = await work.boundingBox();
  const actionsBox = await page
    .getByRole('region', { name: 'Guardar mantenimiento' })
    .boundingBox();
  expect(fieldBox!.y).toBeGreaterThanOrEqual(actionsBox!.y + actionsBox!.height);
  expect(
    await work.evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await expect(
    page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).data.services.length,
      DATABASE_KEY,
    ),
  ).toBe(initialServices.length);
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }),
  ).toBeVisible();
});
