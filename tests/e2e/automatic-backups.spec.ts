import { test, expect, type Page } from '@playwright/test';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
import { parsePhotoBackup } from '../../src/lib/photoBackup';
import { BACKUP_FOLDER_LOCK } from '../../src/lib/backupFolder';
import { resolve } from 'node:path';

async function setup(page: Page) {
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
      // El selector nativo no se automatiza. El sustituto devuelve un handle real de OPFS
      // para probar clonación en IndexedDB, escritura y lectura con las APIs del navegador.
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () =>
          (await navigator.storage.getDirectory()).getDirectoryHandle('copias-prueba', {
            create: true,
          }),
      });
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'queryPermission', {
        configurable: true,
        value: async () => localStorage.getItem('test-folder-permission') ?? 'granted',
      });
      Object.defineProperty(FileSystemDirectoryHandle.prototype, 'requestPermission', {
        configurable: true,
        value: async () => {
          localStorage.setItem('test-folder-permission', 'granted');
          return 'granted';
        },
      });
      const original = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = function (...args) {
        if (localStorage.getItem('test-folder-full'))
          return Promise.reject(new Error('Disco lleno simulado'));
        return original.apply(this, args);
      };
    },
    {
      key: DATABASE_KEY,
      raw: JSON.stringify(
        newDatabase({
          ...emptyData(),
          customers: initialCustomers,
          vehicles: initialVehicles,
          services: initialServices,
        }),
      ),
    },
  );
}
async function files(page: Page) {
  return page.evaluate(async () => {
    const directory = await (
      await navigator.storage.getDirectory()
    ).getDirectoryHandle('copias-prueba', { create: true });
    const rows: { name: string; bytes: number[] }[] = [];
    const iterable = directory as FileSystemDirectoryHandle & {
      values: () => AsyncIterable<FileSystemFileHandle>;
    };
    for await (const file of iterable.values()) {
      if (
        file.kind !== 'file' ||
        !file.name.startsWith('taller-calamante-auto-') ||
        !file.name.endsWith('.zip')
      )
        continue;
      try {
        rows.push({
          name: file.name,
          bytes: Array.from(new Uint8Array(await (await file.getFile()).arrayBuffer())),
        });
      } catch (error) {
        // Un archivo nuevo puede desaparecer mientras una escritura fallida se limpia.
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });
}
async function data(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY);
}
async function connect(page: Page) {
  await page.goto('/backups');
  await page.getByRole('button', { name: 'Elegir carpeta de respaldo', exact: true }).click();
  await expect(page.getByText(/^Última copia verificada:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
}
async function client(page: Page, name: string) {
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Nombre y apellido/)
    .fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cliente', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('carpeta persistente, ZIP con foto y documento, copia manual y pausa sin borrar archivos', async ({
  page,
}) => {
  await setup(page);
  await page.clock.install({ time: new Date('2026-10-22T20:00:00Z') });
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await page.getByLabel(/Detalle del Servicio/).fill('Servicio para respaldo automático completo.');
  await page.getByLabel(/Importe total/).fill('45000');
  await page
    .getByLabel('Seleccionar fotos')
    .setInputFiles(resolve('tests/fixtures/foto-prueba.jpg'));
  await page.locator('.photo-previews img').waitFor();
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
  await page
    .getByLabel('Archivo PDF o imagen', { exact: true })
    .setInputFiles(resolve('tests/fixtures/documento-prueba.pdf'));
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await page.getByRole('article', { name: 'documento-prueba.pdf', exact: true }).waitFor();
  const original = await data(page);
  await connect(page);
  const first = await files(page);
  expect(first).toHaveLength(1);
  const backup = await parsePhotoBackup(new Uint8Array(first[0].bytes));
  expect(backup.photos).toHaveLength(1);
  expect(backup.documents).toHaveLength(1);
  expect(backup.backup.data).toEqual(JSON.parse(original!).data);
  await page.reload();
  await expect(page.getByText(/^Última copia verificada:/)).toBeVisible();
  await page.getByRole('button', { name: 'Crear copia ahora', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  await expect.poll(async () => (await files(page)).length).toBe(2);
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  expect((await files(page)).find((file) => file.name === first[0].name)).toEqual(first[0]);
  await page.getByRole('button', { name: 'Pausar copias' }).click();
  await client(page, 'Cambio durante la pausa');
  await page.clock.fastForward(2 * 86400000);
  await page.goto('/backups');
  expect(await files(page)).toHaveLength(2);
  await page.getByRole('button', { name: 'Activar copias' }).click();
  await expect.poll(async () => (await files(page)).length).toBe(3);
  await page.clock.fastForward(2 * 86400000);
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  expect(await files(page)).toHaveLength(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: '/tmp/calamante-respaldos-automaticos-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Desvincular carpeta' }).click();
  await expect(
    page.getByRole('button', { name: 'Elegir carpeta de respaldo', exact: true }),
  ).toBeEnabled();
  expect(await files(page)).toHaveLength(3);
});

test('permisos y fallos de disco conservan la base y las copias previas; permite reintentar', async ({
  page,
}) => {
  await setup(page);
  await connect(page);
  const first = await files(page);
  const original = await data(page);
  await page.evaluate(() => localStorage.setItem('test-folder-permission', 'prompt'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Autorizar carpeta', exact: true })).toBeVisible();
  expect(await files(page)).toEqual(first);
  await page.getByRole('button', { name: 'Autorizar carpeta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Autorizar carpeta', exact: true })).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('test-folder-full', '1'));
  await page.getByRole('button', { name: 'Crear copia ahora', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Disco lleno simulado');
  expect(await files(page)).toEqual(first);
  expect(await data(page)).toBe(original);
  await page.evaluate(() => localStorage.removeItem('test-folder-full'));
  await page.getByRole('button', { name: 'Crear copia ahora', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  await expect.poll(async () => (await files(page)).length).toBe(2);
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await data(page)).toBe(original);
  expect((await files(page)).find((file) => file.name === first[0].name)).toEqual(first[0]);
});

test('dos pestañas respetan el intervalo y el bloqueo compartido; demo no escribe copias', async ({
  page,
  context,
}) => {
  await setup(page);
  await page.clock.setFixedTime(new Date('2026-10-22T20:00:00Z'));
  await connect(page);
  await page.getByLabel('Intervalo entre copias', { exact: true }).selectOption('60');
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  const second = await context.newPage();
  await setup(second);
  await second.clock.setFixedTime(new Date('2026-10-22T22:00:00Z'));
  await second.goto('/backups');
  await expect(second.getByText(/^Última copia verificada:/)).toBeVisible();
  // Retener el lock impide que cualquier pestaña cree una copia automática anticipada.
  await second.evaluate((name) => {
    void navigator.locks.request(
      name,
      async () =>
        new Promise<void>((resolve) => Object.assign(window, { releaseBackupTestLock: resolve })),
    );
  }, BACKUP_FOLDER_LOCK);
  await second.waitForFunction(
    () => !!(window as unknown as { releaseBackupTestLock?: unknown }).releaseBackupTestLock,
  );
  await page.clock.setFixedTime(new Date('2026-10-22T22:00:00Z'));
  await client(page, 'Cambio para copiar en dos pestañas');
  expect(await files(page)).toHaveLength(1);
  await second.evaluate(() =>
    (window as unknown as { releaseBackupTestLock: () => void }).releaseBackupTestLock(),
  );
  await Promise.all(
    [page, second].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event('focus')))),
  );
  await expect.poll(async () => (await files(page)).length).toBe(2);
  await page.goto('/backups');
  await expect(page.getByRole('button', { name: 'Crear copia ahora', exact: true })).toBeEnabled();
  await expect(
    second.getByRole('button', { name: 'Crear copia ahora', exact: true }),
  ).toBeEnabled();
  expect(await files(page)).toHaveLength(2);
  await second.close();
  const original = await data(page);
  await page.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await page.goto('/backups');
  await expect(
    page.getByText(
      'Volvé a tus datos para configurar copias de la base local. La demostración no guarda archivos en tu carpeta.',
    ),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(await files(page)).toHaveLength(2);
  expect(await data(page)).toBe(original);
});

test('navegador sin selector conserva las descargas manuales', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true }),
  );
  await page.goto('/backups');
  await expect(page.getByText(/Este navegador no permite elegir una carpeta/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Elegir carpeta de respaldo', exact: true }),
  ).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  expect((await pending).suggestedFilename()).toMatch(/\.zip$/);
});
