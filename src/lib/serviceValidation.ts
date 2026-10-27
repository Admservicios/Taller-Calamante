import { laborAmountSchema } from './serviceCosts';
import { z } from 'zod';

export const serviceFieldsSchema = z.object({
  date: z.iso.date('Ingresá una fecha válida.'),
  km: z.number().int().min(0).max(9999999),
  type: z.string().trim().min(1, 'Elegí el tipo de servicio.'),
  work: z
    .string()
    .trim()
    .min(5, 'Describí los trabajos realizados (mínimo 5 caracteres).')
    .max(2000),
  amount: z.number().min(0, 'El importe no puede ser negativo.').max(999999999),
  laborAmount: laborAmountSchema.optional(),
});

export const serviceSchema = serviceFieldsSchema
  .extend({
    nextDate: z.iso.date(),
    nextKm: z.number().int().min(1).max(9999999),
  })
  .refine((data) => data.nextDate > data.date, {
    message: 'La próxima fecha debe ser posterior a la del servicio.',
    path: ['nextDate'],
  })
  .refine((data) => data.nextKm > data.km, {
    message: 'El próximo kilometraje debe superar el del servicio.',
    path: ['nextKm'],
  });
