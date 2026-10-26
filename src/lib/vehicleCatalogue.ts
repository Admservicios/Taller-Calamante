import type { Customer, Vehicle } from './demo';
import { csvDocument } from './csv';
import { allPlanRows, planStatus, type MaintenancePlan, type PlanStatus } from './maintenancePlans';

export type VehicleRow = {
  vehicle: Vehicle;
  customerName: string;
  plans: MaintenancePlan[];
  priority?: MaintenancePlan;
  status: PlanStatus | 'Sin datos';
};
export const normalizedVehicleText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
export function vehicleRows(
  vehicles: Vehicle[],
  customers: Customer[],
  today: string,
): VehicleRow[] {
  const owners = new Map(customers.map((customer) => [customer.id, customer.name]));
  return vehicles.map((vehicle) => {
    const plans = allPlanRows([vehicle], today).map(({ plan }) => plan);
    const priority = plans[0];
    return {
      vehicle,
      customerName: owners.get(vehicle.customerId) ?? '',
      plans,
      priority,
      status: priority ? planStatus(priority, vehicle.km, today) : 'Sin datos',
    };
  });
}
export function selectVehicleRows(
  rows: VehicleRow[],
  filters: { search: string; customerId: string; brand: string; status: string; order: string },
): VehicleRow[] {
  const query = normalizedVehicleText(filters.search);
  const rank = { Vencido: 0, Próximo: 1, 'Al día': 2, 'Sin datos': 3 };
  return rows
    .filter(
      ({ vehicle: v, customerName, status }) =>
        (!filters.customerId || v.customerId === filters.customerId) &&
        (!filters.brand || normalizedVehicleText(v.brand) === filters.brand) &&
        (filters.status === 'todos' || status === filters.status) &&
        (normalizedVehicleText(`${v.plate} ${v.brand} ${v.model} ${customerName}`).includes(
          query,
        ) ||
          (!!query.replace(/[^a-z0-9]/g, '') &&
            normalizedVehicleText(v.plate)
              .replace(/[^a-z0-9]/g, '')
              .includes(query.replace(/[^a-z0-9]/g, '')))),
    )
    .sort((a, b) => {
      if (filters.order === 'urgencia') {
        const urgency =
          rank[a.status] - rank[b.status] ||
          (a.priority?.nextDate ?? '9999-12-31').localeCompare(
            b.priority?.nextDate ?? '9999-12-31',
          ) ||
          (a.priority?.nextKm ?? Infinity) -
            a.vehicle.km -
            ((b.priority?.nextKm ?? Infinity) - b.vehicle.km);
        if (urgency) return urgency;
      }
      if (filters.order === 'kilometraje' && a.vehicle.km !== b.vehicle.km)
        return b.vehicle.km - a.vehicle.km;
      return (
        a.vehicle.plate.localeCompare(b.vehicle.plate, 'es', { numeric: true }) ||
        a.vehicle.id.localeCompare(b.vehicle.id)
      );
    });
}
export function vehicleCSV(rows: VehicleRow[], today: string, demo = false) {
  return csvDocument([
    [
      'Patente',
      'Marca',
      'Modelo',
      'Año',
      'Cliente actual',
      'Combustible',
      'Motor',
      'Color',
      'Kilometraje registrado',
      'Estado general',
      'Servicios vencidos',
      'Servicios próximos',
      'Servicios al día',
      'Servicio prioritario',
      'Fecha prioritaria',
      'Km prioritario',
      'Todos los vencimientos vigentes',
      'Fecha de referencia',
      'Modo',
    ],
    ...rows.map(({ vehicle: v, customerName, plans, priority, status }) => [
      v.plate,
      v.brand,
      v.model,
      String(v.year),
      customerName,
      v.fuel,
      v.engine,
      v.color,
      String(v.km),
      status,
      ...(['Vencido', 'Próximo', 'Al día'] as const).map((state) =>
        String(plans.filter((plan) => planStatus(plan, v.km, today) === state).length),
      ),
      priority?.label ?? '',
      priority?.nextDate ?? '',
      priority ? String(priority.nextKm) : '',
      plans
        .map(
          (plan) =>
            `${plan.label}: ${plan.recommendation} | ${plan.nextDate} | ${plan.nextKm} km | ${planStatus(plan, v.km, today)}`,
        )
        .join('\n'),
      today,
      demo ? 'Demostración' : 'Taller',
    ]),
  ]);
}
