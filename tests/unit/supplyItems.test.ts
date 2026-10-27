import { describe, expect, it } from 'vitest';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { dataSchema, emptyData, makeBackup, parseBackup } from '../../src/lib/localDatabase';
import { blankSupplies, saveEntrySupplies } from '../../src/lib/maintenanceEntry';
import {
  itemCents,
  totalItemCents,
  supplyItemsSchema,
  supplyItemsSummary,
  legacySupplyText,
  saveSupplyItems,
  serviceSuppliesText,
  type SupplyItem,
} from '../../src/lib/supplyItems';
const oil: SupplyItem = {
  id: 'oil',
  code: 'ACE-001',
  description: 'Shell Helix HX8 5W-30',
  quantity: 4.5,
  unit: 'Litro',
  unitPrice: 10000,
};
const filter: SupplyItem = {
  id: 'filter',
  code: 'FIL-025',
  description: 'Filtro MANN W712/95',
  quantity: 1,
  unit: 'Unidad',
  unitPrice: 12000,
};
describe('artículos del mantenimiento', () => {
  it('calcula cantidades fraccionadas y suma subtotales redondeados en centavos', () => {
    expect(itemCents(oil)).toBe(4500000);
    expect(totalItemCents([oil, filter])).toBe(5700000);
    expect(itemCents({ ...oil, quantity: 1.005, unitPrice: 1 })).toBe(101);
    expect(
      totalItemCents([
        { ...oil, quantity: 0.001, unitPrice: 5 },
        { ...filter, quantity: 0.001, unitPrice: 5 },
      ]),
    ).toBe(2);
    expect(itemCents({ ...oil, quantity: 10000, unitPrice: 9999999.99 })).toBe(9999999990000);
    expect(totalItemCents([])).toBe(0);
  });
  it('permite precio cero explícito y rechaza datos incompletos, negativos, excesivos o de precisión no admitida', () => {
    expect(supplyItemsSchema.safeParse([{ ...oil, unitPrice: 0 }]).success).toBe(true);
    for (const changes of [
      { description: '   ' },
      { quantity: 0 },
      { quantity: 0.000000001 },
      { quantity: -1 },
      { quantity: 1.0001 },
      { quantity: 10001 },
      { unitPrice: -1 },
      { unitPrice: 1.001 },
      { unitPrice: NaN },
      { unit: 'desconocida' },
    ]) {
      expect(supplyItemsSchema.safeParse([{ ...oil, ...changes }]).success).toBe(false);
    }
    expect(supplyItemsSchema.safeParse([oil, oil]).success).toBe(false);
    expect(
      supplyItemsSchema.safeParse(Array.from({ length: 31 }, (_, i) => ({ ...oil, id: String(i) })))
        .success,
    ).toBe(false);
  });
  it('conserva textos y campos anteriores al corregir otros datos, sin inventar artículos ni precios', () => {
    for (const original of [
      initialServices[0],
      {
        ...initialServices[0],
        ...saveEntrySupplies({ ...blankSupplies(), oil: 'Shell', viscosity: '5W-30' }),
      },
    ]) {
      const before = structuredClone(original);
      const saved = saveSupplyItems([], legacySupplyText(original), original);
      expect(saved.supplies).toBe(original.supplies);
      expect('suppliesDetail' in saved ? saved.suppliesDetail : undefined).toEqual(
        original.suppliesDetail,
      );
      expect(saved).not.toHaveProperty('supplyItems');
      expect(original).toEqual(before);
    }
  });
  it('separa detalle anterior sin valorizar y conserva cantidades y precios al reabrir y respaldar', () => {
    const original = initialServices[0];
    const items = [oil, filter];
    const before = structuredClone(items);
    const service = { ...original, ...saveSupplyItems(items, 'Repuesto anterior sin precio') };
    expect(service.supplies).toContain('Total de insumos y repuestos:');
    expect(service.supplies).toContain('57.000,00');
    expect(service.supplies).toContain(
      'Detalle anterior de insumos (sin valorizar): Repuesto anterior sin precio',
    );
    const data = {
      ...emptyData(),
      customers: initialCustomers,
      vehicles: initialVehicles,
      services: [service],
    };
    expect(parseBackup(JSON.stringify(makeBackup(data))).data.services[0]).toEqual(service);
    expect(legacySupplyText(service)).toBe('Repuesto anterior sin precio');
    service.supplyItems![0].description = 'Corregido';
    expect(items).toEqual(before);
  });
  it('rechaza metadatos cruzados, texto desactualizado y detalle huérfano al guardar o restaurar', () => {
    const service = { ...initialServices[0], ...saveSupplyItems([oil], '') };
    const data = {
      ...emptyData(),
      customers: initialCustomers,
      vehicles: initialVehicles,
      services: [service],
    };
    expect(dataSchema.safeParse(data).success).toBe(true);
    for (const bad of [
      { ...service, supplies: 'Texto distinto' },
      { ...service, suppliesDetail: blankSupplies() },
      { ...initialServices[0], suppliesLegacy: 'detalle huérfano' },
    ]) {
      expect(dataSchema.safeParse({ ...data, services: [bad] }).success).toBe(false);
    }
  });
  it('oculta precios y total cuando se pide un historial sin importes, y admite listas vacías', () => {
    const service = { ...initialServices[0], ...saveSupplyItems([oil, filter], '') };
    const text = serviceSuppliesText(service, false);
    expect(text).toContain('4,5 Litro');
    expect(text).toContain('Shell Helix HX8 5W-30');
    expect(text).not.toContain('10.000');
    expect(text).not.toContain('Total');
    expect(text).not.toContain('$');
    expect(supplyItemsSummary([])).toBe('Sin insumos registrados');
    expect(saveSupplyItems([], 'Texto anterior').supplies).toBe('Texto anterior');
  });
});
