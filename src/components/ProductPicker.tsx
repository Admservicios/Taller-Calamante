import { useState } from 'react';
import { Search } from 'lucide-react';
import { Modal, Empty } from './ui';
import { useData } from '../app/store';
import { searchProducts, type Product } from '../lib/products';
import { itemMoney } from '../lib/supplyItems';
export function ProductPicker({
  choose,
  close,
}: {
  choose: (product: Product) => void;
  close: () => void;
}) {
  const { products = [] } = useData();
  const [search, setSearch] = useState('');
  const filtered = searchProducts(products, search);
  return (
    <Modal title="Agregar desde catálogo" close={close} protectChanges={false}>
      <div
        className="product-picker"
        onChange={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement)
            event.preventDefault();
        }}
      >
        <label>
          Buscar producto
          <input
            autoFocus
            type="search"
            placeholder="Código, descripción o marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <p className="fine-print">
          Se agrega una unidad con el precio sugerido actual. Podés ajustar cantidad y precio en el
          servicio.
        </p>
        <ul>
          {filtered.slice(0, 50).map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="product-choice"
                aria-label={`Agregar ${product.code}`}
                onClick={() => choose(product)}
              >
                <Search size={17} />
                <span>
                  <strong>
                    {product.code} · {product.description}
                  </strong>
                  <small>
                    {product.brand || 'Sin marca'} · {product.unit}
                  </small>
                </span>
                <strong>{itemMoney(Math.round(product.unitPrice * 100))}</strong>
              </button>
            </li>
          ))}
        </ul>
        {!filtered.length && (
          <Empty
            text={
              products.some((product) => product.active)
                ? 'No encontramos productos activos'
                : 'No hay productos activos. Cargalos en Productos o agregá un artículo manual.'
            }
          />
        )}
        {filtered.length > 50 && (
          <p className="fine-print">
            Mostrando 50 de {filtered.length}. Escribí para acotar la búsqueda.
          </p>
        )}
        <button type="button" className="button" onClick={close}>
          Cerrar catálogo
        </button>
      </div>
    </Modal>
  );
}
