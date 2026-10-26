import { describe, expect, it } from 'vitest';
import { initialCustomers, initialVehicles } from '../../src/lib/demo';
import { emptyData } from '../../src/lib/localDatabase';
import { customerReminder, dueDetail } from '../../src/lib/customerReminder';
import type { MaintenancePlan } from '../../src/lib/maintenancePlans';
const today = '2026-10-26';
const plan: MaintenancePlan = {
  category: 'frenos',
  label: 'Frenos',
  recommendation: 'Revisar pastillas delanteras',
  nextDate: today,
  nextKm: 10000,
};
const input = () => ({
  customer: initialCustomers[1],
  vehicle: { ...initialVehicles[1], km: 9500 },
  workshop: { ...emptyData().workshop, phone: '11 4567-8900' },
  plans: [plan],
  today,
});
describe('detalle de vencimientos', () => {
  it('muestra el límite de hoy, el kilometraje alcanzado y los vencimientos superados', () => {
    expect(dueDetail(plan, 10000, today)).toEqual({
      date: 'Vence hoy',
      km: 'Kilometraje objetivo alcanzado',
    });
    expect(dueDetail({ ...plan, nextDate: '2026-10-25' }, 10200, today)).toEqual({
      date: 'Venció hace 1 día',
      km: 'Superado por 200 km',
    });
    expect(dueDetail({ ...plan, nextDate: '2026-10-24' }, 9500, today)).toEqual({
      date: 'Venció hace 2 días',
      km: 'Faltan 500 km',
    });
  });
  it('calcula días con fechas UTC incluso al cruzar meses y años, sin depender del huso horario', () => {
    expect(dueDetail({ ...plan, nextDate: '2027-01-01' }, 0, '2026-12-31').date).toBe('En 1 día');
    expect(dueDetail({ ...plan, nextDate: '2026-11-01' }, 0, today).date).toBe('En 6 días');
  });
});
describe('aviso preparado para el cliente', () => {
  it('usa solo los vencimientos seleccionados con sus objetivos independientes y la lectura registrada', () => {
    const oil = {
      ...plan,
      category: 'aceite-filtros',
      label: 'Aceite y filtros',
      recommendation: 'Cambio de aceite y filtros',
      nextDate: '2027-01-01',
      nextKm: 20000,
    };
    const data = { ...input(), plans: [plan, oil] };
    const before = structuredClone(data);
    const message = customerReminder(data);
    for (const text of [
      'María González',
      'Taller Calamante',
      'Toyota Hilux SRX (AF 456 EF)',
      '10.000 km',
      '20.000 km',
      'Frenos',
      'Aceite y filtros',
      'Último kilometraje registrado: 9.500 km',
      'Confirmá el kilometraje actual',
      'lo que ocurra primero',
      '11 4567-8900',
      'Vencido según los registros',
    ])
      expect(message).toContain(text);
    expect(customerReminder({ ...data, plans: [oil] })).not.toContain('Frenos');
    expect(data).toEqual(before);
  });
  it('excluye notas, datos fiscales y detalles privados de los clientes y maneja taller sin teléfono', () => {
    const data = input();
    data.customer = {
      ...data.customer,
      notes: 'NOTA-PRIVADA-123',
      document: 'DNI-SECRETO',
      email: 'privado@example.com',
    };
    data.workshop.phone = '';
    const message = customerReminder(data);
    for (const text of [
      'NOTA-PRIVADA-123',
      'DNI-SECRETO',
      'privado@example.com',
      data.customer.address,
    ])
      expect(message).not.toContain(text);
    expect(message).toContain('Contactanos para coordinar una visita.');
    expect(message).not.toContain('undefined');
  });
  it('marca claramente la demostración y no produce un aviso sin servicios', () => {
    expect(customerReminder({ ...input(), demo: true })).toMatch(
      /^\[DEMOSTRACIÓN · DATOS FICTICIOS\]/,
    );
    expect(customerReminder({ ...input(), plans: [] })).toBe('');
  });
});
