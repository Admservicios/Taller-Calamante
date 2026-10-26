import { ProductPicker } from './ProductPicker';
import { productServiceItem } from '../lib/products';
import { useRef, useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { randomId } from '../lib/ids';
import {
  itemCents,
  itemMoney,
  supplyItemSchema,
  supplyUnits,
  totalItemCents,
  type SupplyItem,
} from '../lib/supplyItems';

export type SupplyDraft = Omit<SupplyItem, 'quantity' | 'unitPrice'> & {
  quantity: string;
  unitPrice: string;
};
export const draftItem = (item: SupplyItem): SupplyDraft => ({
  ...item,
  quantity: String(item.quantity),
  unitPrice: String(item.unitPrice),
});
export const parsedDraft = (draft: SupplyDraft) =>
  supplyItemSchema.safeParse({
    ...draft,
    quantity: draft.quantity.trim() ? Number(draft.quantity) : NaN,
    unitPrice: draft.unitPrice.trim() ? Number(draft.unitPrice) : NaN,
  });
export function SupplyItemsEditor({
  rows,
  onChange,
  legacy,
  onLegacyChange,
}: {
  rows: SupplyDraft[];
  onChange: (rows: SupplyDraft[]) => void;
  legacy: string;
  onLegacyChange: (value: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const catalogueButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const hadLegacy = useRef(!!legacy);
  const descriptions = useRef(new Map<string, HTMLInputElement>());
  const valid = rows.map(parsedDraft);
  const complete = valid.every((result) => result.success);
  const update = (id: string, key: keyof SupplyDraft, value: string) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  const add = () => {
    const id = randomId();
    onChange([
      ...rows,
      { id, code: '', description: '', quantity: '1', unit: 'Unidad', unitPrice: '' },
    ]);
    requestAnimationFrame(() => descriptions.current.get(id)?.focus());
  };
  return (
    <div className="supply-items-editor">
      {picking && (
        <ProductPicker
          close={() => {
            setPicking(false);
            requestAnimationFrame(() => catalogueButton.current?.focus());
          }}
          choose={(product) => {
            if (rows.length >= 30) return;
            const item = productServiceItem(product, randomId());
            onChange([...rows, draftItem(item)]);
            setPicking(false);
            requestAnimationFrame(() => descriptions.current.get(item.id)?.focus());
          }}
        />
      )}

      <div className="supply-items-toolbar">
        <p>Agregá los artículos utilizados. El precio es por unidad de medida.</p>
        <button
          ref={catalogueButton}
          type="button"
          className="button"
          disabled={rows.length >= 30}
          onClick={() => setPicking(true)}
        >
          <Package size={17} /> Agregar desde catálogo
        </button>
        <button
          ref={addButton}
          type="button"
          className="button"
          onClick={add}
          disabled={rows.length >= 30}
        >
          <Plus size={17} /> Agregar artículo manual
        </button>
      </div>
      {!rows.length ? (
        <div className="supply-items-empty">
          <Package size={24} />
          <span>Todavía no agregaste artículos.</span>
        </div>
      ) : (
        <table className="supply-items-table">
          <caption className="sr-only">Artículos utilizados en el servicio</caption>
          <colgroup>
            <col style={{ width: '12%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              {['Código', 'Artículo', 'Cantidad', 'Unidad', 'Precio unitario', 'Subtotal', ''].map(
                (name, i) => (
                  <th key={i}>{name || <span className="sr-only">Quitar</span>}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <label>
                    <span>
                      Código <span className="sr-only">artículo {index + 1}</span>
                    </span>
                    <input
                      aria-label={`Código artículo ${index + 1}`}
                      readOnly={!!row.productId}
                      maxLength={40}
                      value={row.code}
                      onChange={(e) => update(row.id, 'code', e.target.value)}
                      placeholder="Opcional"
                    />
                  </label>
                </td>
                <td>
                  <label>
                    <span>
                      Artículo <span className="sr-only">{index + 1}</span>
                    </span>
                    <input
                      aria-label={`Descripción artículo ${index + 1}`}
                      required
                      readOnly={!!row.productId}
                      maxLength={120}
                      value={row.description}
                      ref={(node) => {
                        if (node) descriptions.current.set(row.id, node);
                        else descriptions.current.delete(row.id);
                      }}
                      onChange={(e) => update(row.id, 'description', e.target.value)}
                      placeholder="Descripción / marca"
                    />
                  </label>
                  {row.productId && (
                    <button
                      type="button"
                      className="text-button product-unlink"
                      aria-label={`Desvincular artículo ${index + 1}`}
                      onClick={() =>
                        onChange(
                          rows.map((item) => {
                            if (item.id !== row.id) return item;
                            const { productId: _link, ...manual } = item;
                            return manual;
                          }),
                        )
                      }
                    >
                      Catálogo · pasar a manual
                    </button>
                  )}
                </td>
                <td>
                  <label>
                    <span>Cantidad</span>
                    <input
                      aria-label={`Cantidad artículo ${index + 1}`}
                      type="number"
                      inputMode="decimal"
                      required
                      min="0.001"
                      max="10000"
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) => update(row.id, 'quantity', e.target.value)}
                    />
                  </label>
                </td>
                <td>
                  <label>
                    <span>Unidad</span>
                    <select
                      aria-label={`Unidad artículo ${index + 1}`}
                      value={row.unit}
                      disabled={!!row.productId}
                      onChange={(e) => update(row.id, 'unit', e.target.value)}
                    >
                      {supplyUnits.map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                </td>
                <td>
                  <label>
                    <span>Precio unitario (ARS)</span>
                    <input
                      aria-label={`Precio unitario artículo ${index + 1}`}
                      type="number"
                      inputMode="decimal"
                      required
                      min="0"
                      max="9999999.99"
                      step="0.01"
                      value={row.unitPrice}
                      onChange={(e) => update(row.id, 'unitPrice', e.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                </td>
                <td className="supply-subtotal">
                  <span>Subtotal</span>
                  <output aria-label={`Subtotal artículo ${index + 1}`}>
                    {valid[index].success
                      ? itemMoney(itemCents(valid[index].data!))
                      : 'Por completar'}
                  </output>
                </td>
                <td>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Quitar artículo ${index + 1}`}
                    onClick={() => {
                      onChange(rows.filter((item) => item.id !== row.id));
                      requestAnimationFrame(() => {
                        const next = rows[index + 1] ?? rows[index - 1];
                        if (next) descriptions.current.get(next.id)?.focus();
                        else addButton.current?.focus();
                      });
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length >= 30 && (
        <p className="fine-print">Podés cargar hasta 30 artículos por servicio.</p>
      )}
      <div className="supply-items-total">
        <span>Total de insumos y repuestos</span>
        <output aria-label="Total de insumos y repuestos" aria-live="polite">
          {complete
            ? itemMoney(totalItemCents(valid.map((result) => result.data!)))
            : 'Por completar'}
        </output>
      </div>
      {!complete && (
        <p className="fine-print">
          Completá descripción, cantidad y precio de cada artículo para calcular el total.
        </p>
      )}
      <p className="fine-print">
        El importe final del servicio se carga aparte. Este total incluye únicamente los artículos
        de la lista.
      </p>
      {(hadLegacy.current || !!legacy) && (
        <div className="supply-legacy">
          <label>
            Detalle anterior de insumos
            <textarea
              rows={3}
              maxLength={10000}
              value={legacy}
              onChange={(e) => onLegacyChange(e.target.value)}
            />
          </label>
          <p className="fine-print">
            Este detalle no tiene cantidades ni precios y no se suma al total. Si lo pasás a la
            lista, retiralo de aquí para no repetirlo.
          </p>
        </div>
      )}
    </div>
  );
}
