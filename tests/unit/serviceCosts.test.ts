import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import {
  laborAmountSchema,
  laborSummary,
  suggestedServiceCents,
  serviceAdjustmentCents,
} from '../../src/lib/serviceCosts';
import { emptyData, makeBackup, newDatabase, parseBackup } from '../../src/lib/localDatabase';
import { maintenanceCSV, maintenanceSummary } from '../../src/lib/maintenanceReport';
import { recordServiceChange } from '../../src/lib/serviceHistory';
import { createServicePDF } from '../../src/lib/servicePDF';
import { createVehicleHistoryPDF } from '../../src/lib/vehicleHistoryPDF';
import { createPhotoBackup, parsePhotoBackup } from '../../src/lib/photoBackup';
import { WorkshopDatabase } from '../../server/database';
const original = initialServices[0];
const service = { ...original, laborAmount: 12345.67, amount: 95000.01 };
const data = {
  ...emptyData(),
  customers: initialCustomers,
  vehicles: initialVehicles,
  services: [service],
};

describe('mano de obra independiente del total final', () => {
  it('admite cero y centavos, rechaza importes inválidos y conserva los respaldos antiguos sin inventar un valor', () => {
    for (const amount of [0, 0.01, 12345.67, 999999999])
      expect(laborAmountSchema.safeParse(amount).success).toBe(true);
    for (const amount of [-1, 1.001, NaN, Infinity, 1000000000]) {
      expect(laborAmountSchema.safeParse(amount).success).toBe(false);
      expect(() =>
        newDatabase({ ...data, services: [{ ...service, laborAmount: amount }] }),
      ).toThrow();
    }
    expect(
      parseBackup(JSON.stringify(makeBackup({ ...data, services: [original] }))).data.services[0],
    ).not.toHaveProperty('laborAmount');
    expect(
      parseBackup(
        JSON.stringify(makeBackup({ ...data, services: [{ ...service, laborAmount: 0 }] })),
      ).data.services[0].laborAmount,
    ).toBe(0);
  });
  it('sugiere la suma con el redondeo de cada repuesto y mantiene totales finales con descuentos sin duplicar mano de obra', () => {
    expect(
      suggestedServiceCents(
        [
          {
            id: 'x',
            code: '',
            description: 'Insumo',
            unit: 'Litro',
            quantity: 3.333,
            unitPrice: 0.1,
          },
        ],
        0.2,
      ),
    ).toBe(53);
    expect(
      laborSummary([
        { ...service, laborAmount: 0.1 },
        { ...service, laborAmount: 0.2 },
        { ...service, laborAmount: 0 },
        original,
        { ...service, annulment: { at: '2026-10-27T12:00:00Z', reason: 'Prueba' } },
      ]),
    ).toEqual({ known: 3, total: 0.3 });
    expect(maintenanceSummary([service]).total).toBe(95000.01);
    expect(serviceAdjustmentCents({ ...service, supplyItems: [], suppliesLegacy: '' })).toBe(
      8265434,
    );
    expect(
      serviceAdjustmentCents({ ...service, supplyItems: [], suppliesLegacy: 'Insumos anteriores' }),
    ).toBeUndefined();
    expect(serviceAdjustmentCents(service)).toBeUndefined();
    const csv = maintenanceCSV([service, original], initialVehicles, initialCustomers);
    expect(csv).toContain('"Mano de obra ARS"');
    expect(csv).toContain('"12345,67"');
    expect(csv).toContain('"95000,01";"Activo"');
    expect(csv.split('\r\n')[2]).toMatch(/;""$/);
  });
  it('registra altas, correcciones y retiro del desglose en el historial privado', () => {
    const added = recordServiceChange(original, service, 'edited');
    expect(added.changes!.at(-1)!.changes).toContainEqual({
      field: 'Mano de obra',
      before: 'Sin dato',
      after: '12345.67',
    });
    const changed = recordServiceChange(service, { ...service, laborAmount: 0 }, 'edited');
    expect(changed.changes!.at(-1)!.changes).toContainEqual({
      field: 'Mano de obra',
      before: '12345.67',
      after: '0',
    });
    expect(
      recordServiceChange(service, original, 'edited').changes!.at(-1)!.changes,
    ).toContainEqual({ field: 'Mano de obra', before: '12345.67', after: 'Sin dato' });
  });
  it('conserva el campo en JSON, ZIP y SQLite al cerrar y volver a abrir', async () => {
    expect(parseBackup(JSON.stringify(makeBackup(data))).data.services[0].laborAmount).toBe(
      12345.67,
    );
    const zip = await createPhotoBackup(data, [], []);
    expect(
      (await parsePhotoBackup(new Uint8Array(await zip.arrayBuffer()))).backup.data.services[0]
        .laborAmount,
    ).toBe(12345.67);
    const dir = mkdtempSync(join(tmpdir(), 'calamante-labor-'));
    let database: WorkshopDatabase | undefined;
    try {
      database = new WorkshopDatabase(join(dir, 'test.sqlite'));
      await database.write({ data, uploads: [], restore: false }, 0);
      database.close();
      database = new WorkshopDatabase(join(dir, 'test.sqlite'));
      expect(database.state().data.services[0].laborAmount).toBe(12345.67);
    } finally {
      database?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('incluye el desglose en los PDF permitidos y lo oculta en un historial sin importes', async () => {
    const base = {
      service,
      vehicle: initialVehicles[1],
      customer: initialCustomers[1],
      workshop: emptyData().workshop,
      demo: false,
    };
    const receipt = Buffer.from((await createServicePDF(base)).bytes).toString('latin1');
    expect(receipt).toContain('Mano de obra incluida: ARS 12.345,67');
    expect(receipt).toContain('ARS 95.000,01');
    const history = {
      ...base,
      services: [service],
      today: '2026-10-27',
      includeAmounts: true,
      includePlans: false,
    };
    expect(
      Buffer.from((await createVehicleHistoryPDF(history)).bytes).toString('latin1'),
    ).toContain('Mano de obra incluida: ARS 12.345,67');
    const privateAmounts = Buffer.from(
      (await createVehicleHistoryPDF({ ...history, includeAmounts: false })).bytes,
    ).toString('latin1');
    expect(privateAmounts).not.toContain('12.345,67');
    expect(privateAmounts).not.toContain('Mano de obra');
  });
});
