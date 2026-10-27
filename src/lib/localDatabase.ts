import { stockMovementSchema, inventoryIssue, type StockMovement } from './inventory';
import { productSchema, productCode, type Product } from './products';
import { supplyItemsSchema, supplyItemsSummary } from './supplyItems';
import { suppliesDetailSchema, suppliesSummary } from './maintenanceEntry';
import { z } from 'zod';
import type { Customer, Service, Vehicle } from './demo';
import { photoReferenceSchema, type PhotoReference } from './photos';
import { maintenancePlanSchema } from './maintenancePlans';
import {
  documentReferenceSchema,
  MAX_DOCUMENTS,
  MAX_VEHICLE_DOCUMENTS,
  type DocumentReference,
} from './documents';

// Se conservan los identificadores originales para leer los datos y respaldos existentes.
export const DATABASE_KEY = 'motortrack-local-database-v1';
export const SAFETY_COPY_KEY = 'motortrack-before-restore-v1';
export const VIEW_MODE_KEY = 'motortrack-view-mode';
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const id = z.string().min(1).max(100);
const text = (max: number) => z.string().max(max);
const customerSchema = z.strictObject({
  id,
  name: z.string().trim().min(1).max(100),
  document: text(25),
  phone: text(30),
  email: z.union([z.literal(''), z.email().max(150)]),
  address: text(200),
  active: z.boolean(),
  notes: text(500),
});
const vehicleSchema = z.strictObject({
  id,
  customerId: id,
  plate: z.string().trim().min(1).max(12),
  brand: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(70),
  year: z.number().int().min(1900).max(2200),
  fuel: text(30),
  engine: text(60),
  km: z.number().int().min(0).max(9999999),
  color: text(30),
  nextDate: z.iso.date(),
  nextKm: z.number().int().min(1).max(9999999),
  recommendation: text(150),
  maintenancePlans: z.array(maintenancePlanSchema).max(100).optional(),
  manualKm: z.number().int().min(0).max(9999999).optional(),
});
const serviceSchema = z
  .strictObject({
    id,
    stockManaged: z.literal(true).optional(),
    vehicleId: id,
    date: z.iso.date(),
    km: z.number().int().min(0).max(9999999),
    type: z.string().trim().min(1).max(100),
    work: text(2000),
    supplies: text(20000),
    supplyItems: supplyItemsSchema.optional(),
    suppliesLegacy: text(10000).optional(),
    suppliesDetail: suppliesDetailSchema.optional(),
    amount: z.number().min(0).max(999999999),
    notes: text(500),
    public: z.boolean(),
    maintenance: maintenancePlanSchema.optional(),
    annulment: z
      .strictObject({ at: z.iso.datetime(), reason: z.string().trim().min(3).max(500) })
      .optional(),
    changes: z
      .array(
        z.strictObject({
          at: z.iso.datetime(),
          action: z.enum(['created', 'edited', 'annulled', 'restored']),
          reason: z.string().max(500).optional(),
          changes: z
            .array(
              z.strictObject({
                field: z.string().max(100),
                before: z.string().max(30000),
                after: z.string().max(30000),
              }),
            )
            .max(30),
        }),
      )
      .max(1000)
      .optional(),
  })
  .refine(
    (service) =>
      service.supplyItems !== undefined
        ? !service.suppliesDetail &&
          supplyItemsSummary(service.supplyItems, service.suppliesLegacy) === service.supplies
        : service.suppliesLegacy === undefined &&
          (!service.suppliesDetail || suppliesSummary(service.suppliesDetail) === service.supplies),
    {
      message: 'El detalle de los insumos no coincide con su resumen.',
      path: ['suppliesDetail'],
    },
  );
