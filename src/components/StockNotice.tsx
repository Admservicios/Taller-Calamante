import type { Product } from '../lib/products';
import { stockQuantity } from '../lib/inventory';
import { stockAlert } from '../lib/stockAlerts';
export function StockNotice({ product, balance }: { product: Product; balance: number }) {
  const alert = stockAlert(product, balance);
  return (
    <span className="stock-notice">
      {product.minimumStock !== undefined && (
        <small>
          Mínimo: {stockQuantity(Math.round(product.minimumStock * 1000))} {product.unit}
        </small>
      )}
      {alert && <span className={`badge ${balance === 0 ? 'red' : 'amber'}`}>{alert}</span>}
    </span>
  );
}
