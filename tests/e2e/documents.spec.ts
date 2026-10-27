import { showMoreOptions } from './helpers/options';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { DATABASE_KEY, SAFETY_COPY_KEY, emptyData, newDatabase } from '../../src/lib/localDatabase';
import { DOCUMENT_DATABASE } from '../../src/lib/documents';

const fixture = new URL('../fixtures/documento-prueba.pdf', import.meta.url);
async function seed(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    {
      key: DATABASE_KEY,
      value: JSON.stringify(
        newDatabase({ ...emptyData(), customers: initialCustomers, vehicles: initialVehicles }),
      ),
    },
  );
}
async function data(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).data, DATABASE_KEY);
}
async function open(page: Page) {
  await page.goto('/vehiculos/v2');
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
}
async function select(page: Page) {
  await page.getByLabel('Tipo de documento').selectOption('Seguro');
  await page.getByLabel('Archivo PDF o imagen', { exact: true }).setInputFiles({
    name: 'seguro.pdf',
    mimeType: 'application/pdf',
    buffer: await readFile(fixture),
  });
}
async function save(page: Page) {
  await select(page);
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await expect(page.getByRole('article', { name: 'seguro.pdf', exact: true })).toBeVisible();
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar documento seguro.pdf', exact: true }).click();
  return readFile((await (await pending).path())!);
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
async function storedCount(page: Page) {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('documents')) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction('documents').objectStore('documents').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => {
            db.close();
            reject(count.error);
          };
        };
        request.onerror = () => reject(request.error);
      }),
    DOCUMENT_DATABASE,
  );
}

test('PDF persistente, descarga original, ZIP a otro navegador y recuperación de copia previa', async ({
  page,
  browser,
}) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await save(page);
  await page.reload();
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
  await page.screenshot({ path: '/tmp/calamante-documentacion-mobile.png', fullPage: true });
  const original = await data(page);
  expect(await download(page)).toEqual(await readFile(fixture));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  const zip = await readFile((await (await pending).path())!);
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const second = await other.newPage();
    await restore(second, 'completo.zip', zip);
    await open(second);
    expect(await download(second)).toEqual(await readFile(fixture));
    const recovered = await data(second);
    expect(recovered.documents[0].sha256).toBe(original.documents[0].sha256);
    expect(recovered.documentSet).not.toBe(original.documentSet);
    expect(recovered.documents[0].id).not.toBe(original.documents[0].id);
  } finally {
    await other.close();
  }
  await restore(
    page,
    'vacio.json',
    Buffer.from(
      JSON.stringify({
        format: 'motortrack-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: emptyData(),
      }),
    ),
  );
  const previous = await page.evaluate((key) => localStorage.getItem(key)!, SAFETY_COPY_KEY);
  await restore(page, 'previa.json', Buffer.from(previous));
  await open(page);
  expect(await download(page)).toEqual(await readFile(fixture));
  await page.getByRole('button', { name: 'Quitar documento seguro.pdf' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  expect(await data(page)).toEqual(original);
  await page.getByRole('button', { name: 'Quitar documento seguro.pdf' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y quitar' }).click();
  await page.reload();
  await showMoreOptions(page);
  expect((await data(page)).documents).toEqual([]);
});

for (const failure of ['archivos', 'registros'] as const) {
  test(`fallo de ${failure} no crea documentos parciales y permite reintentar`, async ({
    page,
  }) => {
    await seed(page);
    await open(page);
    await select(page);
    const before = await data(page);
    await page.evaluate(
      ({ failure, key }) => {
        if (failure === 'archivos') {
          const original = IDBObjectStore.prototype.add;
          Object.assign(window, {
            restoreDocumentWrite: () => {
              IDBObjectStore.prototype.add = original;
            },
          });
          IDBObjectStore.prototype.add = function (...args) {
            if (this.name === 'documents') throw new Error('fallo simulado');
            return original.apply(this, args);
          };
        } else {
          const original = Storage.prototype.setItem;
          Object.assign(window, {
            restoreDocumentWrite: () => {
              Storage.prototype.setItem = original;
            },
          });
          Storage.prototype.setItem = function (name, value) {
            if (name === key) throw new Error('fallo simulado');
            return original.call(this, name, value);
          };
        }
      },
      { failure, key: DATABASE_KEY },
    );
    await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('No se pudo guardar');
    expect(await data(page)).toEqual(before);
    if (failure === 'registros') expect(await storedCount(page)).toBe(0);
    await page.evaluate(() =>
      (window as unknown as { restoreDocumentWrite: () => void }).restoreDocumentWrite(),
    );
    await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
    await expect(page.getByRole('article', { name: 'seguro.pdf' })).toBeVisible();
    expect(await download(page)).toEqual(await readFile(fixture));
  });
}

test('rechaza PDF falso; la demo no escribe documentos locales ni los expone por QR', async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await page.getByLabel('Archivo PDF o imagen', { exact: true }).setInputFiles({
    name: 'falso.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('no es PDF'),
  });
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('PDF válido');
  expect((await data(page)).documents).toBeUndefined();
  // Descartar explícitamente el archivo inválido antes de cambiar de base.
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('cambios sin guardar');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await open(page);
  await save(page);
  expect((await data(page)).documents).toBeUndefined();
  expect(await download(page)).toEqual(await readFile(fixture));
  // No se abre IndexedDB en la demo; se comprueba sin crear una colección de prueba.
  expect(
    await page.evaluate(
      async (name) => (await indexedDB.databases()).some((db) => db.name === name),
      DOCUMENT_DATABASE,
    ),
  ).toBe(false);
  await page.goto('/publico/demo/v2');
  await showMoreOptions(page);
  await expect(page.locator('body')).not.toContainText('seguro.pdf');
  await open(page);
  await expect(page.getByText('Este vehículo todavía no tiene documentos.')).toBeVisible();
});

test('restauración fallida elimina solo los archivos nuevos; conserva el documento anterior', async ({
  page,
}) => {
  await seed(page);
  await open(page);
  await save(page);
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
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new Error('fallo simulado');
      return original.call(this, name, value);
    };
  }, DATABASE_KEY);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'La base actual se conserva',
  );
  expect(await data(page)).toEqual(before);
  expect(await storedCount(page)).toBe(1);
  await open(page);
  expect(await download(page)).toEqual(await readFile(fixture));
});

