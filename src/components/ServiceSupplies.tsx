import { Package } from 'lucide-react';
import type { Service } from '../lib/demo';
import { itemCents, itemMoney, totalItemCents, legacySupplyText } from '../lib/supplyItems';
const quantity = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
export function ServiceSupplies({ service }: { service: Service }) {
  const items = service.supplyItems ?? [];
  const legacy = legacySupplyText(service);
  return (
    <section className="service-supplies" aria-label="Insumos y repuestos del mantenimiento">
      <h3>
        <Package size={18} /> Insumos y repuestos
      </h3>
      {items.length > 0 && (
        <>
          <div className="table-scroll">
            <table aria-label="Artículos utilizados">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Artículo">
                      <strong>{item.description}</strong>
                      {item.code && <small className="supply-detail-code">{item.code}</small>}
                    </td>
                    <td data-label="Cantidad">
                      {quantity.format(item.quantity)} <span className="muted">{item.unit}</span>
                    </td>
                    <td data-label="Precio unitario">
                      {itemMoney(Math.round(item.unitPrice * 100))}
                    </td>
                    <td data-label="Subtotal">
                      <strong>{itemMoney(itemCents(item))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="service-supplies-total">
            <span>Total de insumos y repuestos</span>
            <strong>{itemMoney(totalItemCents(items))}</strong>
          </div>
        </>
      )}
      {legacy && (
        <div className="service-supplies-legacy">
          {items.length > 0 && <h4>Detalle anterior de insumos · sin valorizar</h4>}
          <p>{legacy}</p>
        </div>
      )}
      {!items.length && !legacy && <p className="muted">Sin insumos registrados.</p>}
    </section>
  );
}
