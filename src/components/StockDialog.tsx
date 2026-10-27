import { StockNotice } from './StockNotice';
import { dateLabel } from '../lib/demo';
import { useState, type FormEvent } from 'react';
import { useData } from '../app/store';
import { Modal, ModalCancelButton } from './ui';
import {
  addStockMovement,
  stockBalance,
  stockQuantity,
  stockVersion,
  type StockMovement,
} from '../lib/inventory';
import { randomId } from '../lib/ids';
import type { Product } from '../lib/products';
export function StockDialog({ product, close }: { product: Product; close: () => void }) {
  const store = useData();
  const [version] = useState(() => stockVersion(store, product.id));
  const movements = (store.stockMovements ?? []).filter((row) => row.productId === product.id);
  const [kind, setKind] = useState(movements.length ? 'receipt' : 'opening');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const values = new FormData(event.currentTarget);
    const quantity = Number(values.get('quantity'));
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 1000000 ||
      Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.00001
    ) {
      setError('Ingresá una cantidad positiva con hasta tres decimales.');
      return;
    }
    const row: StockMovement = {
      id: randomId(),
      productId: product.id,
      unit: product.unit,
      at: new Date().toISOString(),
      kind: kind === 'minus' || kind === 'plus' ? 'adjustment' : (kind as 'opening' | 'receipt'),
      deltaMilli: Math.round(quantity * 1000) * (kind === 'minus' ? -1 : 1),
      reason: String(values.get('reason')).trim(),
    };
    try {
      addStockMovement(store, row, version);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Revisá el movimiento.');
      return;
    }
    setSaving(true);
    if (!(await store.saveStockMovement(row, version))) {
      setSaving(false);
      setError(
        'No se pudo guardar. El stock o la base pueden haber cambiado. Cerrá y reabrí el diálogo para revisar los datos actuales.',
      );
      return;
    }
    store.notify('Movimiento guardado. Las existencias se actualizaron.');
    close();
  };
  const labels = {
    opening: 'Saldo inicial',
    receipt: 'Ingreso',
    adjustment: 'Ajuste',
    service: 'Mantenimiento',
  };
  const pages = Math.max(1, Math.ceil(movements.length / 20));
  const currentPage = Math.min(page, pages);
  return (
    <Modal
      title={`Stock y movimientos · ${product.code}`}
      close={() => {
        if (!saving) close();
      }}
    >
      <div className="stock-balance">
        <span>Existencias registradas · {product.description}</span>
        <strong>
          {stockQuantity(stockBalance(store, product.id))} {product.unit}
        </strong>
        <StockNotice
          product={store.products?.find((current) => current.id === product.id) ?? product}
          balance={stockBalance(store, product.id)}
        />
      </div>
      <p className="fine-print">
        {kind === 'opening'
          ? 'Cargá la cantidad que tenés disponible hoy.'
          : kind === 'receipt'
            ? 'Ingresá la cantidad de producto que recibiste.'
            : 'El ajuste suma o resta esta cantidad al saldo registrado.'}
      </p>
      <form className="form-stack" onSubmit={submit}>
        <fieldset className="product-editor-fields" disabled={saving}>
          <div className="form-grid">
            <label>
              Tipo de movimiento
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                {!movements.length && <option value="opening">Saldo inicial</option>}
                <option value="receipt">Ingreso</option>
                <option value="plus">Ajuste positivo</option>
                <option value="minus">Ajuste negativo</option>
              </select>
            </label>
            <label>
              Cantidad ({product.unit}) <span>*</span>
              <input
                name="quantity"
                type="number"
                inputMode="decimal"
                required
                min="0.001"
                max="1000000"
                step="0.001"
              />
            </label>
          </div>
          <label>
            Motivo / referencia <span>*</span>
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="Ej.: inventario físico, compra o corrección de conteo…"
            />
          </label>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <ModalCancelButton className="button" type="button" onClick={close} disabled={saving}>
            Cancelar
          </ModalCancelButton>
          <button className="button primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
      <details className="help-details stock-history-details">
        <summary>Historial de movimientos ({movements.length})</summary>{' '}
        <h3 className="stock-history-heading">Historial de movimientos</h3>
        <p className="fine-print">
          Orden de registro, más recientes primero. Los movimientos se conservan; las correcciones
          agregan un nuevo ajuste.
        </p>
        {!movements.length ? (
          <p className="muted">Todavía no hay movimientos.</p>
        ) : (
          <ul className="stock-history">
            {[...movements]
              .reverse()
              .slice((currentPage - 1) * 20, currentPage * 20)
              .map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{labels[row.kind]}</strong>
                    <strong className={row.deltaMilli < 0 ? 'stock-out' : 'stock-in'}>
                      {row.deltaMilli > 0 ? '+' : ''}
                      {stockQuantity(row.deltaMilli)} {row.unit}
                    </strong>
                  </div>
                  <time dateTime={row.at}>
                    {new Date(row.at).toLocaleString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                    })}
                  </time>
                  <p>{row.reason}</p>
                  {row.serviceId &&
                    (() => {
                      const service = store.services.find(
                        (service) => service.id === row.serviceId,
                      );
                      const vehicle = store.vehicles.find(
                        (vehicle) => vehicle.id === service?.vehicleId,
                      );
                      return (
                        <small>
                          Servicio actual: {vehicle?.plate} ·{' '}
                          {service ? dateLabel(service.date) : ''} · {service?.type}
                        </small>
                      );
                    })()}
                </li>
              ))}
          </ul>
        )}
        {pages > 1 && (
          <nav className="stock-pages" aria-label="Páginas de movimientos">
            <button
              className="button small"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </button>
            <span>
              Página {currentPage} de {pages}
            </span>
            <button
              className="button small"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Siguiente
            </button>
          </nav>
        )}{' '}
      </details>
    </Modal>
  );
}
