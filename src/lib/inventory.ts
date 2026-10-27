import { z } from 'zod';
import type { LocalData } from './localDatabase';
import type { Service } from './demo';
import { supplyUnits } from './supplyItems';
import { randomId } from './ids';
export const stockMovementSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    productId: z.string().min(1).max(100),
    unit: z.enum(supplyUnits),
    at: z.iso.datetime(),
    deltaMilli: z
      .number()
      .int()
      .min(-1000000000)
      .max(1000000000)
      .refine((value) => value !== 0),
    kind: z.enum(['opening', 'receipt', 'adjustment', 'service']),
    reason: z.string().trim().min(3).max(500),
    serviceId: z.string().min(1).max(100).optional(),
  })
  .refine(
    (movement) =>
      (movement.kind === 'service') === !!movement.serviceId &&
      (!['opening', 'receipt'].includes(movement.kind) || movement.deltaMilli > 0),
    'El movimiento no es válido.',
  );
export type StockMovement = z.infer<typeof stockMovementSchema>;
export const stockQuantity = (milli: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(milli / 1000);
export const stockBalance = (data: Pick<LocalData, 'stockMovements'>, productId: string) =>
  (data.stockMovements ?? []).reduce(
    (total, movement) => total + (movement.productId === productId ? movement.deltaMilli : 0),
    0,
  );
export const stockVersion = (data: Pick<LocalData, 'stockMovements'>, productId: string) => {
  const rows = (data.stockMovements ?? []).filter((row) => row.productId === productId);
  return `${rows.length}:${rows.at(-1)?.id ?? ''}`;
};
export function stockDemand(service: Service) {
  const demand = new Map<string, number>();
  if (service.stockManaged && !service.annulment)
    for (const item of service.supplyItems ?? [])
      if (item.productId)
        demand.set(
          item.productId,
          (demand.get(item.productId) ?? 0) + Math.round(item.quantity * 1000),
        );
  return demand;
}
export function inventoryIssue(data: LocalData): string | undefined {
  const rows = data.stockMovements ?? [];
  const products = new Map((data.products ?? []).map((product) => [product.id, product]));
  const services = new Map(data.services.map((service) => [service.id, service]));
  const ids = new Set<string>();
  const balances = new Map<string, number>();
  const net = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const product = products.get(row.productId);
    if (
      ids.has(row.id) ||
      !product ||
      product.unit !== row.unit ||
      (row.kind === 'opening' && balances.has(row.productId))
    )
      return 'El historial de stock tiene referencias, unidades o saldos iniciales inválidos.';
    ids.add(row.id);
    const balance = (balances.get(row.productId) ?? 0) + row.deltaMilli;
    if (balance < 0 || balance > 1000000000000)
      return 'El historial de stock contiene un saldo fuera de los límites permitidos.';
    balances.set(row.productId, balance);
    if (row.serviceId) {
      if (!services.get(row.serviceId)?.stockManaged)
        return 'Un movimiento de stock no corresponde a un servicio con control de existencias.';
      const byProduct = net.get(row.serviceId) ?? new Map<string, number>();
      const serviceNet = (byProduct.get(row.productId) ?? 0) + row.deltaMilli;
      if (serviceNet > 0) return 'Un servicio tiene devoluciones superiores a sus consumos.';
      byProduct.set(row.productId, serviceNet);
      net.set(row.serviceId, byProduct);
    }
  }
  for (const service of data.services) {
    if (service.stockManaged) {
      if (
        service.supplyItems?.some(
          (item) => item.productId && item.unit !== products.get(item.productId)?.unit,
        )
      )
        return 'La unidad de un artículo no coincide con la del producto en stock.';
      const demand = stockDemand(service);
      const actual = net.get(service.id) ?? new Map<string, number>();
      for (const productId of new Set([...demand.keys(), ...actual.keys()]))
        if ((actual.get(productId) ?? 0) !== -(demand.get(productId) ?? 0))
          return 'Los movimientos de stock no coinciden con los artículos del servicio.';
    }
  }
}
export function applyServiceStock(
  before: LocalData,
  after: LocalData,
  service: Service,
): LocalData {
  const current = new Map<string, number>();
  for (const row of before.stockMovements ?? [])
    if (row.serviceId === service.id)
      current.set(row.productId, (current.get(row.productId) ?? 0) + row.deltaMilli);
  const demand = stockDemand(service);
  const changes: StockMovement[] = [];
  const at = new Date().toISOString();
  const previousService = before.services.find((row) => row.id === service.id);
  if (
    service.stockManaged &&
    service.supplyItems?.some(
      (item) =>
        item.productId && item.unit !== before.products?.find((p) => p.id === item.productId)?.unit,
    )
  )
    throw new Error(
      'La unidad del producto cambió. Revisá los artículos del catálogo antes de guardar.',
    );
  for (const productId of new Set([...current.keys(), ...demand.keys()])) {
    const deltaMilli = -(demand.get(productId) ?? 0) - (current.get(productId) ?? 0);
    if (!deltaMilli) continue;
    const product = before.products?.find((product) => product.id === productId);
    if (!product) throw new Error('No encontramos el producto del movimiento de stock.');
    const available = stockBalance(before, productId);
    if (available + deltaMilli < 0)
      throw new Error(
        `Stock insuficiente para ${product.code}. Disponible: ${stockQuantity(available)} ${product.unit}. Revisá la cantidad o registrá un ingreso en Productos.`,
      );
    changes.push({
      id: randomId(),
      productId,
      unit: product.unit,
      at,
      deltaMilli,
      kind: 'service',
      serviceId: service.id,
      reason: service.annulment
        ? 'Devolución por anulación del servicio'
        : previousService?.annulment
          ? 'Consumo por recuperación del servicio'
          : previousService
            ? 'Ajuste por corrección del servicio'
            : 'Consumo de mantenimiento',
    });
  }
  return changes.length
    ? {
        ...after,
        stockMovements: [
          ...(before.stockMovements ?? []),
          ...changes.sort((a, b) => b.deltaMilli - a.deltaMilli),
        ],
      }
    : after;
}
export function addStockMovement(
  data: LocalData,
  movement: StockMovement,
  expectedVersion: string,
): LocalData {
  const row = stockMovementSchema.parse(movement);
  if (row.kind === 'service') throw new Error('Los consumos se registran desde el mantenimiento.');
  const product = data.products?.find((product) => product.id === row.productId);
  if (!product || product.unit !== row.unit)
    throw new Error('El producto o su unidad cambió. Cerrá y reabrí Stock y movimientos.');
  if (stockVersion(data, row.productId) !== expectedVersion)
    throw new Error(
      'El stock cambió. Cerrá y reabrí Stock y movimientos para revisar el saldo actual.',
    );
  if (stockBalance(data, row.productId) + row.deltaMilli < 0)
    throw new Error(
      `El ajuste dejaría el saldo de stock negativo. Disponible: ${stockQuantity(stockBalance(data, row.productId))} ${product.unit}.`,
    );
  const next = { ...data, stockMovements: [...(data.stockMovements ?? []), row] };
  const issue = inventoryIssue(next);
  if (issue) throw new Error(issue);
  return next;
}
