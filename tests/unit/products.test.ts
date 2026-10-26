import { describe, expect, it } from 'vitest';
import {
  demoProducts,
  productSchema,
  productServiceItem,
  searchProducts,
  saveProductData,
} from '../../src/lib/products';
import { dataSchema, emptyData, makeBackup, parseBackup } from '../../src/lib/localDatabase';
import { initialCustomers, initialVehicles, initialServices } from '../../src/lib/demo';
import { saveSupplyItems } from '../../src/lib/supplyItems';
import { editServiceData } from '../../src/lib/serviceEditing';
import { changeServiceStatus } from '../../src/lib/serviceHistory';
const data = () => ({
  ...emptyData(),
  products: structuredClone(demoProducts),
  customers: initialCustomers,
  vehicles: initialVehicles,
  services: initialServices,
});
describe('catálogo de productos', () => {
  it('busca código sin separadores, descripción y marca sin acentos; excluye inactivos por defecto', () => {
    const products = [
      ...demoProducts,
      {
        ...demoProducts[0],
        id: 'old',
        code: 'OLD-1',
        description: 'Último repuesto',
        active: false,
      },
    ];
    expect(searchProducts(products, 'ace001').map((p) => p.id)).toEqual(['demo-oil']);
    expect(searchProducts(products, 'shell')).toHaveLength(1);
    expect(searchProducts(products, 'ultimo')).toHaveLength(0);
    expect(searchProducts(products, 'ultimo', 'todos')[0].id).toBe('old');
  });
  it('rechaza códigos repetidos, incluso inactivos, y ediciones obsoletas sin modificar la base', () => {
    const state = data();
    const before = structuredClone(state);
    expect(() =>
      saveProductData(state, { ...demoProducts[0], id: 'new', code: ' ace-001 ' }),
    ).toThrow('código');
    const original = state.products[0];
    const changed = saveProductData(state, { ...original, unitPrice: 11000 }, original);
    expect(() => saveProductData(changed, { ...original, brand: 'Otra marca' }, original)).toThrow(
      'cambió',
    );
    expect(state).toEqual(before);
    expect(productSchema.safeParse({ ...original, unitPrice: 1.001 }).success).toBe(false);
    expect(
      productSchema.safeParse({ ...original, description: 'a'.repeat(100), brand: 'b'.repeat(40) })
        .success,
    ).toBe(false);
  });
  it('conserva productos y precios históricos en respaldos, ediciones y anulaciones', () => {
    const state = data();
    const original = {
      ...initialServices[0],
      ...saveSupplyItems([productServiceItem(state.products[0], 'row')], ''),
    };
    state.services = [original];
    const updated = saveProductData(
      state,
      { ...state.products[0], unitPrice: 15000, active: false },
      state.products[0],
    );
    expect(updated.services[0].supplyItems![0].unitPrice).toBe(10000);
    const edited = editServiceData(updated, original, { ...original, amount: 45600 }, '2026-10-26');
    expect(edited.products).toEqual(updated.products);
    const archived = changeServiceStatus(
      edited,
      edited.services[0],
      'Prueba de anulación',
      '2026-10-26',
    );
    expect(archived.products).toEqual(updated.products);
    expect(parseBackup(JSON.stringify(makeBackup(archived))).data).toEqual(archived);
  });
  it('acepta respaldos anteriores sin catálogo; rechaza enlaces huérfanos, códigos duplicados e identificadores repetidos', () => {
    expect(dataSchema.safeParse(emptyData()).success).toBe(true);
    const state = data();
    const linked = {
      ...initialServices[0],
      ...saveSupplyItems([productServiceItem(demoProducts[0], 'row')], ''),
    };
    expect(dataSchema.safeParse({ ...state, services: [linked], products: [] }).success).toBe(
      false,
    );
    expect(
      dataSchema.safeParse({
        ...state,
        products: [...demoProducts, { ...demoProducts[0], id: 'other' }],
      }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        ...state,
        products: [...demoProducts, { ...demoProducts[0], code: 'DIFFERENT' }],
      }).success,
    ).toBe(false);
  });
});
