import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 15000 });
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const databaseKey = 'motortrack-local-database-v1';
const variants = [
  { path: '/Taller-Calamante/', base: resolve(root), version: 1, broken: false },
  { path: '/compiled/Taller-Calamante/', base: resolve(root, 'dist'), version: 1, broken: false },
];
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://local').pathname;
    const variant = variants.find((v) => path.startsWith(v.path));
    if (!variant) {
      response.writeHead(404).end();
      return;
    }
    const relative = decodeURIComponent(path.slice(variant.path.length)) || 'index.html';
    const file = resolve(variant.base, relative);
    if (
      !file.startsWith(variant.base + sep) ||
      (!['index.html', 'sw.js', 'manifest.webmanifest'].includes(relative) &&
        !relative.startsWith('icons/') &&
        !relative.startsWith('site-assets/'))
    ) {
      response.writeHead(404).end();
      return;
    }
    if (variant.broken && relative.includes('jspdf.es.min-')) {
      response.writeHead(503).end();
      return;
    }
    let content = await readFile(file);
    if (relative === 'sw.js') {
      const index = (await readFile(resolve(variant.base, 'index.html'), 'utf8')).replace(
        '</head>',
        `<meta name="test-version" content="${variant.version}"></head>`,
      );
      content = Buffer.from(
        content
          .toString()
          .replace(
            /const BUILD_ID = '[^']+';/,
            `const BUILD_ID = 'test-version-${variant.version}';`,
          )
          .replace(
            /const INDEX_HASH = '[^']+';/,
            `const INDEX_HASH = '${createHash('sha256').update(index).digest('hex')}';`,
          ),
      );
    }
    if (relative === 'index.html')
      content = Buffer.from(
        content
          .toString()
          .replace('</head>', `<meta name="test-version" content="${variant.version}"></head>`),
      );
    response
      .writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
});
async function restore(page, url, file) {
  await page.goto(`${url}#/backups`);
  await page.getByLabel('Seleccionar respaldo JSON o ZIP').setInputFiles(file);
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}
const readData = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).data, databaseKey);
try {
  for (const variant of variants) {
    const context = await browser.newContext();
    const url = origin + variant.path;
    try {
      let page = await context.newPage();
      const errors = [];
      const track = (page) => page.on('pageerror', (error) => errors.push(error.message));
      track(page);
      await page.goto(url);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      const manifest = await page.evaluate(async () => {
        const response = await fetch(document.querySelector('link[rel="manifest"]').href);
        return { url: response.url, data: await response.json() };
      });
      assert.equal(new URL(manifest.data.scope, manifest.url).pathname, variant.path);
      assert.equal(new URL(manifest.data.start_url, manifest.url).pathname, variant.path);
      assert.equal(manifest.data.display, 'standalone');
      for (const icon of manifest.data.icons) {
        const dimensions = await page.evaluate(async (url) => {
          const image = await createImageBitmap(await (await fetch(url)).blob());
          const size = `${image.width}x${image.height}`;
          image.close();
          return size;
        }, new URL(icon.src, manifest.url).href);
        assert.equal(dimensions, icon.sizes);
      }
      await page.evaluate(async () => {
        await (
          await caches.open('other-application-proof')
        ).put('/other-app', new Response('conservar'));
      });
      await restore(page, url, resolve(root, 'src/data/taller-calamante-practica.json'));
      await context.setOffline(true);
      await page.close();
      page = await context.newPage();
      track(page);
      await page.goto(`${url}#/ajustes`);
      await page.getByRole('button', { name: 'Aplicación', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Lista para usar sin conexión', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Sin conexión. Podés seguir trabajando en este dispositivo.', {
          exact: true,
        }),
      ).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      await page.screenshot({
        path: `/tmp/calamante-offline-${variant.path.startsWith('/compiled/') ? 'compiled' : 'root'}.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      // Se vacía solo el caché de la interfaz, nunca localStorage ni IndexedDB.
      await context.setOffline(false);
      await page.evaluate(async (path) => {
        for (const name of await caches.keys()) {
          if (name.startsWith(`taller-calamante-offline:${path}:`)) await caches.delete(name);
        }
      }, variant.path);
      await page.reload();
      await page.getByRole('button', { name: 'Aplicación', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Lista para usar sin conexión', exact: true }),
      ).toBeVisible();
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible();
      // PDF y ZIP se abren por primera vez sin red: sus módulos deben estar preparados.
      await page.goto(`${url}#/mantenimientos`);
      let pending = page.waitForEvent('download');
      await page
        .getByRole('button', { name: /^Descargar PDF/ })
        .first()
        .click();
      assert.match((await readFile(await (await pending).path())).toString('latin1'), /^%PDF-/);
      await page.goto(`${url}#/clientes`);
      await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel(/Nombre y apellido/)
        .fill('Cliente creado sin internet');
      await page.getByRole('dialog').getByRole('button', { name: 'Guardar cliente' }).click();
      await page.reload();
      await page.getByLabel('Buscar clientes', { exact: true }).fill('Cliente creado sin internet');
      await expect(
        page.getByRole('button', { name: /^Cliente creado sin internet/ }),
      ).toBeVisible();
      await page.goto(`${url}#/productos`);
      await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
      const productDialog = page.getByRole('dialog');
      await productDialog.getByLabel('Código').fill('HAB-OFF');
      await productDialog.getByLabel('Descripción').fill('Filtro de habitáculo sin conexión');
      await productDialog.getByLabel('Precio sugerido').fill('12000');
      await productDialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
      await productDialog.waitFor({ state: 'hidden' });
      await page.reload();
      await page.getByRole('button', { name: 'Editar producto HAB-OFF', exact: true }).waitFor();
      await page.goto(`${url}#/mantenimientos/nuevo?vehiculo=practica-v02`);
      await page.getByLabel(/Tipo de servicio/).selectOption('Filtro de habitáculo');
      await page
        .getByLabel(/Detalle del Servicio/)
        .fill('Filtro de habitáculo cargado sin internet.');
      await page.getByRole('button', { name: 'Agregar desde catálogo', exact: true }).click();
      await page.getByLabel('Buscar producto', { exact: true }).fill('haboff');
      await page.getByRole('button', { name: 'Agregar HAB-OFF', exact: true }).click();
      await expect(page.getByLabel('Precio unitario artículo 1', { exact: true })).toHaveValue(
        '12000',
      );
      await page.getByLabel(/Importe total/).fill('35000');
      await page
        .getByLabel('Seleccionar fotos')
        .setInputFiles(resolve(root, 'tests/fixtures/foto-prueba.jpg'));
      await page.locator('.photo-previews img').waitFor();
      await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
      try {
        await page.waitForURL(/vehiculos\/practica-v02$/);
      } catch (error) {
        console.error(
          'Diagnóstico guardado offline:',
          await page.evaluate(() => ({
            messages: [...document.querySelectorAll('.form-error,.toast')].map(
              (node) => node.textContent,
            ),
            invalid: [...document.querySelectorAll('input,select,textarea')]
              .filter((node) => !node.validity.valid)
              .map((node) => ({
                name: node.name,
                label: node.getAttribute('aria-label'),
                value: node.value,
                validation: node.validationMessage,
              })),
          })),
        );
        throw error;
      }
      await page.reload();
      await page.getByRole('tab', { name: 'Fotos', exact: true }).click();
      await page.getByRole('button', { name: /^Ver foto foto-prueba.jpg/ }).waitFor();
      await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
      await page
        .getByLabel('Archivo PDF o imagen', { exact: true })
        .setInputFiles(resolve(root, 'tests/fixtures/documento-prueba.pdf'));
      await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
      await page.getByRole('article', { name: 'documento-prueba.pdf', exact: true }).waitFor();
      await page
        .getByLabel('Archivo PDF o imagen', { exact: true })
        .setInputFiles(resolve(root, 'tests/fixtures/documento-imagen.webp'));
      await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
      await page
        .getByRole('button', { name: 'Ver documento documento-imagen.webp', exact: true })
        .click();
      await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar vista previa' }).click();
      const saved = await readData(page);
      await page.goto(`${url}#/backups`);
      pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
      const zip = await readFile(await (await pending).path());
      const entries = unzipSync(zip);
      assert.equal(Object.keys(entries).filter((name) => name.startsWith('documents/')).length, 2);
      assert.equal(Object.keys(entries).filter((name) => name.startsWith('photos/')).length, 1);
      await restore(page, url, { name: 'offline.zip', mimeType: 'application/zip', buffer: zip });
      const recovered = await readData(page);
      assert.deepEqual(recovered.customers, saved.customers);
      assert.deepEqual(recovered.services, saved.services);
      assert.equal(recovered.documents[0].sha256, saved.documents[0].sha256);
      assert.equal(recovered.photos[0].sha256, saved.photos[0].sha256);
      await context.setOffline(false);
      variant.version = 2;
      await page.goto(`${url}#/mantenimientos/nuevo?vehiculo=practica-v02`);
      await page.getByLabel(/Detalle del Servicio/).fill('Texto pendiente que no se debe perder.');
      await page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration()).update();
      });
      await page.getByRole('button', { name: 'Actualizar aplicación', exact: true }).waitFor();
      assert.equal(await page.locator('meta[name="test-version"]').getAttribute('content'), '1');
      await expect(page.getByLabel(/Detalle del Servicio/)).toHaveValue(
        'Texto pendiente que no se debe perder.',
      );
      await page.getByRole('button', { name: 'Actualizar aplicación', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Más tarde' }).click();
      await expect(page.getByLabel(/Detalle del Servicio/)).toHaveValue(
        'Texto pendiente que no se debe perder.',
      );
      // Otra pestaña puede aplicar la actualización sin recargar el formulario pendiente.
      const background = await context.newPage();
      await background.goto(`${url}#/ajustes`);
      await background.getByRole('button', { name: 'Actualizar aplicación', exact: true }).click();
      await background
        .getByRole('dialog')
        .getByRole('button', { name: 'Recargar y actualizar' })
        .click();
      await expect(background.locator('meta[name="test-version"]')).toHaveAttribute('content', '2');
      await expect(page.getByLabel(/Detalle del Servicio/)).toHaveValue(
        'Texto pendiente que no se debe perder.',
      );
      assert.equal(await page.locator('meta[name="test-version"]').getAttribute('content'), '1');
      await background.close();
      await page.getByLabel(/Importe total/).fill('10000');
      await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
      await page.waitForURL(/vehiculos\/practica-v02$/);
      const beforeUpdate = await readData(page);
      await page.getByRole('button', { name: 'Actualizar aplicación', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Recargar y actualizar' }).click();
      await expect(page.locator('meta[name="test-version"]')).toHaveAttribute('content', '2');
      assert.deepEqual(await readData(page), beforeUpdate);
      // Una actualización incompleta conserva la versión funcional y los datos.
      variant.version = 3;
      variant.broken = true;
      await page.goto(`${url}#/ajustes`);
      await page.getByRole('button', { name: 'Aplicación', exact: true }).click();
      await page.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('No se pudo preparar');
      await expect(
        page.getByRole('heading', { name: 'Lista para usar sin conexión', exact: true }),
      ).toBeVisible();
      await context.setOffline(true);
      await page.close();
      page = await context.newPage();
      track(page);
      await page.goto(`${url}#/vehiculos/practica-v02`);
      await expect(page.locator('meta[name="test-version"]')).toHaveAttribute('content', '2');
      await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
      pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar documento documento-prueba.pdf' }).click();
      assert.deepEqual(
        await readFile(await (await pending).path()),
        await readFile(resolve(root, 'tests/fixtures/documento-prueba.pdf')),
      );
      pending = page.waitForEvent('download');
      await page
        .getByRole('button', { name: 'Descargar documento documento-imagen.webp', exact: true })
        .click();
      assert.deepEqual(
        await readFile(await (await pending).path()),
        await readFile(resolve(root, 'tests/fixtures/documento-imagen.webp')),
      );
      assert.equal(
        await page.evaluate(
          async () => !!(await (await caches.open('other-application-proof')).match('/other-app')),
        ),
        true,
      );
      assert.deepEqual(errors, []);
      // Primera preparación incompleta: se informa y se puede reintentar sin borrar registros.
      variant.version = 4;
      const fresh = await browser.newContext();
      try {
        const initial = await fresh.newPage();
        await initial.goto(`${url}#/ajustes`);
        await initial.getByRole('button', { name: 'Aplicación', exact: true }).click();
        await expect(initial.getByRole('alert')).toContainText('No se pudo preparar');
        variant.broken = false;
        await initial.getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click();
        await expect(
          initial.getByRole('heading', { name: 'Lista para usar sin conexión', exact: true }),
        ).toBeVisible();
        await fresh.setOffline(true);
        await initial.reload();
        await expect(initial.getByRole('heading', { name: 'Ajustes', exact: true })).toBeVisible();
      } finally {
        await fresh.close();
      }

      console.log(
        `${variant.path}: apertura offline, datos, PDF, fotos, documentos, ZIP, actualización confirmada y fallo de actualización correctos.`,
      );
    } finally {
      await context.close();
      variant.version = 1;
      variant.broken = false;
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
