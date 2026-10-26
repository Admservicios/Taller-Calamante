import { z } from 'zod';
import type { Service } from './demo';

const precision = (value: number, scale: number) =>
  Math.abs(value * scale - Math.round(value * scale)) < 0.00001;
export const supplyUnits = ['Unidad', 'Litro', 'Kilogramo', 'Metro', 'Juego'] as const;
export const supplyItemSchema = z.strictObject({
  id: z.string().min(1).max(100),
  productId: z.string().min(1).max(100).optional(),
  code: z.string().trim().max(40),
  description: z.string().trim().min(1, 'Completá la descripción del artículo.').max(120),
  quantity: z
    .number()
    .positive()
    .max(10000)
    .refine((value) => precision(value, 1000), 'Usá hasta tres decimales para la cantidad.'),
  unit: z.enum(supplyUnits),
  unitPrice: z
    .number()
    .min(0)
    .max(9999999.99)
    .refine((value) => precision(value, 100), 'Usá hasta dos decimales para el precio.'),
});
export const supplyItemsSchema = z
  .array(supplyItemSchema)
  .max(30)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Hay artículos con identificadores repetidos.',
  );
export type SupplyItem = z.infer<typeof supplyItemSchema>;
export const itemCents = (item: SupplyItem): number =>
  Number(
    (BigInt(Math.round(item.quantity * 1000)) * BigInt(Math.round(item.unitPrice * 100)) + 500n) /
      1000n,
  );
export const totalItemCents = (items: SupplyItem[]) =>
  items.reduce((sum, item) => sum + itemCents(item), 0);
const quantityFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const currencyFormat = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const itemMoney = (cents: number) => currencyFormat.format(cents / 100);
export function supplyItemsSummary(items: SupplyItem[], legacy = '', includePrices = true): string {
  if (!items.length && legacy) return legacy;
  return (
    [
      ...items.map(
        (item) =>
          `${item.code ? `${item.code} · ` : ''}${item.description} | ${quantityFormat.format(item.quantity)} ${item.unit}${includePrices ? ` × ${itemMoney(Math.round(item.unitPrice * 100))} = ${itemMoney(itemCents(item))}` : ''}`,
      ),
      ...(items.length && includePrices
        ? [`Total de insumos y repuestos: ${itemMoney(totalItemCents(items))}`]
        : []),
      ...(legacy ? [`Detalle anterior de insumos (sin valorizar): ${legacy}`] : []),
    ].join('\n') || 'Sin insumos registrados'
  );
}
export const legacySupplyText = (service?: Service) =>
  service?.supplyItems !== undefined
    ? (service.suppliesLegacy ?? '')
    : service?.supplies === 'Sin insumos registrados'
      ? ''
      : (service?.supplies ?? '');
export function saveSupplyItems(items: SupplyItem[], legacy: string, original?: Service) {
  if (
    original &&
    original.supplyItems === undefined &&
    !items.length &&
    legacy === legacySupplyText(original)
  )
    return {
      supplies: original.supplies,
      ...(original.suppliesDetail ? { suppliesDetail: original.suppliesDetail } : {}),
    };
  const clean = legacy.trim();
  return {
    supplyItems: items.map((item) => ({ ...item })),
    suppliesLegacy: clean,
    supplies: supplyItemsSummary(items, clean),
  };
}
export const serviceSuppliesText = (service: Service, includePrices = true) =>
  service.supplyItems !== undefined
    ? supplyItemsSummary(service.supplyItems, service.suppliesLegacy, includePrices)
    : service.supplies;
