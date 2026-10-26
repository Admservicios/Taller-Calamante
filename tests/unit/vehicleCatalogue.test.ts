import { describe, expect, it } from 'vitest';
import { initialCustomers, initialVehicles, type Vehicle } from '../../src/lib/demo';
import { vehicleRows, selectVehicleRows, vehicleCSV } from '../../src/lib/vehicleCatalogue';
const today = '2026-10-26';
const base = initialVehicles[1];
const vehicles: Vehicle[] = [
  {
    ...base,
    id: 'urgent',
    plate: 'AB 123 CD',
    km: 20000,
    maintenancePlans: [
      {
        category: 'oil',
        label: 'Aceite',
        recommendation: 'Cambio de aceite',
        nextDate: '2026-10-01',
        nextKm: 25000,
      },
      {
        category: 'brakes',
        label: 'Frenos',
        recommendation: 'Revisar frenos',
        nextDate: '2027-05-01',
        nextKm: 50000,
      },
    ],
  },
  {
    ...base,
    id: 'soon',
    plate: 'AA 111 ZZ',
    brand: 'TOYOTA',
    km: 8000,
    maintenancePlans: [
      {
        category: 'cabin',
        label: 'Filtro de habitáculo',
        recommendation: 'Cambiar filtro',
        nextDate: '2026-11-01',
        nextKm: 20000,
      },
    ],
  },
  {
    ...base,
    id: 'none',
    customerId: initialCustomers[0].id,
    plate: 'CC 111 XX',
    brand: 'Ford',
    km: 90000,
    maintenancePlans: [],
  },
];
const filters = { search: '', customerId: '', brand: '', status: 'todos', order: 'patente' };
describe('catálogo de vehículos', () => {
  it('calcula el servicio prioritario y conserva los otros; Sin datos no reutiliza el resumen antiguo', () => {
    const rows = vehicleRows(vehicles, initialCustomers, today);
    expect(rows[0]).toMatchObject({ status: 'Vencido', priority: { category: 'oil' } });
    expect(rows[0].plans).toHaveLength(2);
    expect(rows[1].status).toBe('Próximo');
    expect(rows[2]).toMatchObject({ status: 'Sin datos', plans: [] });
    expect(rows[2].priority).toBeUndefined();
  });
  it('combina cliente, marca, estado, búsqueda sin acentos y patente sin espacios ni guiones', () => {
    const rows = vehicleRows(vehicles, initialCustomers, today);
    expect(
      selectVehicleRows(rows, { ...filters, search: 'AB-123-CD' }).map((r) => r.vehicle.id),
    ).toEqual(['urgent']);
    expect(
      selectVehicleRows(rows, {
        ...filters,
        search: 'maria',
        brand: 'toyota',
        customerId: base.customerId,
        status: 'Próximo',
      }).map((r) => r.vehicle.id),
    ).toEqual(['soon']);
    expect(
      selectVehicleRows(rows, { ...filters, status: 'Sin datos' }).map((r) => r.vehicle.id),
    ).toEqual(['none']);
    expect(selectVehicleRows(rows, { ...filters, search: 'no existe' })).toEqual([]);
  });
  it('ordena por patente, urgencia o kilómetros sin mutar las colecciones originales', () => {
    const rows = vehicleRows(vehicles, initialCustomers, today);
    const before = structuredClone(rows);
    expect(selectVehicleRows(rows, filters).map((r) => r.vehicle.id)).toEqual([
      'soon',
      'urgent',
      'none',
    ]);
    expect(
      selectVehicleRows(rows, { ...filters, order: 'urgencia' }).map((r) => r.vehicle.id),
    ).toEqual(['urgent', 'soon', 'none']);
    expect(
      selectVehicleRows(rows, { ...filters, order: 'kilometraje' }).map((r) => r.vehicle.id),
    ).toEqual(['none', 'urgent', 'soon']);
    expect(rows).toEqual(before);
  });
  it('ordena vehículos sin vencimientos de forma determinista y admite resultados vacíos', () => {
    const rows = vehicleRows(
      [
        { ...vehicles[2], id: 'b' },
        { ...vehicles[2], id: 'a' },
      ],
      initialCustomers,
      today,
    );
    expect(
      selectVehicleRows(rows, { ...filters, order: 'urgencia' }).map((r) => r.vehicle.id),
    ).toEqual(['a', 'b']);
    expect(vehicleRows([], [], today)).toEqual([]);
  });
});
describe('CSV de vehículos', () => {
  it('incluye cada vehículo una vez con todos sus objetivos independientes y sus estados', () => {
    const rows = vehicleRows(vehicles, initialCustomers, today);
    const before = structuredClone(rows);
    const csv = vehicleCSV(rows, today);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('Aceite: Cambio de aceite | 2026-10-01 | 25000 km | Vencido');
    expect(csv).toContain('Frenos: Revisar frenos | 2027-05-01 | 50000 km | Al día');
    expect(csv).toContain('"Vencido";"1";"0";"1";"Aceite"');
    expect(rows).toEqual(before);
    expect(csv).not.toContain(initialCustomers[1].notes);
    expect(csv).not.toContain(initialCustomers[1].document);
  });
  it('marca demo, escapa texto y fórmulas, y deja objetivos vacíos para un vehículo Sin datos', () => {
    const row = vehicleRows(
      [{ ...vehicles[2], model: 'Modelo "nuevo"; revisión', brand: ' =HYPERLINK("ejemplo")' }],
      initialCustomers,
      today,
    );
    const csv = vehicleCSV(row, today, true);
    expect(csv).toContain('"\' =HYPERLINK(""ejemplo"")"');
    expect(csv).toContain('"Modelo ""nuevo""; revisión"');
    expect(csv).toContain('"Sin datos";"0";"0";"0";"";"";"";""');
    expect(csv).toContain('"Demostración"');
    expect(vehicleCSV([], today).split('\r\n')).toHaveLength(1);
  });
});
