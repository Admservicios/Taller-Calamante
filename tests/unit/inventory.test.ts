import { describe, expect, it } from 'vitest';
import {
  addStockMovement,
  applyServiceStock,
  stockBalance,
  stockVersion,
  inventoryIssue,
  type StockMovement,
} from '../../src/lib/inventory';
import { demoProducts, productServiceItem, saveProductData } from '../../src/lib/products';
import {
  initialCustomers,
  initialVehicles,
  initialServices,
  type Service,
} from '../../src/lib/demo';
import {
  dataSchema,
  emptyData,
  makeBackup,
  parseBackup,
  type LocalData,
} from '../../src/lib/localDatabase';
import { saveSupplyItems } from '../../src/lib/supplyItems';
import { editServiceData } from '../../src/lib/serviceEditing';
import { changeServiceStatus } from '../../src/lib/serviceHistory';
const product = demoProducts[0];
const opening = (deltaMilli = 10000): StockMovement => ({
  id: 'initial',
  productId: product.id,
  unit: product.unit,
  kind: 'opening',
  deltaMilli,
  at: '2026-10-27T12:00:00Z',
  reason: 'Inventario inicial ficticio',
});
const seed = (): LocalData => ({
  ...emptyData(),
  products: structuredClone(demoProducts),
  customers: initialCustomers,
  vehicles: initialVehicles,
  services: [],
});
const visit = (quantity = 4.5): Service => ({
  ...initialServices[0],
  id: 'inventory-service',
  stockManaged: true,
  ...saveSupplyItems([{ ...productServiceItem(product, 'item'), quantity }], ''),
});
const create = (before: LocalData, service = visit()) =>
  applyServiceStock(before, { ...before, services: [...before.services, service] }, service);
