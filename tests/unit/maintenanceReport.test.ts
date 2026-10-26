import { describe, expect, it } from 'vitest';
import { initialCustomers, initialServices, initialVehicles } from '../../src/lib/demo';
import { amountCents, maintenanceCSV, maintenanceSummary } from '../../src/lib/maintenanceReport';

const service = initialServices[0];
describe('resumen de mantenimientos', () => {
  it('suma centavos por visita, excluye anulados y calcula el promedio de activos, incluso gratuitos', () => {
    const services = [
      { ...service, id: 'a', amount: 0.1 },
      { ...service, id: 'b', amount: 0.2 },
      { ...service, id: 'c', amount: 0 },
      {
        ...service,
        id: 'd',
        amount: 999,
        annulment: { at: '2026-10-26T15:00:00Z', reason: 'Duplicado' },
      },
    ];
    const before = structuredClone(services);
    expect(maintenanceSummary(services)).toEqual({
      active: 3,
      annulled: 1,
      total: 0.3,
      average: 0.1,
    });
    expect(services).toEqual(before);
  });
  it('redondea cada importe a dos decimales igual que las filas exportadas, sin perder precisión al acumular', () => {
    expect(amountCents(1.005)).toBe(101);
    expect(amountCents(1.995)).toBe(200);
    expect(amountCents(1e-7)).toBe(0);
    expect(amountCents(999999999)).toBe(99999999900);
    expect(
      maintenanceSummary([
        { ...service, amount: 1.005 },
        { ...service, amount: 1.995 },
      ]),
    ).toMatchObject({ total: 3.01, average: 1.51 });
    expect(
      maintenanceSummary(Array.from({ length: 50000 }, () => ({ ...service, amount: 999999999 })))
        .total,
    ).toBe(49999999950000);
  });
  it('no divide por cero con resultados vacíos o solo anulados', () => {
    expect(maintenanceSummary([])).toEqual({ active: 0, annulled: 0, total: 0, average: 0 });
    expect(
      maintenanceSummary([
        { ...service, annulment: { at: '2026-10-26T15:00:00Z', reason: 'Duplicado' } },
      ]),
    ).toEqual({ active: 0, annulled: 1, total: 0, average: 0 });
  });
});
describe('CSV de mantenimientos para Excel', () => {
  it('conserva caracteres, separadores, comillas y saltos; exporta decimales con coma y datos vinculados actuales', () => {
    const vehicle = { ...initialVehicles[1], plate: 'COR 123' };
    const customer = { ...initialCustomers[1], name: 'María corregida' };
    const csv = maintenanceCSV(
      [{ ...service, amount: 123.45, work: 'Cambio de "aceite"; revisión\nFiltro de habitáculo' }],
      [vehicle],
      [customer],
    );
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"COR 123";"Toyota";"Hilux SRX";"María corregida"');
    expect(csv).toContain('"Cambio de ""aceite""; revisión\nFiltro de habitáculo"');
    expect(csv).toContain('"123,45";"Activo"');
    expect(csv).not.toContain('NaN');
  });
  it('identifica anulados y demo, mantiene el orden recibido y no expone notas ni la auditoría privada', () => {
    const archived = {
      ...service,
      date: '2026-10-20',
      notes: 'NOTA-PRIVADA',
      annulment: { at: '2026-10-26T15:00:00Z', reason: 'MOTIVO-PRIVADO' },
      changes: [
        {
          at: '2026-10-26T15:00:00Z',
          action: 'annulled' as const,
          reason: 'HISTORIA-PRIVADA',
          changes: [],
        },
      ],
    };
    const csv = maintenanceCSV(
      [archived, { ...service, date: '2026-01-01' }],
      initialVehicles,
      initialCustomers,
      true,
    );
    expect(csv).toContain('"Anulado"');
    expect(csv).toContain('"Demostración"');
    expect(csv.indexOf('2026-10-20')).toBeLessThan(csv.indexOf('2026-01-01'));
    for (const privateText of [
      'NOTA-PRIVADA',
      'MOTIVO-PRIVADO',
      'HISTORIA-PRIVADA',
      initialCustomers[1].notes,
    ])
      expect(csv).not.toContain(privateText);
    expect(maintenanceCSV([], [], []).split('\r\n')).toHaveLength(1);
  });
  it('no reemplaza un vencimiento histórico ausente por el vigente del vehículo', () => {
    const csv = maintenanceCSV([service], initialVehicles, initialCustomers);
    expect(csv).not.toContain(initialVehicles[1].nextDate);
    expect(csv).toContain(';"";"";"";"Taller"');
  });
  it.each(['=HYPERLINK("archivo")', ' +SUM(1;2)', '\t@SUM(1;2)', '\r=1+1', '\n=1+1', '  -2+3'])(
    'neutraliza fórmulas incluso precedidas de espacios o controles: %s',
    (value) => {
      const csv = maintenanceCSV([{ ...service, work: value }], initialVehicles, initialCustomers);
      expect(csv).toContain(`"'${value.replaceAll('"', '""')}"`);
    },
  );
});
