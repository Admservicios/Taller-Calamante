import { z } from 'zod';
import { supplyItemSchema, type SupplyItem } from './supplyItems';
import type { LocalData } from './localDatabase';
export const productSchema = z
  .strictObject({
    id: z.string().min(1).max(100),
    code: z.string().trim().min(1, 'Completá el código del producto.').max(40),
    description: z.string().trim().min(1, 'Completá la descripción.').max(100),
    brand: z.string().trim().max(40),
    unit: supplyItemSchema.shape.unit,
    unitPrice: supplyItemSchema.shape.unitPrice,
    active: z.boolean(),
  })
  .refine(
    (product) => [product.description, product.brand].filter(Boolean).join(' · ').length <= 120,
    'La descripción con marca no puede superar los 120 caracteres.',
  );
export type Product = z.infer<typeof productSchema>;
export const productCode = (value: string) =>
  value.normalize('NFKC').replace(/\s/g, '').toLocaleUpperCase('es');
export const productText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
export function searchProducts(products: Product[], search: string, status = 'activos') {
  const query = productText(search);
  const compact = query.replace(/[^a-z0-9]/g, '');
  return products
    .filter(
      (product) =>
        (status === 'todos' || product.active === (status === 'activos')) &&
        (productText(`${product.code} ${product.description} ${product.brand}`).includes(query) ||
          (!!compact &&
            productText(product.code)
              .replace(/[^a-z0-9]/g, '')
              .includes(compact))),
    )
    .sort(
      (a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }) || a.id.localeCompare(b.id),
    );
}
export function productServiceItem(product: Product, rowId: string): SupplyItem {
  return {
    id: rowId,
    productId: product.id,
    code: product.code,
    description: [product.description, product.brand].filter(Boolean).join(' · '),
    quantity: 1,
    unit: product.unit,
    unitPrice: product.unitPrice,
  };
}
export function saveProductData(data: LocalData, edited: Product, original?: Product): LocalData {
  const product = productSchema.parse(edited);
  const products = data.products ?? [];
  const current = products.find((row) => row.id === product.id);
  if (original ? !current || JSON.stringify(current) !== JSON.stringify(original) : !!current)
    throw new Error(
      'Este producto cambió. Cerrá el editor y volvé a abrirlo para revisar los datos actuales.',
    );
  if (original && original.id !== product.id)
    throw new Error('No se puede cambiar el identificador del producto.');
  if (
    products.some(
      (row) => row.id !== product.id && productCode(row.code) === productCode(product.code),
    )
  )
    throw new Error('Ya existe un producto con ese código, incluso entre los inactivos.');
  return {
    ...data,
    products: original
      ? products.map((row) => (row.id === product.id ? product : row))
      : [...products, product],
  };
}
export const demoProducts: Product[] = [
  {
    id: 'demo-oil',
    code: 'ACE-001',
    description: 'Helix HX8 5W-30',
    brand: 'Shell',
    unit: 'Litro',
    unitPrice: 10000,
    active: true,
  },
  {
    id: 'demo-filter',
    code: 'FIL-025',
    description: 'Filtro de aceite W712/95',
    brand: 'MANN',
    unit: 'Unidad',
    unitPrice: 12000,
    active: true,
  },
  {
    id: 'demo-cabin',
    code: 'HAB-001',
    description: 'Filtro de habitáculo CUK 2939',
    brand: 'MANN',
    unit: 'Unidad',
    unitPrice: 16000,
    active: true,
  },
];
