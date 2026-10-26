import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  initialCustomers,
  initialServices,
  initialVehicles,
  type Service,
} from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
import { servicePlan } from '../../src/lib/maintenancePlans';
const first: Service = {
  ...initialServices[0],
  id: 'report-first',
  date: '2026-01-10',
  km: 80000,
  type: 'Cambio de aceite',
  work: 'TRABAJO ANTIGUO DEL HISTORIAL',
  notes: 'NOTA PRIVADA DEL HISTORIAL',
};
first.maintenance = servicePlan(first, {
  date: '2026-07-10',
  km: 90000,
  recommendation: 'Renovar aceite',
});
const last: Service = {
  ...first,
  id: 'report-last',
  date: '2026-10-05',
  km: 112300,
  type: 'Frenos',
  work: 'TRABAJO RECIENTE DEL HISTORIAL',
  amount: 12345.67,
};
last.maintenance = servicePlan(last, {
  date: '2027-03-05',
  km: 150000,
  recommendation: 'Revisar pastillas',
});
async function seed(page: Page, empty = false) {
  await page.clock.setFixedTime(new Date('2026-10-26T15:00:00Z'));
  const archived = {
    ...last,
    id: 'report-archived',
    work: 'TRABAJO ANULADO DEL HISTORIAL',
    annulment: { at: '2026-10-26T12:00:00Z', reason: 'MOTIVO PRIVADO DE ANULACION' },
  };
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(
        newDatabase({
          ...emptyData(),
          customers: initialCustomers.map((c) => ({ ...c, notes: 'NOTA PRIVADA DEL CLIENTE' })),
          vehicles: [
            { ...initialVehicles[1], maintenancePlans: [first.maintenance!, last.maintenance!] },
          ],
          services: empty ? [archived] : [first, last, archived],
        }),
      ),
    },
  );
}
const read = (page: Page) => page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);
async function open(page: Page) {
  await page.goto('/vehiculos/v2');
  await page.getByRole('button', { name: 'Historial PDF', exact: true }).click();
  return page.getByRole('dialog', { name: 'Descargar historial del vehículo' });
}

test('PDF completo y por período, opciones de importes y vencimientos, sin privados ni anulados', async ({
  page,
}) => {
  await seed(page);
  const dialog = await open(page);
  const before = await read(page);
  await expect(dialog).toContainText('2 mantenimientos activos');
  let pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar historial PDF', exact: true }).click();
  let file = await pending;
  expect(file.suggestedFilename()).toBe(
    'taller-calamante-historial-AF-456-EF-inicio-2026-10-26.pdf',
  );
  let pdf = (await readFile((await file.path())!)).toString('latin1');
  expect(pdf).toMatch(/^%PDF-/);
  for (const value of [
    'TRABAJO ANTIGUO DEL HISTORIAL',
    'TRABAJO RECIENTE DEL HISTORIAL',
    'ARS 12.345,67',
    'Vencimientos vigentes',
  ])
    expect(pdf).toContain(value);
  for (const value of [
    'NOTA PRIVADA DEL HISTORIAL',
    'NOTA PRIVADA DEL CLIENTE',
    'TRABAJO ANULADO DEL HISTORIAL',
    'MOTIVO PRIVADO DE ANULACION',
  ])
    expect(pdf).not.toContain(value);
  await dialog.getByLabel('Desde', { exact: true }).fill('2026-10-05');
  await dialog.getByLabel('Hasta', { exact: true }).fill('2026-10-05');
  await dialog.getByLabel('Incluir importes de los servicios').uncheck();
  await dialog.getByLabel('Incluir próximos servicios vigentes').uncheck();
  await expect(dialog).toContainText('1 mantenimiento activo');
  pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar historial PDF', exact: true }).click();
  pdf = (await readFile((await (await pending).path())!)).toString('latin1');
  expect(pdf).toContain('TRABAJO RECIENTE DEL HISTORIAL');
  expect(pdf).not.toContain('TRABAJO ANTIGUO DEL HISTORIAL');
  expect(pdf).not.toContain('ARS ');
  expect(pdf).not.toContain('Vencimientos vigentes');
  expect(await read(page)).toBe(before);
  await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await expect(dialog).toHaveCount(0);
});

test('fechas inválidas o sin servicios deshabilitan descarga; un fallo conserva opciones y permite reintentar', async ({
  page,
}) => {
  await seed(page);
  const dialog = await open(page);
  const before = await read(page);
  const download = dialog.getByRole('button', { name: 'Descargar historial PDF', exact: true });
  await dialog.getByLabel('Desde', { exact: true }).fill('2026-12-01');
  await dialog.getByLabel('Hasta', { exact: true }).fill('2026-01-01');
  await expect(dialog.getByRole('alert')).toContainText('Desde');
  await expect(download).toBeDisabled();
  await dialog.getByLabel('Hasta', { exact: true }).fill('2026-12-31');
  await expect(dialog).toContainText('No hay mantenimientos activos en este período.');
  await expect(download).toBeDisabled();
  await dialog.getByLabel('Desde', { exact: true }).fill('');
  await dialog.getByLabel('Hasta', { exact: true }).fill('');
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    Object.assign(window, {
      restorePDFDownload: () => {
        URL.createObjectURL = original;
      },
    });
    URL.createObjectURL = () => {
      throw new Error('No se pudo descargar el archivo de prueba');
    };
  });
  await download.click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo generar o descargar');
  expect(await read(page)).toBe(before);
  await page.evaluate(() => {
    (window as unknown as { restorePDFDownload: () => void }).restorePDFDownload();
  });
  const pending = page.waitForEvent('download');
  await download.click();
  expect((await readFile((await (await pending).path())!)).subarray(0, 5).toString()).toBe('%PDF-');
});

test('solo anulados no habilitan PDF; demo identificada y diálogo móvil sin desbordar', async ({
  page,
}) => {
  await seed(page, true);
  await page.goto('/vehiculos/v2');
  await expect(page.getByRole('button', { name: 'Historial PDF', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await page.goto('/vehiculos/v2');
  await page.setViewportSize({ width: 320, height: 780 });
  await page.getByRole('button', { name: 'Historial PDF', exact: true }).click();
  const dialog = page.getByRole('dialog');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const before = await read(page);
  const pending = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar historial PDF', exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toContain('-demo-');
  expect((await readFile((await file.path())!)).toString('latin1')).toContain('DATOS FICTICIOS');
  expect(await read(page)).toBe(before);
  await page.screenshot({ path: '/tmp/calamante-historial-pdf-mobile.png', fullPage: true });
});

test('cerrar mientras carga el generador cancela la descarga pendiente sin tocar la base', async ({
  page,
}) => {
  await seed(page);
  const dialog = await open(page);
  const before = await read(page);
  let release: () => void = () => {};
  let started: () => void = () => {};
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*jspdf*', async (route) => {
    started();
    await blocked;
    await route.continue();
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  await dialog.getByRole('button', { name: 'Descargar historial PDF', exact: true }).click();
  await requested;
  await dialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
  await expect(dialog).toHaveCount(0);
  release();
  await page.waitForLoadState('networkidle');
  expect(downloads).toBe(0);
  expect(await read(page)).toBe(before);
});
