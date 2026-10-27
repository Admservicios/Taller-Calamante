import type { Product } from './products';

export function stockAlert(product: Product, balanceMilli: number) {
  if (!product.active || product.minimumStock === undefined) return undefined;
  if (balanceMilli === 0) return 'Sin existencias' as const;
  return balanceMilli <= Math.round(product.minimumStock * 1000) ? ('Reponer' as const) : undefined;
}

// Un recorrido de los movimientos para todo el catálogo, sin repetirlo por producto.
export function replenishmentProducts(
  data: Pick<import('./localDatabase').LocalData, 'products' | 'stockMovements'>,
) {
  const balances = new Map<string, number>();
  for (const movement of data.stockMovements ?? [])
    balances.set(movement.productId, (balances.get(movement.productId) ?? 0) + movement.deltaMilli);
  return (data.products ?? []).filter((product) =>
    stockAlert(product, balances.get(product.id) ?? 0),
  );
}
