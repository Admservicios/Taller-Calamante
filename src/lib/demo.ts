import type { SupplyItem } from './supplyItems';
import type { SuppliesDetail } from './maintenanceEntry';
import { vehiclePlanStatus, type MaintenancePlan } from './maintenancePlans';

export type Customer = {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  active: boolean;
  notes: string;
};
export type Vehicle = {
  id: string;
  customerId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  fuel: string;
  engine: string;
  km: number;
  color: string;
  nextDate: string;
  nextKm: number;
  recommendation: string;
  maintenancePlans?: MaintenancePlan[];
  manualKm?: number;
};
export type ServiceChange = {
  at: string;
  action: 'created' | 'edited' | 'annulled' | 'restored';
  reason?: string;
  changes: { field: string; before: string; after: string }[];
};
export type Service = {
  stockManaged?: true;
  annulment?: { at: string; reason: string };
  changes?: ServiceChange[];
  id: string;
  vehicleId: string;
  date: string;
  km: number;
  type: string;
  work: string;
  supplies: string;
  suppliesDetail?: SuppliesDetail;
  supplyItems?: SupplyItem[];
  suppliesLegacy?: string;
  amount: number;
  laborAmount?: number;
  notes: string;
  public: boolean;
  maintenance?: MaintenancePlan;
};
export const demoDate = '2026-10-21';
export const initialCustomers: Customer[] = [
  {
    id: 'c1',
    name: 'Juan Pérez',
    document: '32.456.789',
    phone: '11 2345-6789',
    email: 'juan.perez@example.com',
    address: 'Av. San Martín 1234, Buenos Aires',
    active: true,
    notes: 'Prefiere que lo contacten por la tarde.',
  },
  {
    id: 'c2',
    name: 'María González',
    document: '28.334.112',
    phone: '11 9876-5432',
    email: 'maria.gonzalez@example.com',
    address: 'Belgrano 482, Buenos Aires',
    active: true,
    notes: 'Vehículo de uso laboral.',
  },
  {
    id: 'c3',
    name: 'Carlos Ramírez',
    document: '26.112.334',
    phone: '11 3456-9876',
    email: 'carlos.ramirez@example.com',
    address: 'Rivadavia 2140, Buenos Aires',
    active: true,
    notes: '',
  },
  {
    id: 'c4',
    name: 'Lucía Torres',
    document: '31.998.221',
    phone: '11 6789-1234',
    email: 'lucia.torres@example.com',
    address: 'Moreno 356, Buenos Aires',
    active: true,
    notes: '',
  },
  {
    id: 'c5',
    name: 'Diego Fernández',
    document: '29.221.443',
    phone: '11 2233-4455',
    email: 'diego.fernandez@example.com',
    address: 'Sarmiento 918, Buenos Aires',
    active: false,
    notes: 'Cliente inactivo.',
  },
  {
    id: 'c6',
    name: 'Ana Gómez',
    document: '27.665.443',
    phone: '11 9988-7766',
    email: 'ana.gomez@example.com',
    address: 'Mitre 642, Buenos Aires',
    active: true,
    notes: '',
  },
  {
    id: 'c7',
    name: 'Martín Paz',
    document: '33.776.554',
    phone: '11 5566-7788',
    email: 'martin.paz@example.com',
    address: 'San Juan 1760, Buenos Aires',
    active: true,
    notes: '',
  },
  {
    id: 'c8',
    name: 'Sofía Vargas',
    document: '35.441.223',
    phone: '11 6677-8899',
    email: 'sofia.vargas@example.com',
    address: 'Lavalle 725, Buenos Aires',
    active: true,
    notes: '',
  },
];
export const initialVehicles: Vehicle[] = [
  {
    id: 'v1',
    customerId: 'c1',
    plate: 'AB 123 CD',
    brand: 'Volkswagen',
    model: 'Gol Trend',
    year: 2019,
    fuel: 'Nafta',
    engine: '1.6 MSI',
    km: 58400,
    color: 'silver',
    nextDate: '2026-12-15',
    nextKm: 68400,
    recommendation: 'Cambio de aceite y filtros',
  },
  {
    id: 'v2',
    customerId: 'c2',
    plate: 'AF 456 EF',
    brand: 'Toyota',
    model: 'Hilux SRX',
    year: 2021,
    fuel: 'Diésel',
    engine: '2.8 TD 4×4',
    km: 112300,
    color: 'white',
    nextDate: '2026-11-05',
    nextKm: 122300,
    recommendation: 'Cambio de aceite y filtros',
  },
  {
    id: 'v3',
    customerId: 'c3',
    plate: 'AC 789 GH',
    brand: 'Ford',
    model: 'Ranger XLT',
    year: 2020,
    fuel: 'Diésel',
    engine: '3.2 TDCi',
    km: 89200,
    color: 'blue',
    nextDate: '2026-10-10',
    nextKm: 89000,
    recommendation: 'Revisión de frenos',
  },
  {
    id: 'v4',
    customerId: 'c4',
    plate: 'AD 321 IJ',
    brand: 'Chevrolet',
    model: 'Onix LT',
    year: 2022,
    fuel: 'Nafta',
    engine: '1.0 Turbo',
    km: 45600,
    color: 'red',
    nextDate: '2027-01-20',
    nextKm: 55600,
    recommendation: 'Service general',
  },
  {
    id: 'v5',
    customerId: 'c5',
    plate: 'AE 654 KL',
    brand: 'Renault',
    model: 'Duster',
    year: 2020,
    fuel: 'Nafta',
    engine: '1.6 16V',
    km: 76800,
    color: 'silver',
    nextDate: '2026-11-12',
    nextKm: 77500,
    recommendation: 'Cambio de aceite',
  },
  {
    id: 'v6',
    customerId: 'c6',
    plate: 'AG 872 MN',
    brand: 'Peugeot',
    model: '208 Allure',
    year: 2023,
    fuel: 'Nafta',
    engine: '1.6 VTi',
    km: 23400,
    color: 'blue',
    nextDate: '2026-12-20',
    nextKm: 33400,
    recommendation: 'Service general',
  },
];
export const initialServices: Service[] = [
  {
    id: 's1',
    vehicleId: 'v2',
    date: '2026-10-05',
    km: 112300,
    type: 'Cambio de aceite',
    work: 'Cambio de aceite de motor y filtro. Control de niveles.',
    supplies: 'Motul 5W30 · Filtro original',
    amount: 58400,
    notes: 'Vehículo en buen estado.',
    public: true,
  },
  {
    id: 's2',
    vehicleId: 'v1',
    date: '2026-10-15',
    km: 58400,
    type: 'Service general',
    work: 'Cambio de aceite y filtros. Revisión de frenos.',
    supplies: 'Shell Helix HX8 5W30 · MANN W712/95',
    amount: 95300,
    notes: 'Controlar neumáticos en la próxima visita.',
    public: true,
  },
  {
    id: 's3',
    vehicleId: 'v2',
    date: '2026-07-15',
    km: 98200,
    type: 'Frenos',
    work: 'Reemplazo de pastillas delanteras y traseras.',
    supplies: 'Pastillas Bosch · Discos delanteros',
    amount: 124000,
    notes: 'Nota interna de ejemplo.',
    public: false,
  },
  {
    id: 's4',
    vehicleId: 'v2',
    date: '2026-04-28',
    km: 86450,
    type: 'Filtros',
    work: 'Cambio de filtro de aire y combustible.',
    supplies: 'Filtros MANN',
    amount: 36500,
    notes: '',
    public: true,
  },
  {
    id: 's5',
    vehicleId: 'v3',
    date: '2026-09-10',
    km: 89200,
    type: 'Revisión general',
    work: 'Diagnóstico de frenos y tren delantero.',
    supplies: 'Sin repuestos',
    amount: 28000,
    notes: '',
    public: true,
  },
  {
    id: 's6',
    vehicleId: 'v4',
    date: '2026-10-02',
    km: 45600,
    type: 'Service general',
    work: 'Cambio de aceite, filtros y control general.',
    supplies: 'Aceite 5W30 · Filtros originales',
    amount: 81000,
    notes: '',
    public: true,
  },
  {
    id: 's7',
    vehicleId: 'v2',
    date: '2025-12-12',
    km: 74120,
    type: 'Cambio de aceite',
    work: 'Cambio de aceite y filtro de aceite.',
    supplies: 'Motul 5W30',
    amount: 52300,
    notes: '',
    public: true,
  },
  {
    id: 's8',
    vehicleId: 'v2',
    date: '2025-09-03',
    km: 61800,
    type: 'Revisión general',
    work: 'Revisión de 60.000 km y control de niveles.',
    supplies: 'Sin repuestos',
    amount: 28000,
    notes: '',
    public: true,
  },
];
export type MaintenanceStatus = 'Al día' | 'Próximo' | 'Vencido' | 'Sin datos';
export function maintenanceStatus(vehicle: Vehicle, today = demoDate): MaintenanceStatus {
  return vehiclePlanStatus(vehicle, today);
}
export const number = (value: number) => new Intl.NumberFormat('es-AR').format(value);
export const money = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function customerCSV(customers: Customer[]) {
  const cell = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
  return (
    '\uFEFF' +
    [
      ['Nombre', 'Teléfono', 'Email', 'Estado'],
      ...customers.map((c) => [c.name, c.phone, c.email, c.active ? 'Activo' : 'Inactivo']),
    ]
      .map((row) => row.map(cell).join(';'))
      .join('\r\n')
  );
}