const replaceQuantity = (service: Service, quantity: number): Service => ({
  ...service,
  ...saveSupplyItems([{ ...service.supplyItems![0], quantity }], ''),
});
describe('inventario por movimientos', () => {
  it('ingresos y ajustes con motivo, sin negativos ni saldos iniciales repetidos o escrituras obsoletas', () => {
    const empty = seed();
    const state = addStockMovement(empty, opening(), stockVersion(empty, product.id));
    expect(stockBalance(state, product.id)).toBe(10000);
    const receipt = { ...opening(2000), id: 'receipt', kind: 'receipt' as const };
    expect(() => addStockMovement(state, receipt, '0:')).toThrow('cambió');
    const next = addStockMovement(state, receipt, stockVersion(state, product.id));
    expect(stockBalance(next, product.id)).toBe(12000);
    expect(() =>
      addStockMovement(
        next,
        { ...opening(-13000), id: 'minus', kind: 'adjustment' },
        stockVersion(next, product.id),
      ),
    ).toThrow('saldo');
    expect(() =>
      addStockMovement(next, { ...opening(), id: 'other' }, stockVersion(next, product.id)),
    ).toThrow('iniciales');
    expect(stockBalance(state, product.id)).toBe(10000);
  });
  it('descuenta cantidades fraccionadas, agrega renglones del mismo producto y no duplica consumos al guardar sin cambios', () => {
    const state = { ...seed(), stockMovements: [opening()] };
    const service = visit();
    const saved = create(state, service);
    expect(stockBalance(saved, product.id)).toBe(5500);
    const again = editServiceData(saved, service, { ...service, amount: 12345 }, '2026-10-27');
    expect(again.stockMovements).toEqual(saved.stockMovements);
    const double = {
      ...service,
      ...saveSupplyItems(
        [
          { ...service.supplyItems![0], quantity: 1 },
          { ...service.supplyItems![0], id: 'second', quantity: 2 },
        ],
        '',
      ),
    };
    const corrected = editServiceData(saved, service, double, '2026-10-27');
    expect(stockBalance(corrected, product.id)).toBe(7000);
    expect(dataSchema.safeParse(corrected).success).toBe(true);
  });
  it('corrige por diferencia, devuelve al anular y vuelve a consumir al recuperar sin alterar otros tipos de vencimiento', () => {
    const service = visit();
    const state = create({ ...seed(), stockMovements: [opening()] }, service);
    const correctedVisit = replaceQuantity(service, 6);
    const corrected = editServiceData(state, service, correctedVisit, '2026-10-27');
    expect(stockBalance(corrected, product.id)).toBe(4000);
    const cancelled = changeServiceStatus(
      corrected,
      correctedVisit,
      'Trabajo anulado de prueba',
      '2026-10-27',
    );
    expect(stockBalance(cancelled, product.id)).toBe(10000);
    const restored = changeServiceStatus(
      cancelled,
      cancelled.services[0],
      'Recuperación de prueba',
      '2026-10-27',
    );
    expect(stockBalance(restored, product.id)).toBe(4000);
    expect(parseBackup(JSON.stringify(makeBackup(restored))).data).toEqual(restored);
  });
  it('al cambiar de producto devuelve al anterior y consume el nuevo en una sola corrección', () => {
    const original = visit();
    const state = create({ ...seed(), stockMovements: [opening()] }, original);
    const replacement = {
      ...original,
      ...saveSupplyItems(
        [{ ...productServiceItem(demoProducts[1], 'replacement'), quantity: 3 }],
        '',
      ),
    };
    const before = structuredClone(state);
    expect(() => editServiceData(state, original, replacement, '2026-10-27')).toThrow(
      'Stock insuficiente',
    );
    expect(state).toEqual(before);
    const stocked = addStockMovement(
      state,
      { ...opening(), id: 'filter-opening', productId: demoProducts[1].id, unit: 'Unidad' },
      stockVersion(state, demoProducts[1].id),
    );
    const corrected = editServiceData(stocked, original, replacement, '2026-10-27');
    expect(stockBalance(corrected, product.id)).toBe(10000);
    expect(stockBalance(corrected, demoProducts[1].id)).toBe(7000);
    expect(inventoryIssue(corrected)).toBeUndefined();
  });
  it('rechaza alta, corrección o recuperación sin stock y conserva el estado original', () => {
    const empty = seed();
    expect(() => create(empty)).toThrow('Stock insuficiente');
    const service = visit();
    const state = create({ ...seed(), stockMovements: [opening()] }, service);
    const before = structuredClone(state);
    expect(() =>
      editServiceData(state, service, replaceQuantity(service, 11), '2026-10-27'),
    ).toThrow('Stock insuficiente');
    const cancelled = changeServiceStatus(state, service, 'Anulación de prueba', '2026-10-27');
    const depleted = addStockMovement(
      cancelled,
      { ...opening(-10000), id: 'deplete', kind: 'adjustment' },
      stockVersion(cancelled, product.id),
    );
    expect(() =>
      changeServiceStatus(depleted, depleted.services[0], 'Intento de recuperación', '2026-10-27'),
    ).toThrow('Stock insuficiente');
    expect(state).toEqual(before);
  });
  it('no inventa consumos históricos; los renglones manuales no consumen y desvincular devuelve el consumo previo', () => {
    const state = { ...seed(), stockMovements: [opening()] };
    const old = { ...visit(), stockManaged: undefined };
    const historical = editServiceData(
      { ...state, services: [old] },
      old,
      replaceQuantity(old, 8),
      '2026-10-27',
    );
    expect(stockBalance(historical, product.id)).toBe(10000);
    const service = visit();
    const saved = create(state, service);
    const { productId: _linked, ...manual } = service.supplyItems![0];
    const unlinked = { ...service, ...saveSupplyItems([manual], '') };
    expect(stockBalance(editServiceData(saved, service, unlinked, '2026-10-27'), product.id)).toBe(
      10000,
    );
  });
  it('impide retirar el control o cambiar la unidad con movimientos, pero permite corregir precios y desactivar', () => {
    const service = visit();
    const saved = create({ ...seed(), stockMovements: [opening()] }, service);
    expect(() =>
      editServiceData(saved, service, { ...service, stockManaged: undefined }, '2026-10-27'),
    ).toThrow('retirar');
    expect(() => saveProductData(saved, { ...product, unit: 'Unidad' }, product)).toThrow('unidad');
    expect(
      saveProductData(saved, { ...product, unitPrice: 12000, active: false }, product)
        .stockMovements,
    ).toEqual(saved.stockMovements);
  });
  it('rechaza respaldos con consumos inconsistentes, referencias huérfanas, unidades incorrectas o devolución sin consumo', () => {
    const state = create({ ...seed(), stockMovements: [opening()] });
    expect(inventoryIssue(state)).toBeUndefined();
    for (const bad of [
      { ...state, stockMovements: [opening()] },
      {
        ...state,
        stockMovements: state.stockMovements!.map((row) => ({ ...row, productId: 'missing' })),
      },
      {
        ...state,
        stockMovements: state.stockMovements!.map((row) => ({ ...row, unit: 'Unidad' as const })),
      },
      {
        ...state,
        stockMovements: [
          ...state.stockMovements!,
          { ...state.stockMovements![1], id: 'overreturn', deltaMilli: 10000 },
        ],
      },
    ])
      expect(dataSchema.safeParse(bad).success).toBe(false);
  });
});
