import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import fixture from '../../src/data/taller-calamante-practica-stock.json';
import { parseBackup, newDatabase } from '../../src/lib/localDatabase';
import { inventoryIssue, stockBalance } from '../../src/lib/inventory';
import { parsePhotoBackup } from '../../src/lib/photoBackup';
import { planStatus } from '../../src/lib/maintenancePlans';
describe('base ficticia con catálogo y stock', () => {
  it('valida registros, planes independientes y saldos, e incluye casos actuales de práctica', () => {
    const backup = parseBackup(JSON.stringify(fixture));
    const data = backup.data;
    expect(newDatabase(data).data).toEqual(data);
    expect([
      data.customers.length,
      data.vehicles.length,
      data.services.length,
      data.products!.length,
      data.stockMovements!.length,
    ]).toEqual([12, 16, 48, 24, 128]);
    expect(inventoryIssue(data)).toBeUndefined();
    expect(data.services.filter((service) => service.annulment)).toHaveLength(1);
    expect(
      data.services.some((service) =>
        service.changes?.some((change) => change.action === 'edited'),
      ),
    ).toBe(true);
    expect(data.services.some((service) => !service.stockManaged)).toBe(true);
    expect(
      data.services.some((service) => service.supplyItems?.some((item) => !item.productId)),
    ).toBe(true);
    const zero = data.products!.find((product) => product.code === 'REP-099')!;
    const low = data.products!.find((product) => product.code === 'HAB-001')!;
    expect(stockBalance(data, zero.id)).toBe(0);
    expect(stockBalance(data, low.id)).toBe(2000);
    expect(data.products!.some((product) => !product.active)).toBe(true);
    const states = new Set(
      data.vehicles.flatMap((vehicle) =>
        (vehicle.maintenancePlans ?? []).map((plan) => planStatus(plan, vehicle.km, '2026-10-27')),
      ),
    );
    expect(states).toEqual(new Set(['Al día', 'Próximo', 'Vencido']));
    expect(
      data.customers.every(
        (customer) =>
          customer.email.endsWith('@example.com') && customer.document.startsWith('FICT-'),
      ),
    ).toBe(true);
  });
  it('el ZIP descargable es importable y contiene exactamente los mismos datos sin adjuntos externos', async () => {
    const bytes = new Uint8Array(
      await readFile(
        new URL('../../examples/taller-calamante-practica-stock.zip', import.meta.url),
      ),
    );
    const candidate = await parsePhotoBackup(bytes);
    expect(candidate.backup).toEqual(parseBackup(JSON.stringify(fixture)));
    expect(candidate.photos).toEqual([]);
    expect(candidate.documents).toEqual([]);
  });
});
