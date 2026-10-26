import { describe, expect, it } from 'vitest';
import {
  initialCustomers,
  initialVehicles,
  initialServices,
  type Service,
} from '../../src/lib/demo';
import { emptyData } from '../../src/lib/localDatabase';
import { servicePlan } from '../../src/lib/maintenancePlans';
import {
  createVehicleHistoryPDF,
  historyInPeriod,
  type VehicleHistoryReport,
} from '../../src/lib/vehicleHistoryPDF';
const first: Service = {
  ...initialServices[0],
  id: 'first',
  date: '2026-01-10',
  km: 80000,
  type: 'Cambio de aceite',
  work: 'Trabajo ACEITE ANTIGUO',
  notes: 'NOTA-PRIVADA-VISITA',
};
first.maintenance = servicePlan(first, {
  date: '2026-07-10',
  km: 90000,
  recommendation: 'Renovar aceite',
});
const last: Service = {
  ...first,
  id: 'last',
  date: '2026-10-05',
  km: 112300,
  type: 'Frenos',
  work: 'Trabajo FRENOS RECIENTE',
  amount: 12345.67,
};
last.maintenance = servicePlan(last, {
  date: '2027-03-05',
  km: 150000,
  recommendation: 'Revisar pastillas',
});
const cancelled: Service = {
  ...last,
  id: 'cancelled',
  date: '2026-10-20',
  work: 'TRABAJO ANULADO',
  annulment: { at: '2026-10-26T12:00:00Z', reason: 'MOTIVO-ANULADO-PRIVADO' },
};
function report(): VehicleHistoryReport {
  return {
    vehicle: {
      ...initialVehicles[1],
      maintenancePlans: [
        {
          category: 'aceite-filtros',
          label: 'Aceite vigente',
          recommendation: 'Revisión de aceite vigente',
          nextDate: '2027-04-01',
          nextKm: 122300,
          manual: true,
        },
      ],
    },
    customer: {
      ...initialCustomers[1],
      notes: 'NOTA-PRIVADA-CLIENTE',
      document: 'DOCUMENTO-PRIVADO',
    },
    services: [first, cancelled, last],
    workshop: { ...emptyData().workshop, address: 'Dirección taller 123' },
    today: '2026-10-26',
    includeAmounts: true,
    includePlans: true,
    demo: false,
  };
}
const raw = async (input: VehicleHistoryReport) =>
  Buffer.from((await createVehicleHistoryPDF(input)).bytes).toString('latin1');
