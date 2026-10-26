import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Pencil, Plus, Search, Check } from 'lucide-react';
import { useData } from '../app/store';
import { Modal, ModalCancelButton, PageTitle, Empty, Badge } from '../components/ui';
import { productSchema, saveProductData, searchProducts, type Product } from '../lib/products';
import { supplyUnits, itemMoney } from '../lib/supplyItems';
import { randomId } from '../lib/ids';

export function ProductEditor({ original, close }: { original?: Product; close: () => void }) {
  const store = useData();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const result = productSchema.safeParse({
      id: original?.id ?? randomId(),
      code: data.get('code'),
      description: data.get('description'),
      brand: data.get('brand'),
      unit: data.get('unit'),
      unitPrice: Number(data.get('unitPrice')),
      active: data.get('active') === 'on',
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    try {
      saveProductData(store, result.data, original);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Revisá los datos.');
      return;
    }
    setSaving(true);
    if (!(await store.saveProduct(result.data, original))) {
      setSaving(false);
      setError(
        'No se pudo guardar. Los datos del formulario se conservan. Si el catálogo cambió en otra pestaña o dispositivo, cerrá y volvé a abrir el editor.',
      );
      return;
    }
    store.notify(
      `${original ? 'Producto actualizado' : 'Producto creado'}${store.mode === 'demo' ? ' en la demostración' : ''}. Los artículos de servicios anteriores conservan sus datos y precios.`,
    );
    close();
  };
  return (
    <Modal
      title={original ? 'Editar producto' : 'Nuevo producto'}
      close={() => {
        if (!saving) close();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <p className="muted">
          El precio se sugiere al agregar el producto a un servicio. Los servicios ya cargados
          conservan su precio.
        </p>
        <fieldset disabled={saving} className="product-editor-fields">
          <div className="form-grid">
            <label>
              Código <span>*</span>
              <input name="code" required maxLength={40} defaultValue={original?.code} />
            </label>
            <label>
              Marca
              <input name="brand" maxLength={40} defaultValue={original?.brand} />
            </label>
          </div>
          <label>
            Descripción <span>*</span>
            <input
              name="description"
              required
              maxLength={100}
              defaultValue={original?.description}
            />
          </label>
          <div className="form-grid">
            <label>
              Unidad de medida
              <select name="unit" defaultValue={original?.unit ?? 'Unidad'}>
                {supplyUnits.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              Precio sugerido (ARS) <span>*</span>
              <input
                name="unitPrice"
                type="number"
                inputMode="decimal"
                required
                min="0"
                max="9999999.99"
                step="0.01"
                defaultValue={original?.unitPrice}
                placeholder="0,00"
              />
            </label>
          </div>
          <label className="check-label">
            <input type="checkbox" name="active" defaultChecked={original?.active ?? true} />{' '}
            Producto activo
          </label>
        </fieldset>
        <p className="fine-print">
          Desactivar lo retira del buscador de nuevos artículos. Sus usos anteriores se conservan.
        </p>
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
            <Check size={17} />
            {saving ? 'Guardando…' : 'Guardar producto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Products() {
  const { products = [] } = useData();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const search = params.get('buscar') ?? '';
  const status = ['todos', 'inactivos'].includes(params.get('estado') ?? '')
    ? params.get('estado')!
    : 'activos';
  const size = [20, 50, 100].includes(Number(params.get('cantidad')))
    ? Number(params.get('cantidad'))
    : 20;
  const change = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        value ? next.set(key, value) : next.delete(key);
        if (key !== 'pagina') next.delete('pagina');
        return next;
      },
      { replace: true, flushSync: true },
    );
  const filtered = searchProducts(products, search, status);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const requested = Number(params.get('pagina') ?? 1);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  return (
    <>
      <PageTitle
        title="Catálogo de productos"
        subtitle="Repuestos e insumos con sus precios sugeridos para cargar servicios."
        actions={
          <button className="button primary" onClick={() => setEditing('new')}>
            <Plus size={18} /> Nuevo producto
          </button>
        }
      />
      <div className="filter-bar product-filters">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar productos"
            placeholder="Código, descripción o marca…"
            value={search}
            onChange={(e) => change('buscar', e.target.value)}
          />
        </div>
        <select
          aria-label="Estado de los productos"
          value={status}
          onChange={(e) => change('estado', e.target.value)}
        >
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <button
          className="text-button"
          onClick={() =>
            setParams(
              (current) => {
                const next = new URLSearchParams(current);
                for (const key of ['buscar', 'estado', 'pagina']) next.delete(key);
                return next;
              },
              { replace: true, flushSync: true },
            )
          }
        >
          Limpiar filtros
        </button>
      </div>
      <div className="product-grid">
        {filtered.slice((page - 1) * size, page * size).map((product) => (
          <article key={product.id} className="panel product-card">
            <div>
              <span className="product-code">
                <Package size={16} />
                {product.code}
              </span>
              <Badge>{product.active ? 'Activo' : 'Inactivo'}</Badge>
            </div>
            <h2>{product.description}</h2>
            <p className="muted">{product.brand || 'Sin marca especificada'}</p>
            <div>
              <strong>
                {itemMoney(Math.round(product.unitPrice * 100))}{' '}
                <small>/ {product.unit.toLocaleLowerCase('es')}</small>
              </strong>
              <button
                className="button small"
                aria-label={`Editar producto ${product.code}`}
                onClick={() => setEditing(product)}
              >
                <Pencil size={15} /> Editar
              </button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <Empty
          text={
            products.length
              ? 'No encontramos productos'
              : 'Todavía no cargaste productos en el catálogo'
          }
        />
      )}
      <div className="history-pagination">
        <span>{filtered.length} productos encontrados</span>
        <nav aria-label="Páginas de productos">
          <button
            className="button small"
            disabled={page <= 1}
            onClick={() => change('pagina', String(page - 1))}
          >
            Anterior
          </button>
          <span aria-live="polite">
            Página {page} de {pages}
          </span>
          <button
            className="button small"
            disabled={page >= pages}
            onClick={() => change('pagina', String(page + 1))}
          >
            Siguiente
          </button>
        </nav>
        <label>
          Productos por página
          <select value={size} onChange={(e) => change('cantidad', e.target.value)}>
            {[20, 50, 100].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {editing && (
        <ProductEditor
          original={editing === 'new' ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
    </>
  );
}
