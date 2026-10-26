import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
assert.equal(
  await readFile(resolve(root, 'index.html'), 'utf8'),
  await readFile(resolve(root, 'dist/index.html'), 'utf8'),
  'La raíz publicada está desactualizada. Ejecutar npm run publish:static antes de subir cambios.',
);
const mount = '/Organizador-Abonados-Aercom/';
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
    const path = decodeURIComponent(new URL(request.url, 'http://test.local').pathname);
    const compiled = path.startsWith(`/compiled${mount}`);
    const prefix = compiled ? `/compiled${mount}` : mount;
    const base = compiled ? resolve(root, 'dist') : resolve(root);
    const relative = path.slice(prefix.length) || 'index.html';
    if (
      !path.startsWith(prefix) ||
      (!['index.html', 'sw.js', 'manifest.webmanifest'].includes(relative) &&
        !relative.startsWith('site-assets/') &&
        !relative.startsWith('icons/'))
    ) {
      response.writeHead(404).end();
      return;
    }
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep)) {
      response.writeHead(403).end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  });
  const port = server.address().port;
  for (const [name, path] of [
    ['Pages desde main', mount],
    ['Pages desde Actions', `/compiled${mount}`],
  ]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.url().includes('/site-assets/') && response.status() >= 400)
          errors.push(`Recurso ${response.status()}: ${response.url()}`);
      });
      const url = `http://127.0.0.1:${port}${path}`;
      assert.equal((await page.goto(url)).status(), 200);
      await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
      assert.match(await page.title(), /Taller Calamante/);
      assert.match(await page.locator('.sidebar .brand').innerText(), /Calamante/);
      await page.goto(`${url}#/clientes`);
      await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(/Nombre y apellido/).fill('Cliente de prueba estática');
      await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
      await page.reload();
      await page.getByRole('button', { name: /^Cliente de prueba estática/ }).waitFor();
      await page.goto(`${url}#/publico/demo/v2`);
      await page.getByRole('heading', { name: 'Historial del vehículo', exact: true }).waitFor();
      assert.ok(!(await page.locator('body').innerText()).includes('Cliente de prueba estática'));
      await page.goto(`${url}#/backups`);
      await page
        .getByLabel('Seleccionar respaldo JSON')
        .setInputFiles(resolve(root, 'src/data/taller-calamante-practica.json'));
      await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
      await page.getByRole('dialog').getByRole('checkbox').check();
      await page.getByRole('dialog').getByRole('button', { name: 'Confirmar y restaurar' }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.goto(`${url}#/mantenimientos`);
      const pending = page.waitForEvent('download');
      await page
        .getByRole('button', { name: /^Descargar PDF/ })
        .first()
        .click();
      const pdf = await readFile(await (await pending).path());
      assert.match(pdf.toString('latin1'), /^%PDF-/);
      await page.goto(`${url}#/vehiculos/practica-v02`);
      await page.reload();
      await page.getByRole('link', { name: 'Registrar mantenimiento', exact: true }).click();
      await page.getByLabel(/Trabajos realizados/).fill('Mantenimiento estático con foto.');
      // El enrutador publicado usa hash: comprobar también enlaces y Atrás reales.
      for (const leave of [
        () =>
          page.getByRole('navigation').getByRole('link', { name: 'Clientes', exact: true }).click(),
        () => page.goBack(),
      ]) {
        const prompt = page.waitForEvent('dialog');
        const action = leave();
        const warning = await prompt;
        assert.equal(warning.type(), 'confirm');
        assert.match(warning.message(), /cambios sin guardar/);
        await warning.dismiss();
        await action;
        await page.waitForURL(/mantenimientos\/nuevo/);
        assert.match(page.url(), /mantenimientos\/nuevo/);
        assert.equal(
          await page.getByLabel(/Trabajos realizados/).inputValue(),
          'Mantenimiento estático con foto.',
        );
      }
      await page.getByLabel(/Importe total/).fill('45000');
      await page
        .getByLabel('Seleccionar fotos')
        .setInputFiles(resolve(root, 'tests/fixtures/foto-prueba.jpg'));
      await page.locator('.photo-previews img').waitFor();
      await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
      await page.waitForURL(/vehiculos\/practica-v02$/);
      await page.reload();
      await page.getByRole('tab', { name: 'Fotos', exact: true }).click();
      await page.getByRole('button', { name: /^Ver foto foto-prueba.jpg/ }).waitFor();
      await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
      await page.getByLabel('Tipo de documento').selectOption('Factura');
      await page
        .getByLabel('Archivo PDF o imagen', { exact: true })
        .setInputFiles(resolve(root, 'tests/fixtures/documento-prueba.pdf'));
      await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
      await page.getByRole('article', { name: 'documento-prueba.pdf', exact: true }).waitFor();
      await page
        .getByLabel('Archivo PDF o imagen', { exact: true })
        .setInputFiles(resolve(root, 'tests/fixtures/documento-imagen.png'));
      await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
      await page
        .getByRole('button', { name: 'Ver documento documento-imagen.png', exact: true })
        .click();
      await page.getByRole('dialog').getByRole('img').waitFor();
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar vista previa' }).click();
      await page.reload();
      await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
      const documentDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar documento documento-prueba.pdf' }).click();
      assert.deepEqual(
        await readFile(await (await documentDownload).path()),
        await readFile(resolve(root, 'tests/fixtures/documento-prueba.pdf')),
      );
      const imageDownload = page.waitForEvent('download');
      await page
        .getByRole('button', { name: 'Descargar documento documento-imagen.png', exact: true })
        .click();
      assert.deepEqual(
        await readFile(await (await imageDownload).path()),
        await readFile(resolve(root, 'tests/fixtures/documento-imagen.png')),
      );
      // El historial usa parámetros dentro del hash también en ambas publicaciones.
      await page.goto(`${url}#/mantenimientos`);
      await page.getByLabel('Buscar mantenimientos').fill('Mantenimiento estático con foto.');
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
      assert.equal(await page.locator('tbody tr').count(), 1);
      const serviceId = await page.locator('tbody tr').getAttribute('data-service-id');
      const reportDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
      const report = await readFile(await (await reportDownload).path(), 'utf8');
      assert.equal(report.split('\r\n').length, 2);
      assert.ok(report.startsWith('\uFEFF'));
      assert.match(report, /Mantenimiento estático con foto/);
      assert.ok(report.includes('"45000,00";"Activo"'));

      await page.getByRole('button', { name: /^Anular servicio/ }).click();
      await page.getByLabel('Motivo de anulación').fill('Prueba estática de anulación');
      await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByLabel('Estado del mantenimiento').selectOption('anulados');
      await page.locator(`tr[data-service-id="${serviceId}"]`).waitFor();
      await page.getByRole('button', { name: /^Recuperar servicio/ }).click();
      await page.getByLabel('Motivo de recuperación').fill('Prueba estática de recuperación');
      await page.getByRole('button', { name: 'Confirmar recuperación', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await page.getByLabel('Registros por página').selectOption('25');
      await page.locator(`tr[data-service-id="${serviceId}"]`).waitFor();
      assert.ok(!page.url().includes('estado='));
      assert.ok(!page.url().includes('buscar='));
      await page.goto(`${url}#/backups`);
      const archiveDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Descargar ZIP completo' }).click();
      const archive = await readFile(await (await archiveDownload).path());
      assert.equal(archive.subarray(0, 2).toString(), 'PK');
      const { unzipSync } = await import('fflate');
      const entries = unzipSync(archive);
      assert.equal(Object.keys(entries).filter((name) => name.startsWith('documents/')).length, 2);
      assert.equal(Object.keys(entries).filter((name) => name.startsWith('photos/')).length, 1);
      const backedUp = JSON.parse(new TextDecoder().decode(entries['backup.json']));
      assert.deepEqual(
        backedUp.data.services
          .find((service) => service.id === serviceId)
          .changes.map((entry) => entry.action),
        ['created', 'annulled', 'restored'],
      );
      await page.goto(`${url}#/proximos-servicios`);
      await page.getByLabel('Buscar próximos servicios').fill('Hilux');
      await page
        .getByRole('button', { name: /^Preparar aviso/ })
        .first()
        .click();
      const reminderDialog = page.getByRole('dialog', { name: 'Preparar aviso al cliente' });
      const reminderText = await reminderDialog.getByLabel('Texto del aviso').inputValue();
      assert.match(reminderText, /Toyota Hilux/);
      assert.match(reminderText, /lo que ocurra primero/);
      assert.match(reminderText, /Confirmá el kilometraje actual/);
      await reminderDialog.getByRole('button', { name: 'Cerrar diálogo' }).click();
      await page.goto(`${url}#/vehiculos?vista=tabla&buscar=Hilux`);
      await page.getByRole('heading', { name: 'Listado de vehículos', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0);
      const fleetDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
      const fleetCSV = await readFile(await (await fleetDownload).path(), 'utf8');
      assert.ok(fleetCSV.startsWith('\uFEFF'));
      assert.match(fleetCSV, /Hilux/);
      assert.match(fleetCSV, /Todos los vencimientos vigentes/);
      const ownerName = await page.locator('tbody tr').first().locator('td').nth(1).innerText();
      await page.getByRole('button', { name: 'Cliente de vehículos', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar cliente', exact: true }).fill(ownerName);
      await page.getByRole('option', { name: ownerName, exact: true }).click();
      assert.ok(
        (
          await page.getByRole('button', { name: 'Cliente de vehículos', exact: true }).innerText()
        ).includes(ownerName),
      );
      await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Tabla', exact: true }).getAttribute('aria-pressed'),
        'true',
      );
      assert.deepEqual(errors, [], `${name}: errores en el sitio servido sin Vite`);
      console.log(
        `${name}: rutas, persistencia, PDF, fotos, documentos locales y respaldo ZIP correctos.`,
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
