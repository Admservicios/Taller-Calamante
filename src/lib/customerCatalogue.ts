import type { Customer, Vehicle } from './demo';
import { csvDocument } from './csv';
import { normalizedVehicleText } from './vehicleCatalogue';

export type CustomerRow = { customer: Customer; vehicles: Vehicle[] };
export function customerRows(customers: Customer[], vehicles: Vehicle[]): CustomerRow[] {
  const byOwner = new Map<string, Vehicle[]>();
  for (const vehicle of vehicles) {
    const owned = byOwner.get(vehicle.customerId) ?? [];
    owned.push(vehicle);
    byOwner.set(vehicle.customerId, owned);
  }
  return customers.map((customer) => ({ customer, vehicles: byOwner.get(customer.id) ?? [] }));
}
export function selectCustomerRows(
  rows: CustomerRow[],
  filters: { search: string; status: string; ownership: string; order: string },
): CustomerRow[] {
  const query = normalizedVehicleText(filters.search);
  const compact = query.replace(/[^a-z0-9]/g, '');
  return rows
    .filter(({ customer: c, vehicles }) => {
      const text = normalizedVehicleText(`${c.name} ${c.document} ${c.phone} ${c.email}`);
      const matches =
        text.includes(query) ||
        (!!compact &&
          [c.document, c.phone, ...vehicles.map((v) => v.plate)].some((value) =>
            normalizedVehicleText(value)
              .replace(/[^a-z0-9]/g, '')
              .includes(compact),
          ));
      return (
        matches &&
        (filters.status === 'todos' || c.active === (filters.status === 'activos')) &&
        (filters.ownership === 'todos' || vehicles.length > 0 === (filters.ownership === 'con'))
      );
    })
    .sort((a, b) => {
      if (filters.order === 'vehiculos' && a.vehicles.length !== b.vehicles.length)
        return b.vehicles.length - a.vehicles.length;
      const byName = a.customer.name.localeCompare(b.customer.name, 'es', {
        sensitivity: 'base',
        numeric: true,
      });
      return (
        (filters.order === 'nombre-desc' ? -byName : byName) ||
        a.customer.id.localeCompare(b.customer.id)
      );
    });
}
export function customerCatalogueCSV(rows: CustomerRow[], today: string, demo = false) {
  return csvDocument([
    [
      'Nombre',
      'Teléfono',
      'Email',
      'Estado',
      'Vehículos actuales',
      'Patentes actuales',
      'Fecha de referencia',
      'Modo',
    ],
    ...rows.map(({ customer: c, vehicles }) => [
      c.name,
      c.phone,
      c.email,
      c.active ? 'Activo' : 'Inactivo',
      String(vehicles.length),
      vehicles
        .map((v) => v.plate)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .join(' · '),
      today,
      demo ? 'Demostración' : 'Taller',
    ]),
  ]);
}