describe('historial vehicular PDF', () => {
  it('incluye registros activos, cliente actual y objetivos independientes sin exponer notas ni anulados', async () => {
    const input = report();
    input.services[0] = {
      ...first,
      changes: [
        { at: '2026-10-26T12:00:00Z', action: 'edited', reason: 'AUDITORIA-PRIVADA', changes: [] },
      ],
    };
    const before = structuredClone(input);
    const pdf = await raw(input);
    for (const text of [
      'Historial de mantenimiento del vehículo',
      'María González',
      'Cliente actual',
      'Trabajo ACEITE ANTIGUO',
      'Trabajo FRENOS RECIENTE',
      'ARS 12.345,67',
      '90.000 km',
      '122.300 km',
      'Vencimiento guardado con esta visita',
      'Vencimientos vigentes',
    ])
      expect(pdf).toContain(text);
    for (const text of [
      'NOTA-PRIVADA-VISITA',
      'NOTA-PRIVADA-CLIENTE',
      'DOCUMENTO-PRIVADO',
      'TRABAJO ANULADO',
      'MOTIVO-ANULADO-PRIVADO',
      'AUDITORIA-PRIVADA',
    ])
      expect(pdf).not.toContain(text);
    expect(pdf.indexOf('Trabajo FRENOS RECIENTE')).toBeLessThan(
      pdf.indexOf('Trabajo ACEITE ANTIGUO'),
    );
    expect(input).toEqual(before);
  });
  it('filtra fechas inclusive y permite omitir importes y planes vigentes', async () => {
    const input = {
      ...report(),
      from: '2026-10-05',
      to: '2026-10-05',
      includeAmounts: false,
      includePlans: false,
    };
    const pdf = await raw(input);
    expect(pdf).toContain('Trabajo FRENOS RECIENTE');
    expect(pdf).not.toContain('Trabajo ACEITE ANTIGUO');
    expect(pdf).not.toContain('ARS ');
    expect(pdf).not.toContain('Importe registrado');
    expect(pdf).not.toContain('Vencimientos vigentes');
    expect(pdf).not.toContain('122.300 km');
    expect(pdf).toContain('150.000 km');
    expect((await createVehicleHistoryPDF(input)).filename).toBe(
      'taller-calamante-historial-AF-456-EF-2026-10-05-2026-10-05.pdf',
    );
  });
  it('no reemplaza el vencimiento histórico ausente por el objetivo actual', async () => {
    const input = report();
    const { maintenance: _old, ...legacy } = first;
    input.services = [legacy];
    input.includePlans = false;
    const pdf = await raw(input);
    expect(pdf).not.toContain('90.000 km');
    expect(pdf).not.toContain('122.300 km');
    expect(pdf).not.toContain('Vencimiento guardado');
  });
  it('distribuye muchos trabajos largos en páginas y marca todas las páginas de la demo', async () => {
    const input = report();
    input.demo = true;
    input.services = Array.from({ length: 6 }, (_, index) => ({
      ...last,
      id: `long-${index}`,
      work: `${'Control completo de mantenimiento. '.repeat(50)}FINAL ${index}`,
    }));
    const pdf = await raw(input);
    const pages = (pdf.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(2);
    expect(pdf).toContain('FINAL 5');
    expect(pdf).toContain('Continuación');
    expect((pdf.match(/DATOS FICTICIOS/g) ?? []).length).toBe(pages + 1);
    expect(pdf).toContain(`Página ${pages} de ${pages}`);
    expect((await createVehicleHistoryPDF(input)).filename).toContain('-demo-');
  });
  it('rechaza fechas invertidas, inválidas, relaciones cruzadas y períodos sin visitas activas', async () => {
    await expect(
      createVehicleHistoryPDF({ ...report(), from: '2026-12-01', to: '2026-01-01' }),
    ).rejects.toThrow('Desde');
    await expect(createVehicleHistoryPDF({ ...report(), from: '2026-99-99' })).rejects.toThrow(
      'fechas',
    );
    await expect(
      createVehicleHistoryPDF({ ...report(), customer: initialCustomers[0] }),
    ).rejects.toThrow('no corresponden');
    await expect(
      createVehicleHistoryPDF({ ...report(), services: [{ ...last, vehicleId: 'otro' }] }),
    ).rejects.toThrow('no corresponden');
    await expect(createVehicleHistoryPDF({ ...report(), services: [cancelled] })).rejects.toThrow(
      'No hay mantenimientos',
    );
    await expect(createVehicleHistoryPDF({ ...report(), from: '2027-01-01' })).rejects.toThrow(
      'No hay mantenimientos',
    );
  });
  it('selecciona y ordena sin mutar la lista original', () => {
    const input = [first, cancelled, last];
    expect(historyInPeriod(input).map((s) => s.id)).toEqual(['last', 'first']);
    expect(input.map((s) => s.id)).toEqual(['first', 'cancelled', 'last']);
  });
});

it('el historial sin importes no revela precios ni total de artículos estructurados', async () => {
  const { saveSupplyItems } = await import('../../src/lib/supplyItems');
  const data = report();
  data.services = [
    {
      ...first,
      ...saveSupplyItems(
        [
          {
            id: 'part',
            code: 'ACE-001',
            description: 'ARTICULO-ESTRUCTURADO',
            quantity: 4.5,
            unit: 'Litro',
            unitPrice: 8765.43,
          },
        ],
        '',
      ),
    },
  ];
  data.includeAmounts = false;
  const result = await createVehicleHistoryPDF(data);
  const pdf = Buffer.from(result.bytes).toString('latin1');
  expect(pdf).toContain('ARTICULO-ESTRUCTURADO');
  expect(pdf).not.toContain('8.765,43');
  expect(pdf).not.toContain('Total de insumos');
});
