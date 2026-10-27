import { describe, it, expect } from 'vitest';
import { stockAlert, replenishmentProducts } from '../../src/lib/stockAlerts';
import { demoProducts, productSchema, saveProductData } from '../../src/lib/products';
import { emptyData, makeBackup, parseBackup } from '../../src/lib/localDatabase';
import { createPhotoBackup, parsePhotoBackup } from '../../src/lib/photoBackup';
import { WorkshopDatabase } from '../../server/database';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const original = demoProducts[0];
describe('mínimos opcionales y reposición', () => {
  it('compara milésimos, avisa al alcanzar el mínimo y excluye inactivos y productos sin configurar', () => {
    expect(stockAlert(original, 0)).toBeUndefined();
    const product = { ...original, minimumStock: 1.001 };
    expect(stockAlert(product, 1002)).toBeUndefined();
    expect(stockAlert(product, 1001)).toBe('Reponer');
    expect(stockAlert(product, 1000)).toBe('Reponer');
    expect(stockAlert(product, 0)).toBe('Sin existencias');
    expect(stockAlert({ ...product, active: false }, 0)).toBeUndefined();
    expect(stockAlert({ ...product, minimumStock: 0 }, 0)).toBe('Sin existencias');
    expect(stockAlert({ ...product, minimumStock: 0 }, 1)).toBeUndefined();
    expect(
      replenishmentProducts({
        products: [
          { ...product, id: 'low' },
          { ...product, id: 'empty', minimumStock: 0 },
          original,
          { ...product, id: 'inactive', active: false },
        ],
        stockMovements: [
          {
            id: 'open',
            productId: 'low',
            unit: product.unit,
            kind: 'opening',
            deltaMilli: 1001,
            at: '2026-10-27T12:00:00Z',
            reason: 'Prueba',
          },
        ],
      }).map((product) => product.id),
    ).toEqual(['low', 'empty']);
    for (const minimumStock of [0, 0.001, 1000000])
      expect(productSchema.safeParse({ ...original, minimumStock }).success).toBe(true);
    for (const minimumStock of [-1, 0.0001, 1000001, NaN, Infinity])
      expect(productSchema.safeParse({ ...original, minimumStock }).success).toBe(false);
  });
  it('guardar y retirar el mínimo conserva los movimientos y la compatibilidad con copias antiguas', () => {
    const data = {
      ...emptyData(),
      products: [original],
      stockMovements: [
        {
          id: 'opening',
          productId: original.id,
          unit: original.unit,
          deltaMilli: 5000,
          kind: 'opening' as const,
          at: '2026-10-27T12:00:00Z',
          reason: 'Saldo inicial',
        },
      ],
    };
    const updated = saveProductData(data, { ...original, minimumStock: 10.5 }, original);
    expect(updated.stockMovements).toEqual(data.stockMovements);
    expect(updated.services).toEqual(data.services);
    expect(parseBackup(JSON.stringify(makeBackup(updated))).data.products![0].minimumStock).toBe(
      10.5,
    );
    expect(parseBackup(JSON.stringify(makeBackup(data))).data.products![0]).not.toHaveProperty(
      'minimumStock',
    );
    const removed = saveProductData(updated, original, updated.products![0]);
    expect(removed.products![0]).not.toHaveProperty('minimumStock');
    expect(removed.stockMovements).toEqual(data.stockMovements);
  });
  it('JSON, ZIP y SQLite conservan los mínimos explícitos, incluso cero', async () => {
    const data = { ...emptyData(), products: [{ ...original, minimumStock: 0 }] };
    const blob = await createPhotoBackup(data, [], []);
    expect(
      (await parsePhotoBackup(new Uint8Array(await blob.arrayBuffer()))).backup.data.products![0]
        .minimumStock,
    ).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), 'calamante-minimum-'));
    let database: WorkshopDatabase | undefined;
    try {
      database = new WorkshopDatabase(join(dir, 'stock.sqlite'));
      await database.write({ data, uploads: [], restore: false }, 0);
      database.close();
      database = new WorkshopDatabase(join(dir, 'stock.sqlite'));
      expect(database.state().data.products![0].minimumStock).toBe(0);
    } finally {
      database?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
