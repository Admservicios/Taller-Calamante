import type { QuoteSnapshot } from './localDatabase';
import { createServicePDF, downloadServicePDF } from './servicePDF';
const receipt = (quote: QuoteSnapshot, demo = false) => ({
  service: quote.service,
  vehicle: quote.vehicle,
  customer: quote.customer,
  workshop: quote.workshop,
  demo,
  kind: 'quote' as const,
  quoteVersion: quote.version,
  quoteReference: quote.id.slice(0, 8).toUpperCase(),
  issuedAt: quote.issuedAt,
});
export const createQuotePDF = (quote: QuoteSnapshot, demo = false) =>
  createServicePDF(receipt(quote, demo));
export const downloadQuotePDF = (quote: QuoteSnapshot, demo = false) =>
  downloadServicePDF(receipt(quote, demo));
