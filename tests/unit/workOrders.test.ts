import { describe, it, expect } from 'vitest';
import { initialCustomers, initialVehicles, type Service } from '../../src/lib/demo';
import { demoProducts, productServiceItem } from '../../src/lib/products';
import {
  emptyData,
  newDatabase,
  makeBackup,
  parseBackup,
  localToday,
  type LocalData,
} from '../../src/lib/localDatabase';
import { changeWorkOrder } from '../../src/lib/workOrders';
import { saveSupplyItems } from '../../src/lib/supplyItems';
import { stockBalance } from '../../src/lib/inventory';
import { servicePlan } from '../../src/lib/maintenancePlans';
import { changeServiceStatus } from '../../src/lib/serviceHistory';
import { editServiceData } from '../../src/lib/serviceEditing';
import { createQuotePDF } from '../../src/lib/quotePDF';
import { createPhotoBackup, parsePhotoBackup } from '../../src/lib/photoBackup';
import { WorkshopDatabase } from '../../server/database';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const today = '2026-10-27';
function base(): LocalData {
  return {
    ...emptyData(),
    customers: initialCustomers.map((c) => ({ ...c, notes: 'PRIVADO-CLIENTE' })),
    vehicles: [
      {
        ...initialVehicles[1],
        km: 1000,
        manualKm: 1000,
        maintenancePlans: [
          {
            category: 'frenos',
            label: 'Frenos',
            recommendation: 'Revisar frenos',
            nextDate: '2027-01-01',
            nextKm: 30000,
            manual: true,
          },
        ],
      },
    ],
    products: demoProducts,
    stockMovements: [
      {
        id: 'opening',
        productId: demoProducts[0].id,
        unit: 'Litro',
        kind: 'opening',
        at: today + 'T12:00:00Z',
        deltaMilli: 10000,
        reason: 'Saldo inicial',
      },
    ],
  };
}
function service(): Service {
  return {
    id: 'work-1',
    vehicleId: 'v2',
    date: today,
    km: 1000,
    type: 'Cambio de aceite',
    work: 'Cambio de aceite presupuestado.',
    ...saveSupplyItems([{ ...productServiceItem(demoProducts[0], 'item'), quantity: 4.5 }], ''),
    amount: 73000,
    laborAmount: 28000,
    notes: 'PRIVADO-SERVICIO',
    public: false,
  };
}
const pending = (data: LocalData) => data.jobs![0];
describe('presupuestos y trabajos antes del historial', () => {
  it('presupuestar, confirmar y cancelar no modifica odómetro, planes, stock ni servicios realizados', () => {
    const data = base();
    const before = structuredClone(data);
    const quote = changeWorkOrder(data, undefined, service(), 'presupuesto', today, true).data;
    expect(data).toEqual(before);
    expect(quote.vehicles).toEqual(data.vehicles);
    expect(quote.stockMovements).toEqual(data.stockMovements);
    expect(quote.services).toHaveLength(0);
    const accepted = changeWorkOrder(
      quote,
      pending(quote),
      pending(quote),
      'en-trabajo',
      today,
    ).data;
    expect(accepted.jobs![0].stage).toBe('en-trabajo');
    expect(() =>
      changeWorkOrder(accepted, pending(accepted), pending(accepted), 'cancelado', today),
    ).toThrow('motivo');
    const cancelled = changeWorkOrder(
      accepted,
      pending(accepted),
      pending(accepted),
      'cancelado',
      today,
      false,
      'Cliente no acepta',
    ).data;
    expect(cancelled.services).toHaveLength(0);
    expect(cancelled.vehicles).toEqual(data.vehicles);
    expect(cancelled.stockMovements).toEqual(data.stockMovements);
    expect(cancelled.jobs![0].quotes).toEqual(quote.jobs![0].quotes);
    expect(cancelled.jobs![0].workHistory!.at(-1)).toMatchObject({
      from: 'en-trabajo',
      to: 'cancelado',
      reason: 'Cliente no acepta',
    });
    expect(newDatabase(cancelled).data.jobs![0].stage).toBe('cancelado');
  });
  it('conserva cada versión emitida aunque cambien precios, cliente y datos actuales; no incluye notas privadas', async () => {
    const draft = service();
    const issued = changeWorkOrder(base(), undefined, draft, 'presupuesto', today, true).saved
      .quotes![0];
    draft.supplyItems![0].quantity = 1;
    expect(issued.service.supplyItems![0].quantity).toBe(4.5);
    let data = changeWorkOrder(base(), undefined, service(), 'presupuesto', today, true).data;
    const first = structuredClone(pending(data).quotes![0]);
    const original = pending(data);
    data = {
      ...data,
      customers: data.customers.map((c) => ({ ...c, name: 'Nombre actualizado' })),
      products: data.products!.map((p) => ({ ...p, unitPrice: 20000 })),
    };
    const edited = { ...original, amount: 80000, work: 'Trabajo corregido para nueva versión.' };
    data = changeWorkOrder(data, original, edited, 'presupuesto', today, true).data;
    expect(pending(data).quotes![0]).toEqual(first);
    expect(pending(data).quotes![1].version).toBe(2);
    expect(pending(data).quotes![1].service.amount).toBe(80000);
    expect(localToday(new Date('2026-10-28T01:00:00Z'))).toBe('2026-10-27');
    expect(first.customer.notes).toBe('');
    expect(first.service.notes).toBe('');
    const pdf = Buffer.from((await createQuotePDF(first)).bytes).toString('latin1');
    expect(pdf).toContain('Presupuesto');
    expect(pdf).toContain('73.000,00');
    expect(pdf).not.toContain('Nombre actualizado');
    expect(pdf).not.toContain('PRIVADO');
    expect(pdf).not.toContain('Comprobante de mantenimiento');
    expect(pdf).not.toContain('Próximo mantenimiento');
  });
  it('completar mueve el mismo trabajo al historial y consume exactamente una vez; anular devuelve y recuperar consume', () => {
    const data = base();
    const quoted = changeWorkOrder(data, undefined, service(), 'presupuesto', today, true).data;
    const original = pending(quoted);
    const finished = { ...original, km: 1500 };
    finished.maintenance = servicePlan(finished, {
      date: '2027-04-27',
      km: 11500,
      recommendation: 'Renovar aceite',
    });
    const result = changeWorkOrder(quoted, original, finished, 'completado', today).data;
    expect(result.jobs).toHaveLength(0);
    expect(result.services).toHaveLength(1);
    expect(result.services[0].id).toBe(original.id);
    expect(result.services[0].quotes).toEqual(original.quotes);
    expect(result.vehicles[0].km).toBe(1500);
    expect(result.vehicles[0].maintenancePlans!.find((p) => p.category === 'frenos')).toEqual(
      data.vehicles[0].maintenancePlans![0],
    );
    expect(stockBalance(result, 'demo-oil')).toBe(5500);
    newDatabase(result);
    expect(() => changeWorkOrder(result, original, finished, 'completado', today)).toThrow(
      'cambió',
    );
    const edited = editServiceData(
      result,
      result.services[0],
      { ...result.services[0], amount: 70000 },
      today,
    );
    expect(stockBalance(edited, 'demo-oil')).toBe(5500);
    expect(() =>
      editServiceData(result, result.services[0], { ...result.services[0], quotes: [] }, today),
    ).toThrow('versiones');
    const cancelled = changeServiceStatus(edited, edited.services[0], 'Carga duplicada', today);
    expect(stockBalance(cancelled, 'demo-oil')).toBe(10000);
    const restored = changeServiceStatus(
      cancelled,
      cancelled.services[0],
      'Trabajo verificado',
      today,
    );
    expect(stockBalance(restored, 'demo-oil')).toBe(5500);
    expect(restored.services[0].quotes).toEqual(original.quotes);
  });
  it('completar sin próximo vencimiento no convierte kilómetros derivados en lecturas manuales', () => {
    const data = base();
    delete data.vehicles[0].manualKm;
    data.services = [{ ...service(), id: 'previous', date: '2026-10-10' }];
    const completed = changeWorkOrder(
      data,
      undefined,
      { ...service(), km: 1500 },
      'completado',
      today,
    ).data;
    expect(completed.vehicles[0].manualKm).toBe(0);
    const cancelled = changeServiceStatus(
      completed,
      completed.services[0],
      'Corrección de registro',
      today,
    );
    const allCancelled = changeServiceStatus(
      cancelled,
      cancelled.services.find((s) => s.id === 'previous')!,
      'Corrección de registro',
      today,
    );
    expect(allCancelled.vehicles[0].km).toBe(0);
  });
  it('permite cotizar sin existencias pero impide completar con faltantes o kilómetros incoherentes sin perder el presupuesto', () => {
    const items = [{ ...productServiceItem(demoProducts[0], 'item'), quantity: 20 }];
    const quote = changeWorkOrder(
      base(),
      undefined,
      { ...service(), ...saveSupplyItems(items, '') },
      'presupuesto',
      today,
      true,
    ).data;
    const before = structuredClone(quote);
    expect(() =>
      changeWorkOrder(quote, pending(quote), pending(quote), 'completado', today),
    ).toThrow();
    expect(quote).toEqual(before);
    const standard = changeWorkOrder(base(), undefined, service(), 'en-trabajo', today).data;
    expect(() =>
      changeWorkOrder(
        standard,
        pending(standard),
        { ...pending(standard), km: 999 },
        'completado',
        today,
      ),
    ).toThrow('kilometraje');
    expect(() =>
      changeWorkOrder(
        standard,
        pending(standard),
        { ...pending(standard), date: '2026-10-28' },
        'completado',
        today,
      ),
    ).toThrow('fecha');
    expect(() =>
      changeWorkOrder(
        standard,
        { ...pending(standard), amount: 1 },
        pending(standard),
        'presupuesto',
        today,
      ),
    ).toThrow('cambió');
  });
  it('JSON, ZIP y SQLite conservan pendientes y versiones; los respaldos anteriores continúan válidos', async () => {
    const data = changeWorkOrder(base(), undefined, service(), 'presupuesto', today, true).data;
    expect(parseBackup(JSON.stringify(makeBackup(data))).data.jobs).toEqual(data.jobs);
    const zip = await createPhotoBackup(data, [], []);
    expect(
      (await parsePhotoBackup(new Uint8Array(await zip.arrayBuffer()))).backup.data.jobs,
    ).toEqual(data.jobs);
    expect(parseBackup(JSON.stringify(makeBackup(base()))).data.jobs).toBeUndefined();
    const dir = mkdtempSync(join(tmpdir(), 'calamante-jobs-'));
    let database: WorkshopDatabase | undefined;
    try {
      database = new WorkshopDatabase(join(dir, 'jobs.sqlite'));
      await database.write({ data, uploads: [], restore: false }, 0);
      database.close();
      database = new WorkshopDatabase(join(dir, 'jobs.sqlite'));
      expect(database.state().data.jobs).toEqual(data.jobs);
    } finally {
      database?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('rechaza referencias duplicadas, estados falsos y versiones con notas privadas', () => {
    const data = changeWorkOrder(base(), undefined, service(), 'presupuesto', today, true).data;
    expect(() => newDatabase({ ...data, jobs: [...data.jobs!, pending(data)] })).toThrow();
    expect(() => newDatabase({ ...data, services: [service()] })).toThrow();
    const corrupted = structuredClone(data);
    Object.assign(corrupted.jobs![0].quotes![0].service, { notes: 'PRIVADO' });
    expect(() => newDatabase(corrupted)).toThrow();
    expect(() =>
      changeWorkOrder(data, pending(data), pending(data), 'cancelado', today, true, 'Cancelado'),
    ).toThrow('Solo');
  });
});