test('imágenes privadas: vista previa, edición, originales y ZIP restaurado en otro navegador', async ({
  page,
  browser,
}) => {
  await seed(page);
  await open(page);
  await save(page);
  const examples = [
    ['cedula.jpg', 'documento-rotado.jpg'],
    ['seguro.png', 'documento-imagen.png'],
    ['vtv.webp', 'documento-imagen.webp'],
  ] as const;
  for (const [name, fixtureName] of examples) {
    const bytes = await readFile(new URL(`../fixtures/${fixtureName}`, import.meta.url));
    await page
      .getByLabel('Archivo PDF o imagen', { exact: true })
      .setInputFiles({ name, mimeType: 'application/octet-stream', buffer: bytes });
    await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
    await page.getByRole('button', { name: `Ver documento ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('img', { name, exact: true })).toBeVisible();
    expect(
      await dialog.getByRole('img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Cerrar vista previa' }).click();
  }
  await page.getByRole('button', { name: 'Editar documento seguro.png', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre del archivo').fill('seguro.pdf');
  await dialog.getByRole('button', { name: 'Guardar cambios del documento' }).click();
  await expect(dialog.getByRole('alert')).toContainText('formato PNG original');
  await dialog.getByLabel('Nombre del archivo').fill('seguro-corregido.png');
  await dialog.getByLabel('Tipo de documento').selectOption('Seguro');
  await dialog.getByRole('button', { name: 'Guardar cambios del documento' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await showMoreOptions(page);
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(4);
  await page.goto('/backups');
  await showMoreOptions(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
  const zip = await readFile((await (await pending).path())!);
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  try {
    const other = await context.newPage();
    await restore(other, 'documentos.zip', zip);
    await open(other);
    for (const [name, fixtureName] of examples) {
      const download = other.waitForEvent('download');
      await other
        .getByRole('button', {
          name: `Descargar documento ${name === 'seguro.png' ? 'seguro-corregido.png' : name}`,
          exact: true,
        })
        .click();
      expect(await readFile((await (await download).path())!)).toEqual(
        await readFile(new URL(`../fixtures/${fixtureName}`, import.meta.url)),
      );
    }
    expect(
      await (
        await data(other)
      ).documents.filter((d: { mime?: string }) => d.mime?.startsWith('image/')),
    ).toHaveLength(3);
  } finally {
    await context.close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page
    .getByRole('button', { name: 'Ver documento seguro-corregido.png', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('rechaza imágenes dañadas y mantiene la demostración de imágenes separada de los datos locales', async ({
  page,
}) => {
  await seed(page);
  await open(page);
  const before = await data(page);
  await page.getByLabel('Archivo PDF o imagen', { exact: true }).setInputFiles({
    name: 'falso.png',
    mimeType: 'image/png',
    buffer: Buffer.from('imagen falsa'),
  });
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('dañada');
  expect(await data(page)).toEqual(before);
  const corrupt = Buffer.from(
    await readFile(new URL('../fixtures/documento-imagen.png', import.meta.url)),
  );
  corrupt.fill(0, 45, corrupt.length - 12);
  await page
    .getByLabel('Archivo PDF o imagen', { exact: true })
    .setInputFiles({ name: 'dañada.png', mimeType: 'image/png', buffer: corrupt });
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('dañada');
  expect(await data(page)).toEqual(before);
  // Descartar explícitamente el archivo inválido antes de cambiar de base.
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('cambios sin guardar');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await open(page);
  await page
    .getByLabel('Archivo PDF o imagen', { exact: true })
    .setInputFiles(new URL('../fixtures/documento-alpha.webp', import.meta.url).pathname);
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ver documento documento-alpha.webp', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar vista previa' }).click();
  expect(await data(page)).toEqual(before);
  await page.getByRole('button', { name: 'Volver a mis datos', exact: true }).click();
  await open(page);
  await expect(page.getByRole('article')).toHaveCount(0);
});
