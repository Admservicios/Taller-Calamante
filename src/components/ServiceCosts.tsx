import { serviceAdjustmentCents } from '../lib/serviceCosts';
import { amountCents } from '../lib/maintenanceReport';
import type { Service } from '../lib/demo';
import { itemMoney, totalItemCents } from '../lib/supplyItems';
export function ServiceCosts({ service }: { service: Service }) {
  const adjustment = serviceAdjustmentCents(service);
  return (
    <section className="service-costs" aria-label="Importe del mantenimiento">
      <h3>Importe del servicio</h3>
      <dl>
        <div>
          <dt>Insumos valorizados</dt>
          <dd>
            {service.supplyItems === undefined
              ? 'Sin desglose'
              : itemMoney(totalItemCents(service.supplyItems))}
          </dd>
        </div>
        <div>
          <dt>Mano de obra incluida</dt>
          <dd>
            {service.laborAmount === undefined
              ? 'Sin registrar'
              : itemMoney(amountCents(service.laborAmount))}
          </dd>
        </div>
        {adjustment !== undefined && adjustment !== 0 && (
          <div>
            <dt>Ajuste / descuento</dt>
            <dd>{itemMoney(adjustment)}</dd>
          </div>
        )}
        <div className="service-costs-final">
          <dt>Total del servicio</dt>
          <dd>{itemMoney(amountCents(service.amount))}</dd>
        </div>
      </dl>
    </section>
  );
}
