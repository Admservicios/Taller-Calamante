import type { Customer, Service, Vehicle } from './demo';

const reportCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const reportMoney = (amount: number) => reportCurrency.format(amount);

// Desplazar el decimal antes de redondear evita sumar errores binarios entre visitas.
// Cada importe se expresa en centavos, igual que su fila del informe.
export function amountCents(amount: number): number {
  const [coefficient, exponent = '0'] = amount.toString().split('e');
  return Math.round(Number(`${coefficient}e${Number(exponent) + 2}`));
}

export function maintenanceSummary(services: Service[]) {
  const active = services.filter((service) => !service.annulment);
  const totalCents = active.reduce((total, service) => total + amountCents(service.amount), 0);
  return {
    active: active.length,
    annulled: services.length - active.length,
    total: totalCents / 100,
    average: active.length ? Math.round(totalCents / active.length) / 100 : 0,
  };
}

function csvCell(value: string) {
  // Se conserva el texto como tal al abrirlo en una hoja de cálculo.
  const safe = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function maintenanceCSV(
  services: Service[],
  vehicles: Vehicle[],
  customers: Customer[],
  demo = false,
) {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const rows = [
    [
      'Fecha',
      'Patente',
      'Marca',
      'Modelo',
      'Cliente actual del vehículo',
      'Servicio',
      'Trabajos realizados',
      'Insumos y repuestos',
      'Kilometraje',
      'Importe ARS',
      'Estado',
      'Próxima fecha registrada',
      'Próximo km registrado',
      'Trabajo recomendado registrado',
      'Modo',
    ],
    ...services.map((service) => {
      const vehicle = vehicleById.get(service.vehicleId);
      const customer = vehicle && customerById.get(vehicle.customerId);
      return [
        service.date,
        vehicle?.plate ?? '',
        vehicle?.brand ?? '',
        vehicle?.model ?? '',
        customer?.name ?? '',
        service.type,
        service.work,
        service.supplies,
        String(service.km),
        (amountCents(service.amount) / 100).toFixed(2).replace('.', ','),
        service.annulment ? 'Anulado' : 'Activo',
        service.maintenance?.nextDate ?? '',
        service.maintenance ? String(service.maintenance.nextKm) : '',
        service.maintenance?.recommendation ?? '',
        demo ? 'Demostración' : 'Taller',
      ];
    }),
  ];
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}
