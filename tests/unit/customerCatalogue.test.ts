import { describe, expect, it } from 'vitest';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import {
  customerRows,
  selectCustomerRows,
  customerCatalogueCSV,
} from '../../src/lib/customerCatalogue';
const customers = initialCustomers.slice(0, 3).map((c, i) => ({
  ...c,
  active: i !== 1,
  notes: 'Nota privada que no se exporta',
}));
const vehicles = initialVehicles.slice(0, 2).map((v, i) => ({
  ...v,
  customerId: customers[0].id,
  plate: i ? 'AC 456 EF' : 'AB 123 CD',
}));
const filters = { search: '', status: 'todos', ownership: 'todos', order: 'nombre' };
const select = (changes: Partial<typeof filters>) =>
  selectCustomerRows(customerRows(customers, vehicles), { ...filters, ...changes });
describe('catálogo de clientes', () => {
  it('encuentra nombres sin acentos, DNI y teléfono sin separadores y patentes de cualquier vehículo actual', () => {
    for (const search of [
      'juan perez',
      customers[0].document.replace(/\D/g, ''),
      customers[0].phone.replace(/\D/g, ''),
      'AB-123-CD',
      'ac456ef',
    ]) {
      expect(select({ search }).map((r) => r.customer.id)).toEqual([customers[0].id]);
    }
    expect(select({ search: customers[1].email }).map((r) => r.customer.id)).toEqual([
      customers[1].id,
    ]);
    expect(select({ search: '!!!' })).toEqual([]);
    expect(select({ search: 'No existe' })).toEqual([]);
  });
  it('combina estado y vehículos sin confundir inactividad con vencimientos', () => {
    expect(select({ status: 'activos', ownership: 'con' }).map((r) => r.customer.id)).toEqual([
      customers[0].id,
    ]);
    expect(select({ status: 'inactivos', ownership: 'sin' }).map((r) => r.customer.id)).toEqual([
      customers[1].id,
    ]);
    expect(select({ search: 'AB123CD', status: 'inactivos' })).toEqual([]);
  });
  it('ordena por nombre o cantidad de vehículos sin mutar registros; refleja cambios de propietario', () => {
    const before = structuredClone({ customers, vehicles });
    expect(select({}).map((r) => r.customer.name)).toEqual([
      'Carlos Ramírez',
      'Juan Pérez',
      'María González',
    ]);
    expect(select({ order: 'nombre-desc' }).map((r) => r.customer.name)).toEqual([
      'María González',
      'Juan Pérez',
      'Carlos Ramírez',
    ]);
    expect(select({ order: 'vehiculos' })[0].vehicles).toHaveLength(2);
    const transferred = customerRows(
      customers,
      vehicles.map((v) => ({ ...v, customerId: customers[2].id })),
    );
    expect(selectCustomerRows(transferred, { ...filters, search: 'ab123cd' })[0].customer.id).toBe(
      customers[2].id,
    );
    expect({ customers, vehicles }).toEqual(before);
  });
  it('tolera base vacía y clientes sin vehículos, con orden estable para nombres iguales', () => {
    expect(customerRows([], vehicles)).toEqual([]);
    const twins = [
      { ...customers[0], id: 'b' },
      { ...customers[0], id: 'a' },
    ];
    expect(selectCustomerRows(customerRows(twins, []), filters).map((r) => r.customer.id)).toEqual([
      'a',
      'b',
    ]);
  });
});
describe('CSV del catálogo de clientes', () => {
  it('exporta todos los resultados con patentes actuales, sin DNI, domicilio ni notas', () => {
    const rows = select({});
    const before = structuredClone(rows);
    const csv = customerCatalogueCSV(rows, '2026-10-26');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('"2";"AB 123 CD · AC 456 EF"');
    for (const c of customers) {
      expect(csv).not.toContain(c.notes);
      expect(csv).not.toContain(c.document);
      expect(csv).not.toContain(c.address);
    }
    expect(rows).toEqual(before);
  });
  it('marca cada fila de demo, escapa comillas y neutraliza fórmulas con espacios iniciales', () => {
    const rows = customerRows(
      [{ ...customers[0], name: ' =SUM(1;2)', phone: '+54 11 123', email: 'correo"prueba' }],
      [],
    );
    const csv = customerCatalogueCSV(rows, '2026-10-26', true);
    expect(csv).toContain('"\' =SUM(1;2)"');
    expect(csv).toContain('"\'+54 11 123"');
    expect(csv).toContain('"correo""prueba"');
    expect(csv).toContain('"Demostración"');
    expect(customerCatalogueCSV([], '2026-10-26').split('\r\n')).toHaveLength(1);
  });
});
