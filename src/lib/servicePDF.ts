import { localToday } from './localDatabase';
import { serviceAdjustmentCents } from './serviceCosts';
import { itemMoney } from './supplyItems';
import { dateLabel, number, type Customer, type Service, type Vehicle } from './demo';
import type { Workshop } from './localDatabase';
import { maintenanceKind, vehiclePlans } from './maintenancePlans';

export type ServiceReceipt = {
  service: Service;
  vehicle: Vehicle;
  customer: Customer;
  workshop: Workshop;
  demo: boolean;
  kind?: 'quote';
  quoteVersion?: number;
  quoteReference?: string;
  issuedAt?: string;
};

// La biblioteca se carga al pedir el comprobante, sin enviar registros a un servidor.
export async function createServicePDF({
  service,
  vehicle,
  customer,
  workshop,
  demo,
  kind,
  quoteVersion,
  quoteReference,
  issuedAt,
}: ServiceReceipt) {
  const isQuote = kind === 'quote';
  if (service.annulment)
    throw new Error('Recuperá el mantenimiento antes de emitir un comprobante.');
  if (service.vehicleId !== vehicle.id || vehicle.customerId !== customer.id)
    throw new Error('El servicio, el vehículo y el cliente no corresponden.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false, putOnlyUsedFonts: true });
  const margin = 16;
  const width = 178;
  const bottom = 278;
  let y = 20;
  const clean = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');
  const stripe = () => {
    doc.setFillColor('#0873ff');
    doc.rect(0, 0, 210, 4, 'F');
  };
  stripe();
  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    stripe();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#52647e');
    doc.text(clean(`${vehicle.plate} · ${dateLabel(service.date)} · Continuación`), margin, 15);
    y = 25;
  };
  const text = (value: string, size = 10, bold = false, color = '#253952') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(value), width) as string[];
    const height = size * 0.48;
    for (const line of lines) {
      ensure(height);
      // ensure puede abrir una página y cambiar el estilo de su encabezado.
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(color);
      doc.text(line, margin, y);
      y += height;
    }
  };
  const section = (title: string) => {
    ensure(18);
    y += 5;
    text(title, 11, true, '#0869db');
    y += 2;
  };
  doc.setProperties({
    title: `${isQuote ? 'Presupuesto' : 'Comprobante de mantenimiento'} · ${vehicle.plate}`,
    author: workshop.name,
    creator: 'Taller Calamante',
  });
  text(workshop.name, 19, true, '#10203a');
  text(isQuote ? `Presupuesto · versión ${quoteVersion ?? 1}` : 'Comprobante de mantenimiento', 12);
  if (isQuote && quoteReference) text(`Referencia: ${quoteReference}`, 9);
  if (isQuote && issuedAt) text(`Emitido: ${dateLabel(localToday(new Date(issuedAt)))}`, 9);
  if (isQuote) text('No acredita un trabajo realizado ni un pago. No reserva existencias.', 9);
  y += 3;
  if (workshop.address) text(workshop.address, 9);
  if (workshop.phone || workshop.email)
    text([workshop.phone, workshop.email].filter(Boolean).join(' · '), 9);
  if (demo) {
    y += 3;
    text('DEMOSTRACIÓN · DATOS FICTICIOS', 10, true, '#b45309');
  }
  section(isQuote ? 'Servicio presupuestado' : 'Servicio realizado');
  text(service.type, 14, true);
  text(
    `Fecha: ${dateLabel(service.date)} · ${isQuote ? 'Kilometraje informado' : 'Kilometraje del servicio'}: ${number(service.km)} km`,
  );
  section('Cliente');
  text(customer.name, 11, true);
  if (customer.document) text(`Documento: ${customer.document}`);
  if (customer.phone || customer.email)
    text([customer.phone, customer.email].filter(Boolean).join(' · '));
  if (customer.address) text(customer.address);
  section('Vehículo');
  text(`${vehicle.brand} ${vehicle.model} · Patente: ${vehicle.plate}`, 11, true);
  text(
    [`Año: ${vehicle.year}`, vehicle.engine && `Motor: ${vehicle.engine}`, vehicle.fuel]
      .filter(Boolean)
      .join(' · '),
  );
  section(isQuote ? 'Trabajo presupuestado' : 'Trabajos realizados');
  text(service.work || 'Sin detalle registrado.');
  section('Insumos y repuestos');
  text(service.supplies || 'Sin insumos registrados.');
  section(isQuote ? 'Importe presupuestado' : 'Importe del servicio');
  const adjustment = serviceAdjustmentCents(service);
  if (service.laborAmount !== undefined)
    text(
      `Mano de obra incluida: ARS ${service.laborAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    );
  if (adjustment !== undefined && adjustment !== 0)
    text(`Ajuste / descuento: ${itemMoney(adjustment)}`);
  text(
    `ARS ${new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(service.amount)}`,
    18,
    true,
    '#10203a',
  );
  if (!isQuote) {
    section('Próximo mantenimiento de este servicio');
    const plan =
      service.maintenance ??
      vehiclePlans(vehicle).find((p) => p.category === maintenanceKind(service.type).key);
    if (plan) {
      text(`${plan.label} · ${plan.recommendation}`, 11, true);
      text(`${dateLabel(plan.nextDate)} o ${number(plan.nextKm)} km, lo que ocurra primero.`);
      text(
        service.maintenance
          ? 'Vencimiento registrado al realizar este servicio.'
          : 'Recomendación vigente de este tipo de servicio.',
        9,
        false,
        '#52647e',
      );
    } else text('No hay un vencimiento registrado para este tipo de servicio.');
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor('#dce5ef');
    doc.line(margin, 283, 194, 283);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#52647e');
    doc.text(
      isQuote
        ? 'Taller Calamante · Presupuesto'
        : 'Taller Calamante · Comprobante de mantenimiento',
      margin,
      289,
    );
    doc.text(`Página ${page} de ${pages}`, 194, 289, { align: 'right' });
  }
  const slug = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 45);
  return {
    bytes: doc.output('arraybuffer'),
    filename: `taller-calamante-${isQuote ? `presupuesto-${quoteReference ?? ''}-v${quoteVersion ?? 1}-` : ''}${demo ? 'demo-' : ''}${slug(vehicle.plate)}-${service.date}-${slug(service.type)}.pdf`,
  };
}

export async function downloadServicePDF(receipt: ServiceReceipt) {
  const { bytes, filename } = await createServicePDF(receipt);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
