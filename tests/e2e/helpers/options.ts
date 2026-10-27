import type { Page } from '@playwright/test';
// Los recorridos existentes de filtros avanzados abren expresamente su sección.
export async function showMoreOptions(page: Page) {
  const url = new URL(page.url());
  const path = (url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname).split('?')[0];
  if (!['/clientes', '/vehiculos', '/mantenimientos', '/proximos-servicios'].includes(path)) return;
  const details = page.locator('details.more-options');
  await details.waitFor({ state: 'visible' });
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator(':scope > summary').click();
}
