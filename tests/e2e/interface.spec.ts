import { showMoreOptions } from './helpers/options';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors, 'errores de JavaScript en el navegador').toEqual([]));

test('navegación de escritorio, búsqueda global y temas', async ({ page }) => {
  await page.goto('/');
  await showMoreOptions(page);
  await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
  await expect(
    page.getByText('Datos ficticios. Los cambios duran hasta recargar la página.'),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Búsqueda global' }).fill('Hilux');
  await page
    .locator('.search-results')
    .getByRole('link', { name: /Toyota Hilux/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Toyota Hilux SRX', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await showMoreOptions(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const [route, title] of [
    ['/clientes', 'Clientes'],
    ['/vehiculos', 'Vehículos'],
    ['/mantenimientos', 'Mantenimientos'],
    ['/proximos-servicios', 'Próximos servicios'],
    ['/backups', 'Backups y recuperación'],
    ['/ajustes', 'Ajustes'],
  ]) {
    await page.goto(route);
    await showMoreOptions(page);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
});

test('clientes: filtrar, crear y descartar datos al recargar', async ({ page }) => {
  await page.goto('/clientes');
  await showMoreOptions(page);
  await page.getByRole('textbox', { name: 'Buscar clientes', exact: true }).fill('Lucía');
  await expect(page.locator('.customer-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /^Lucía Torres/ }).click();
  await expect(page.locator('.customer-profile')).toContainText('Lucía Torres');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo cliente' });
  await dialog.getByLabel(/Nombre y apellido/).fill('Marina Soto');
  await dialog.getByLabel('Correo electrónico').fill('marina@example.com');
  await dialog.getByRole('button', { name: 'Guardar en demo' }).click();
  await page.getByRole('textbox', { name: 'Buscar clientes', exact: true }).fill('Marina');
  await expect(page.getByRole('button', { name: /^Marina Soto/ })).toBeVisible();
  await page.reload();
  await showMoreOptions(page);
  await page.getByRole('textbox', { name: 'Buscar clientes', exact: true }).fill('Marina');
  await expect(page.getByText('No encontramos clientes')).toBeVisible();
});

test('mantenimiento: validar, guardar en memoria y actualizar historial', async ({ page }) => {
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await expect(page.getByRole('combobox', { name: 'Vehículo', exact: true })).toHaveValue('v2');
  await page.getByLabel(/Detalle del Servicio/).fill('Cambio de aceite de prueba automatizada');
  await page.getByLabel(/Importe total/).fill('120000');
  await page.getByLabel(/Próximo kilometraje|Kilometraje objetivo/).fill('125000');
  await page.getByLabel(/Mostrar este servicio/).check();
  await page.getByRole('button', { name: 'Guardar en demo' }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await expect(
    page.getByText('Cambio de aceite de prueba automatizada', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.next-service-values')).toContainText('125.000 km');
  await page.getByRole('link', { name: 'Registrar mantenimiento', exact: true }).click();
  await page.getByLabel(/Detalle del Servicio/).fill('Control de prueba');
  await page.getByLabel(/Importe total/).fill('1000');
  await page.getByLabel(/Fecha recomendada/).fill('2026-10-20');
  await page.getByRole('button', { name: 'Guardar en demo' }).click();
  await expect(page.getByRole('alert')).toContainText('La próxima fecha debe ser posterior');
});

test('vista pública: solo servicios autorizados y QR descargable', async ({ page }) => {
  await page.goto('/vehiculos/v2');
  await showMoreOptions(page);
  await expect(page.getByAltText('QR de demostración del historial público')).toHaveAttribute(
    'src',
    /^data:image\/png/,
  );
  const qrDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Descargar QR demo' }).click();
  expect((await qrDownload).suggestedFilename()).toContain('.png');
  await page.goto('/publico/demo/v2');
  await showMoreOptions(page);
  await expect(page.getByRole('heading', { name: 'Historial del vehículo' })).toBeVisible();
  await expect(page.locator('.timeline-item')).toHaveCount(4);
  await expect(page.locator('body')).not.toContainText('Nota interna de ejemplo.');
  await expect(page.locator('body')).not.toContainText('maria.gonzalez@example.com');
  await expect(page.getByRole('heading', { name: 'Frenos', exact: true })).toHaveCount(0);
});

test('exportación JSON identificada como demo y sin restauración simulada', async ({ page }) => {
  await page.goto('/backups');
  await showMoreOptions(page);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar', exact: true }).first().click();
  const file = await downloading;
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(data.demo).toBe(true);
  expect(data.restorable).toBe(false);
  expect(data.customers).toHaveLength(8);
  expect(data.vehicles).toHaveLength(6);
  await expect(page.getByLabel('Seleccionar respaldo JSON o ZIP', { exact: true })).toBeDisabled();
});

test('capturas de las pantallas de referencia', async ({ page }) => {
  for (const [route, name] of [
    ['/', 'dashboard'],
    ['/clientes', 'clientes'],
    ['/vehiculos/v2', 'vehiculo'],
    ['/mantenimientos/nuevo', 'mantenimiento'],
    ['/publico/demo/v2', 'publico'],
  ]) {
    await page.goto(route);
    await showMoreOptions(page);
    await page.screenshot({ path: `/tmp/motortrack-${name}-desktop.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test.describe('pantallas pequeñas', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('menú móvil y páginas sin desbordamiento horizontal', async ({ page }) => {
    await page.goto('/');
    await showMoreOptions(page);
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Clientes', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    for (const [route, name] of [
      ['/', 'dashboard'],
      ['/clientes', 'clientes'],
      ['/vehiculos', 'vehiculos'],
      ['/vehiculos/v2', 'vehiculo'],
      ['/mantenimientos/nuevo', 'mantenimiento'],
      ['/publico/demo/v2', 'publico'],
      ['/backups', 'backups'],
      ['/ajustes', 'ajustes'],
      ['/proximos-servicios', 'proximos'],
    ]) {
      await page.goto(route);
      await showMoreOptions(page);
      await page.screenshot({ path: `/tmp/motortrack-${name}-mobile.png`, fullPage: true });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        route,
      ).toBe(true);
    }
  });
  test('el diálogo mantiene el foco y puede cerrarse con Escape', async ({ page }) => {
    await page.goto('/clientes');
    await showMoreOptions(page);
    await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });
});
