import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect as baseExpect } from '@playwright/test';
import { existsSync } from 'node:fs';
const expect = baseExpect.configure({ timeout: 15000 });
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'calamante-pc-check-'));
const port = 4329;
const url = `http://127.0.0.1:${port}`;
let processHandle;
async function start() {
  processHandle = spawn(process.execPath, [join(root, 'dist-server/main.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      TALLER_DATA_DIR: directory,
      TALLER_PORT: String(port),
      TALLER_WEB_DIR: join(root, 'dist'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  processHandle.stderr.on('data', (chunk) => {
    output += chunk;
  });
  for (let i = 0; i < 100; i++) {
    if (processHandle.exitCode !== null) throw new Error(output || 'El servidor no inició.');
    try {
      const response = await fetch(url + '/api/config');
      if (response.ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('El servidor no respondió. ' + output);
}
async function stop() {
  if (!processHandle || processHandle.exitCode !== null) return;
  const child = processHandle;
  const ended = new Promise((done) => child.once('exit', done));
  child.kill('SIGTERM');
  await ended;
}
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    (!process.env.CI && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
});
const contexts = [];
const password = 'Taller-Calamante-2026-test';
const key = 'motortrack-local-database-v1';
async function data(page) {
  return (await (await page.request.get(url + '/api/state')).json()).data;
}
async function login(page, address = url) {
  page.on('response', (response) => {
    if (response.status() >= 400)
      console.log('Respuesta de prueba:', response.status(), response.url());
  });
  await page.goto(address);
  try {
    await page.getByLabel('Contraseña', { exact: true }).waitFor({ timeout: 10000 });
  } catch (error) {
    console.log('Pantalla de acceso:', await page.locator('body').innerText());
    throw error;
  }
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}
try {
  await start();
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Configurar acceso privado' })).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByLabel('Repetir contraseña').fill(password);
  await page.getByRole('button', { name: 'Crear acceso al taller' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.goto(url + '/#/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Nombre y apellido')
    .fill('Cliente compartido del taller');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cliente', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal((await data(page)).customers[0].name, 'Cliente compartido del taller');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  contexts.push(mobileContext);
  const mobile = await mobileContext.newPage();
  await login(mobile);
  await mobile.goto(url + '/#/clientes');
  await expect(mobile.locator('tbody')).toContainText('Cliente compartido del taller');
  await page.goto(url + '/#/vehiculos');
  await page.getByRole('button', { name: 'Nuevo vehículo', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Patente').fill('PC 123 AB');
  await dialog.getByLabel(/^Marca/).fill('Toyota');
  await dialog.getByLabel(/^Modelo/).fill('Hilux');
  await dialog.getByLabel('Kilometraje registrado').fill('1000');
  await dialog.getByRole('button', { name: 'Guardar vehículo', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  let snapshot = await data(page);
  const vehicle = snapshot.vehicles[0];
  await page.goto(url + `/#/mantenimientos/nuevo?vehiculo=${vehicle.id}`);
  await page.getByLabel('Detalle del Servicio').fill('Service compartido desde la PC del taller.');
  await page.getByLabel('Importe total').fill('35000');
  await page
    .getByLabel('Seleccionar fotos')
    .setInputFiles(resolve(root, 'tests/fixtures/foto-prueba.jpg'));
  await page.locator('.photo-previews img').waitFor();
  await page.getByRole('button', { name: 'Guardar mantenimiento', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`vehiculos/${vehicle.id}$`));
  await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
  await page
    .getByLabel('Archivo PDF o imagen', { exact: true })
    .setInputFiles(resolve(root, 'tests/fixtures/documento-imagen.png'));
  await page.getByRole('button', { name: 'Guardar documento', exact: true }).click();
  await page
    .getByRole('button', { name: 'Ver documento documento-imagen.png', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar vista previa' }).click();
  snapshot = await data(page);
  assert.equal(snapshot.photos.length, 1);
  assert.equal(snapshot.documents.length, 1);
  await mobile.goto(url + `/#/vehiculos/${vehicle.id}`);
  await expect(mobile.locator('tbody')).toContainText('Service compartido desde la PC');
  await mobile.getByRole('tab', { name: 'Documentación', exact: true }).click();
  const file = mobile.waitForEvent('download');
  await mobile
    .getByRole('button', { name: 'Descargar documento documento-imagen.png', exact: true })
    .click();
  assert.deepEqual(
    await readFile(await (await file).path()),
    await readFile(resolve(root, 'tests/fixtures/documento-imagen.png')),
  );
  await page.goto(url + '/#/clientes');
  await mobile.goto(url + '/#/clientes');
  for (const current of [page, mobile])
    await current
      .getByRole('button', { name: 'Editar Cliente compartido del taller', exact: true })
      .click();
  await page.getByRole('dialog').getByLabel('Nombre y apellido').fill('Cliente corregido en PC');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cliente', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await mobile
    .getByRole('dialog')
    .getByLabel('Nombre y apellido')
    .fill('Cambio antiguo del celular');
  await mobile
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cliente', exact: true })
    .click();
  await expect(mobile.getByRole('alert')).toContainText('Los datos cambiaron');
  await mobile.getByRole('button', { name: 'Actualizar y continuar', exact: true }).click();
  await expect(mobile.locator('tbody')).toContainText('Cliente corregido en PC');
  assert.equal((await data(page)).customers[0].name, 'Cliente corregido en PC');
  await page.goto(url + '/#/backups');
  await page.getByRole('button', { name: 'Habilitar acceso desde celulares', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Deshabilitar acceso desde celulares' }),
  ).toBeVisible();
  const address = Object.values(networkInterfaces())
    .flatMap((rows) => rows ?? [])
    .find((row) => !row.internal && row.family === 'IPv4')?.address;
  if (address) {
    const lanContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    contexts.push(lanContext);
    // El proxy de este entorno bloquea IP privadas. Se conserva el origen HTTP del
    // celular y se transportan las peticiones al servidor real por loopback.
    await lanContext.route(`http://${address}:${port}/**`, async (route) => {
      const request = route.request();
      const target = new URL(request.url());
      const headers = await request.allHeaders();
      headers.host = target.host;
      await new Promise((done, reject) => {
        const outgoing = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            path: target.pathname + target.search,
            method: request.method(),
            headers,
          },
          (incoming) => {
            const chunks = [];
            incoming.on('data', (chunk) => chunks.push(chunk));
            incoming.on('end', () => {
              const responseHeaders = Object.fromEntries(
                Object.entries(incoming.headers)
                  .filter(
                    ([name, value]) =>
                      value !== undefined &&
                      !['transfer-encoding', 'connection', 'content-length'].includes(name),
                  )
                  .map(([name, value]) => [
                    name,
                    Array.isArray(value) ? value.join(', ') : String(value),
                  ]),
              );
              route
                .fulfill({
                  status: incoming.statusCode,
                  headers: responseHeaders,
                  body: Buffer.concat(chunks),
                })
                .then(done, reject);
            });
          },
        );
        outgoing.on('error', reject);
        outgoing.end(request.postDataBuffer());
      });
    });
    const lan = await lanContext.newPage();
    await login(lan, `http://${address}:${port}`);
    assert.equal(await lan.evaluate(() => window.isSecureContext), false);
    await lan.goto(`http://${address}:${port}/#/clientes`);
    await lan.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
    await lan
      .getByRole('dialog')
      .getByLabel('Nombre y apellido')
      .fill('Cliente creado desde Wi-Fi');
    await lan
      .getByRole('dialog')
      .getByRole('button', { name: 'Guardar cliente', exact: true })
      .click();
    await expect(lan.getByRole('dialog')).toHaveCount(0);
    await lan.goto(`http://${address}:${port}/#/vehiculos/${vehicle.id}`);
    await lan.getByRole('tab', { name: 'Documentación', exact: true }).click();
    await lan
      .getByLabel('Archivo PDF o imagen', { exact: true })
      .setInputFiles(resolve(root, 'tests/fixtures/documento-imagen.webp'));
    await lan.getByRole('button', { name: 'Guardar documento', exact: true }).click();
    await expect(
      lan.getByRole('article', { name: 'documento-imagen.webp', exact: true }),
    ).toBeVisible();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Crear copia en la PC ahora', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await readdir(join(directory, 'backups'))).filter((name) => name.endsWith('.zip')).length,
    )
    .toBeGreaterThan(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar ZIP completo', exact: true }).click();
  const zip = await readFile(await (await pending).path());
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
  await page
    .getByLabel('Seleccionar respaldo JSON o ZIP')
    .setInputFiles({ name: 'migracion.zip', mimeType: 'application/zip', buffer: zip });
  await page.getByRole('button', { name: 'Revisar y restaurar' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar y restaurar' }).click();
  await expect(dialog).toHaveCount(0);
  const before = await data(page);
  await stop();
  await start();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Backups y recuperación', exact: true }),
  ).toBeVisible();
  assert.deepEqual(await data(page), before);
  // El servidor guarda pero la respuesta no llega: se bloquea la edición y se revisa al reconectar.
  await page.goto(url + '/#/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Nombre y apellido').fill('Respuesta interrumpida');
  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'PUT') {
      const result = await route.fetch();
      assert.equal(result.status(), 200);
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Guardar cliente', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Se perdió la conexión');
  await page.unroute('**/api/state');
  await page.getByRole('button', { name: 'Actualizar y continuar', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('Respuesta interrumpida');
  assert.equal(
    (await data(page)).customers.filter((customer) => customer.name === 'Respuesta interrumpida')
      .length,
    1,
  );
  await page.getByRole('button', { name: 'Explorar demo', exact: true }).click();
  await page.goto(url + '/#/backups');
  await expect(
    page.getByRole('button', { name: 'Crear copia en la PC ahora', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Volver a mis datos', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ingresar', exact: true })).toBeVisible();
  assert.equal((await page.request.get(url + '/api/state')).status(), 401);
  assert.deepEqual(errors, []);
  console.log(
    'PC SQLite: acceso privado, datos compartidos, origen HTTP sin WebCrypto nativo, fotos, documentos, migración ZIP, conflictos, copias y reinicio correctos.',
  );
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await stop();
  await rm(directory, { recursive: true, force: true });
}