export const workshopSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  phone: text(30),
  email: z.union([z.literal(''), z.email().max(150)]),
  address: text(200),
  currency: z.literal('ARS'),
  timezone: z.literal('America/Argentina/Buenos_Aires'),
});
export type Workshop = z.infer<typeof workshopSchema>;
export type LocalData = {
  stockMovements?: StockMovement[];
  products?: Product[];
  customers: Customer[];
  vehicles: Vehicle[];
  services: Service[];
  workshop: Workshop;
  photoSet?: string;
  photos?: PhotoReference[];
  documentSet?: string;
  documents?: DocumentReference[];
};
export const dataSchema = z
  .strictObject({
    stockMovements: z.array(stockMovementSchema).max(100000).optional(),
    products: z.array(productSchema).max(20000).optional(),
    customers: z.array(customerSchema).max(20000),
    vehicles: z.array(vehicleSchema).max(20000),
    services: z.array(serviceSchema).max(50000),
    workshop: workshopSchema,
    photoSet: id.optional(),
    photos: z.array(photoReferenceSchema).max(1000).optional(),
    documentSet: z.uuid().optional(),
    documents: z.array(documentReferenceSchema).max(MAX_DOCUMENTS).optional(),
  })
  .superRefine((data, context) => {
    const stockError = inventoryIssue(data);
    if (stockError) context.addIssue({ code: 'custom', message: stockError });
    const products = data.products ?? [];
    const productIds = new Set(products.map((product) => product.id));
    if (
      productIds.size !== products.length ||
      new Set(products.map((product) => productCode(product.code))).size !== products.length ||
      data.services.some((service) =>
        service.supplyItems?.some((item) => item.productId && !productIds.has(item.productId)),
      )
    )
      context.addIssue({
        code: 'custom',
        message:
          'El catálogo tiene códigos o identificadores repetidos, o artículos con referencias de producto inválidas.',
      });
    const customers = new Set(data.customers.map((c) => c.id));
    const vehicles = new Set(data.vehicles.map((v) => v.id));
    const services = new Set(data.services.map((s) => s.id));
    const photos = data.photos ?? [];
    const documents = data.documents ?? [];
    if (
      (documents.length > 0 && !data.documentSet) ||
      new Set(documents.map((d) => d.id)).size !== documents.length ||
      documents.some((d) => !vehicles.has(d.vehicleId)) ||
      data.vehicles.some(
        (v) => documents.filter((d) => d.vehicleId === v.id).length > MAX_VEHICLE_DOCUMENTS,
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Las referencias de los documentos no son válidas.',
      });
    if (
      data.vehicles.some(
        (v) =>
          v.maintenancePlans &&
          (new Set(v.maintenancePlans.map((p) => p.category)).size !== v.maintenancePlans.length ||
            v.maintenancePlans.some((p) => p.lastKm !== undefined && p.lastKm > v.km)),
      ) ||
      data.services.some(
        (s) =>
          s.maintenance && (s.maintenance.lastDate !== s.date || s.maintenance.lastKm !== s.km),
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Los vencimientos por servicio no son válidos.',
      });
    if (
      (photos.length > 0 && !data.photoSet) ||
      new Set(photos.map((p) => p.id)).size !== photos.length ||
      photos.some((p) => !services.has(p.serviceId)) ||
      data.services.some((s) => photos.filter((p) => p.serviceId === s.id).length > 6)
    ) {
      context.addIssue({ code: 'custom', message: 'Las referencias de las fotos no son válidas.' });
    }
    if (
      customers.size !== data.customers.length ||
      vehicles.size !== data.vehicles.length ||
      services.size !== data.services.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'El archivo contiene identificadores duplicados.',
      });
    }
    const plates = data.vehicles.map((v) => v.plate.toUpperCase().replace(/\s/g, ''));
    if (new Set(plates).size !== plates.length)
      context.addIssue({ code: 'custom', message: 'Hay patentes duplicadas.' });
    if (
      data.vehicles.some((v) => !customers.has(v.customerId)) ||
      data.services.some((s) => !vehicles.has(s.vehicleId))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Hay vehículos o mantenimientos sin un registro asociado válido.',
      });
    }
    if (
      data.services.some(
        (s) =>
          !s.annulment && s.km > (data.vehicles.find((v) => v.id === s.vehicleId)?.km ?? Infinity),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Un servicio supera el último kilometraje del vehículo.',
      });
    }
  });
export const databaseSchema = z.strictObject({
  format: z.literal('motortrack-local'),
  version: z.literal(1),
  revision: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
  data: dataSchema,
});
export type LocalDatabase = z.infer<typeof databaseSchema>;
export const backupSchema = z.strictObject({
  format: z.literal('motortrack-backup'),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  data: dataSchema,
});
export type LocalBackup = z.infer<typeof backupSchema>;
export function emptyData(): LocalData {
  return {
    customers: [],
    vehicles: [],
    services: [],
    workshop: {
      name: 'Taller Calamante',
      phone: '',
      email: '',
      address: '',
      currency: 'ARS',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  };
}
export function newDatabase(data = emptyData(), revision = 0): LocalDatabase {
  return databaseSchema.parse({
    format: 'motortrack-local',
    version: 1,
    revision,
    updatedAt: new Date().toISOString(),
    data,
  });
}
export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
export type DatabaseState = { database: LocalDatabase; raw: string | null; error: string | null };
export function loadDatabase(storage: StoragePort): DatabaseState {
  let raw: string | null = null;
  try {
    raw = storage.getItem(DATABASE_KEY);
    return {
      database: raw === null ? newDatabase() : databaseSchema.parse(JSON.parse(raw)),
      raw,
      error: null,
    };
  } catch {
    return {
      database: newDatabase(),
      raw,
      error:
        'No se pudo leer la base local. No se sobrescribió nada. Descargá una copia y restaurá un respaldo válido.',
    };
  }
}
export function persistDatabase(
  storage: StoragePort,
  expectedRaw: string | null,
  data: LocalData,
  revision: number,
  safetyCopy = false,
) {
  const current = storage.getItem(DATABASE_KEY);
  if (current !== expectedRaw)
    throw new Error(
      'Los datos cambiaron en otra pestaña. Recargá la página y revisá los registros antes de guardar.',
    );
  const database = newDatabase(data, revision + 1);
  const raw = JSON.stringify(database);
  if (safetyCopy && current !== null) storage.setItem(SAFETY_COPY_KEY, current);
  storage.setItem(DATABASE_KEY, raw);
  return { database, raw, error: null } satisfies DatabaseState;
}
export function makeBackup(data: LocalData): LocalBackup {
  return backupSchema.parse({
    format: 'motortrack-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  });
}
export function parseBackup(content: string): LocalBackup {
  if (new TextEncoder().encode(content).byteLength > MAX_BACKUP_BYTES)
    throw new Error('El respaldo supera el límite de 5 MB.');
  try {
    const value: unknown = JSON.parse(content);
    const backup = backupSchema.safeParse(value);
    if (backup.success) return backup.data;
    const internal = databaseSchema.parse(value);
    return backupSchema.parse({
      format: 'motortrack-backup',
      version: 1,
      exportedAt: internal.updatedAt,
      data: internal.data,
    });
  } catch {
    throw new Error(
      'Respaldo inválido o versión no compatible. Revisá el formato, las patentes y las relaciones entre registros.',
    );
  }
}
export function localToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-');
}
export function nextServiceDate(from: string): string {
  const date = new Date(`${from}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 6);
  return date.toISOString().slice(0, 10);
}
