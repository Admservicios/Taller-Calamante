import { z } from 'zod';
import type { Service } from './demo';
import { totalItemCents } from './supplyItems';
import { amountCents } from './maintenanceReport';

export const laborAmountSchema = z
  .number()
  .min(0, 'La mano de obra no puede ser negativa.')
  .max(999999999)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
    'La mano de obra admite hasta dos decimales.',
  );
export const suggestedServiceCents = (items: NonNullable<Service['supplyItems']>, labor: number) =>
  totalItemCents(items) + amountCents(labor);
export function laborSummary(services: Service[]) {
  const known = services.filter((s) => !s.annulment && s.laborAmount !== undefined);
  return {
    known: known.length,
    total: known.reduce((sum, s) => sum + amountCents(s.laborAmount!), 0) / 100,
  };
}

export function serviceAdjustmentCents(
  service: Pick<Service, 'supplyItems' | 'suppliesLegacy' | 'laborAmount' | 'amount'>,
) {
  if (
    service.supplyItems === undefined ||
    service.laborAmount === undefined ||
    service.suppliesLegacy?.trim()
  )
    return undefined;
  return (
    amountCents(service.amount) - suggestedServiceCents(service.supplyItems, service.laborAmount)
  );
}
