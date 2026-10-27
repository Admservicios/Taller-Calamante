import { showMoreOptions } from './helpers/options';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, SAFETY_COPY_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
import { PHOTO_DATABASE, photoHash } from '../../src/lib/photos';

const fixture = new URL('../fixtures/foto-prueba.jpg', import.meta.url);
async function seed(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(
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
async function data(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
async function prepare(page: Page) {
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  await page.getByLabel(/Detalle del Servicio/).fill('Servicio con fotografía local persistente.');
  await page.getByLabel(/Importe total/).fill('45000');
  await page
    .getByLabel('Seleccionar fotos')
    .setInputFiles({ name: 'motor.jpg', mimeType: 'image/jpeg', buffer: await readFile(fixture) });
  await expect(page.locator('.photo-previews img')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }),
  ).toBeEnabled();
}
async function restore(page: Page, filename: string, content: Buffer) {
  await page.goto('/backups');
  await showMoreOptions(page);
  await page.getByLabel('Seleccionar respaldo JSON o ZIP').setInputFiles({
    name: filename,
    mimeType: filename.endsWith('.zip') ? 'application/zip' : 'application/json',
    buffer: content,
  });
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function openGallery(page: Page) {
  await page.goto('/vehiculos/v2');
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Fotos', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ver foto motor.jpg/ })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.maintenance-photo-card img')
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
}

test('fotos persistentes, ZIP a otro navegador y recuperación de la copia previa con sus fotos', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await seed(page);
  await prepare(page);
  expect((await data(page)).photos).toBeUndefined();
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.reload();
  await showMoreOptions(page);
  await openGallery(page);
  const original = await data(page);
  expect(original.photos).toHaveLength(1);
  expect(original.services).toHaveLength(initialServices.length + 1);
  await page.getByRole('button', { name: /^Ver foto motor.jpg/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Descargar foto' }).click();
  const bytes = await readFile((await (await download).path())!);
  expect(await photoHash(new Blob([new Uint8Array(bytes)]))).toBe(original.photos[0].sha256);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Cerrar/ })
    .click();
  await page.goto('/backups');
  await showMoreOptions(page);
  const archiveDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  const zip = await readFile((await (await archiveDownload).path())!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const second = await other.newPage();
    await restore(second, 'respaldo-completo.zip', zip);
    await second.reload();
    await showMoreOptions(second);
    await openGallery(second);
    const recovered = await data(second);
    expect(recovered.customers).toEqual(original.customers);
    expect(recovered.services).toEqual(original.services);
    expect(recovered.photos[0].sha256).toBe(original.photos[0].sha256);
    expect(recovered.photoSet).not.toBe(original.photoSet);
    expect(recovered.photos[0].id).not.toBe(original.photos[0].id);
  } finally {
    await other.close();
  }
  const blank = Buffer.from(
    JSON.stringify({
      format: 'motortrack-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: emptyData(),
    }),
  );
  await restore(page, 'vacio.json', blank);
  expect((await data(page)).services).toHaveLength(0);
  const previous = await page.evaluate((key) => localStorage.getItem(key)!, SAFETY_COPY_KEY);
  await restore(page, 'copia-previa.json', Buffer.from(previous));
  await openGallery(page);
  expect(await data(page)).toEqual(original);
  await page.goto('/publico/demo/v2');
  await showMoreOptions(page);
  await expect(page.locator('body')).not.toContainText('motor.jpg');
  await expect(page.locator('body')).not.toContainText(
    'Servicio con fotografía local persistente.',
  );
});

for (const failure of ['archivos', 'registros'] as const) {
  test(`fallo al guardar ${failure}: conserva base y fotos del formulario sin crear un servicio parcial`, async ({
    page,
  }) => {
    await seed(page);
    await prepare(page);
    const before = await data(page);
    await page.evaluate(
      ({ failure, key }) => {
        if (failure === 'archivos') {
          IDBObjectStore.prototype.add = function () {
            throw new DOMException('Full', 'QuotaExceededError');
          };
        } else {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function (k, v) {
            if (k === key) throw new DOMException('Full', 'QuotaExceededError');
            return original.call(this, k, v);
          };
        }
      },
      { failure, key: DATABASE_KEY },
    );
    await page.getByRole('button', { name: 'Guardar y generar PDF', exact: true }).click();
    await expect(page.locator('.toast[role="status"]')).toContainText('No se pudo guardar');
    await expect(
      page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }),
    ).toBeEnabled();
    await expect(page).toHaveURL(/mantenimientos\/nuevo/);
    expect(await data(page)).toEqual(before);
    await expect(page.locator('.photo-previews img')).toHaveCount(1);
    const count = await page.evaluate(
      (name) =>
        new Promise<number>((resolve, reject) => {
          const request = indexedDB.open(name, 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('photos', 'readonly');
            const read = tx.objectStore('photos').count();
            tx.oncomplete = () => {
              db.close();
              resolve(read.result);
            };
          };
        }),
      PHOTO_DATABASE,
    );
    expect(count).toBe(0);
  });
}

test('rechaza archivos falsos y exceso de fotos sin guardar registros ni archivos', async ({
  page,
}) => {
  await seed(page);
  await page.goto('/mantenimientos/nuevo?vehiculo=v2');
  await showMoreOptions(page);
  const before = await data(page);
  await page.getByLabel('Seleccionar fotos').setInputFiles({
    name: 'falsa.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('texto que no es una imagen'),
  });
  await expect(page.getByRole('alert')).toContainText('imágenes JPG, PNG o WebP válidas');
  const image = { name: 'motor.jpg', mimeType: 'image/jpeg', buffer: await readFile(fixture) };
  await page.getByLabel('Seleccionar fotos').setInputFiles(Array.from({ length: 7 }, () => image));
  await expect(page.getByRole('alert')).toContainText('hasta 6 fotos');
  await expect(page.locator('.photo-previews img')).toHaveCount(0);
  expect(await data(page)).toEqual(before);
});

test('demo mantiene fotos solo en memoria y no escribe archivos en la base local', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('motortrack-view-mode', 'demo'));
  await prepare(page);
  await page.getByRole('button', { name: 'Guardar en demo', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  await page.getByRole('tab', { name: 'Fotos', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ver foto motor.jpg/ })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), DATABASE_KEY)).toBeNull();
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  await page.reload();
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Fotos', exact: true }).click();
  await expect(
    page.getByText('Este vehículo todavía no tiene fotos de mantenimiento.'),
  ).toBeVisible();
});

test('una restauración fallida conserva las fotos anteriores y un ZIP incompleto no se exporta', async ({
  page,
}) => {
  test.setTimeout(60000);
  await seed(page);
  await prepare(page);
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(/vehiculos\/v2$/);
  const before = await data(page);
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  const zip = await readFile((await (await pending).path())!);
  await page
    .getByLabel('Seleccionar respaldo JSON o ZIP')
    .setInputFiles({ name: 'completo.zip', mimeType: 'application/zip', buffer: zip });
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await page.evaluate(() => {
    IDBObjectStore.prototype.add = function () {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'La base actual se conserva',
  );
  expect(await data(page)).toEqual(before);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await openGallery(page);
  await page.evaluate(
    ({ name, id }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('photos', 'readwrite');
          tx.objectStore('photos').delete(id);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { name: PHOTO_DATABASE, id: before.photos[0].id },
  );
  await page.goto('/backups');
  await showMoreOptions(page);
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  await expect(page.getByRole('alert')).toContainText('Faltan fotos');
  expect(await data(page)).toEqual(before);
});
