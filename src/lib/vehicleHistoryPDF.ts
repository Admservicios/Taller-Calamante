import { serviceAdjustmentCents } from './serviceCosts';
import { itemMoney } from './supplyItems';
import { serviceSuppliesText } from './supplyItems';
import { z } from 'zod';
import { dateLabel, number, type Customer, type Service, type Vehicle } from './demo';
import type { Workshop } from './localDatabase';
import { allPlanRows, planStatus } from './maintenancePlans';
import { amountCents } from './maintenanceReport';

export type VehicleHistoryReport = {
  vehicle: Vehicle;
  customer: Customer;
  services: Service[];
  workshop: Workshop;
  today: string;
  from?: string;
  to?: string;
  includeAmounts: boolean;
  includePlans: boolean;
  demo: boolean;
};
export function historyInPeriod(services: Service[], from = '', to = '') {
  return services
    .filter(
      (service) =>
        !service.annulment && (!from || service.date >= from) && (!to || service.date <= to),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km || a.id.localeCompare(b.id));
}
export async function createVehicleHistoryPDF(report: VehicleHistoryReport) {
  const {
    vehicle,
    customer,
    services,
    workshop,
    today,
    from,
    to,
    includeAmounts,
    includePlans,
    demo,
  } = report;
  if (
    vehicle.customerId !== customer.id ||
    services.some((service) => service.vehicleId !== vehicle.id)
  )
    throw new Error('El vehículo, el cliente y sus mantenimientos no corresponden.');
  if (
    !z.iso.date().safeParse(today).success ||
    (from && !z.iso.date().safeParse(from).success) ||
    (to && !z.iso.date().safeParse(to).success)
  )
    throw new Error('Revisá las fechas del informe.');
  if (from && to && from > to) throw new Error('La fecha Desde debe ser anterior o igual a Hasta.');
  const history = historyInPeriod(services, from, to);
  if (!history.length) throw new Error('No hay mantenimientos activos en el período elegido.');
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false, putOnlyUsedFonts: true });
  const margin = 16,
    width = 178,
    bottom = 278;
  let y = 20;
  const clean = (value: string) => value.replace(/[\u00a0\u202f]/g, ' ');
  const stripe = () => {
    doc.setFillColor('#0873ff');
    doc.rect(0, 0, 210, 4, 'F');
  };
  const ensure = (height: number) => {
    if (y + height <= bottom) return;
    doc.addPage();
    stripe();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor('#52647e');
    doc.text(clean(`${vehicle.plate} · Historial del vehículo · Continuación`), margin, 15);
    y = 25;
  };
  const text = (value: string, size = 10, bold = false, color = '#253952') => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(value), width) as string[];
    for (const line of lines) {
      ensure(size * 0.48);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(color);
      doc.text(line, margin, y);
      y += size * 0.48;
    }
  };
  const section = (title: string) => {
    ensure(20);
    y += 5;
    text(title, 11, true, '#0869db');
    y += 2;
  };
  const currency = (amount: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      amount,
    );
  stripe();
  doc.setProperties({
    title: `Historial de mantenimiento · ${vehicle.plate}`,
    author: workshop.name,
    creator: 'Taller Calamante',
  });
  text(workshop.name, 19, true, '#10203a');
  text('Historial de mantenimiento del vehículo', 12);
  y += 3;
  if (workshop.address) text(workshop.address, 9);
  if (workshop.phone || workshop.email)
    text([workshop.phone, workshop.email].filter(Boolean).join(' · '), 9);
  if (demo) {
    y += 3;
    text('DEMOSTRACIÓN · DATOS FICTICIOS', 10, true, '#b45309');
  }
  section('Vehículo');
  text(`${vehicle.brand} ${vehicle.model} · Patente: ${vehicle.plate}`, 13, true);
  text(
    [`Año: ${vehicle.year}`, vehicle.engine && `Motor: ${vehicle.engine}`, vehicle.fuel]
      .filter(Boolean)
      .join(' · '),
  );
  text(`Último kilometraje registrado: ${number(vehicle.km)} km`);
  text(`Cliente actual: ${customer.name}`);
  text(`Fecha del informe: ${dateLabel(today)}`);
  text(
    from || to
      ? `Período: ${from ? dateLabel(from) : 'Desde el primer registro'} a ${to ? dateLabel(to) : 'el último registro'}`
      : 'Período: todo el historial activo',
  );
  section('Resumen del período');
  text(
    `${history.length} ${history.length === 1 ? 'mantenimiento activo' : 'mantenimientos activos'}`,
  );
  text(
    `Primer registro: ${dateLabel(history.at(-1)!.date)} · Último registro: ${dateLabel(history[0].date)}`,
  );
  if (includeAmounts) {
    text(
      `Importe registrado total: ARS ${currency(history.reduce((sum, service) => sum + amountCents(service.amount), 0) / 100)}`,
      11,
      true,
    );
    text(
      'Los importes registrados no acreditan pagos ni reemplazan los comprobantes del servicio.',
      9,
      false,
      '#52647e',
    );
  }
  for (const [index, service] of history.entries()) {
    section(`Mantenimiento ${index + 1} de ${history.length}`);
    text(service.type, 12, true);
    text(`Fecha: ${dateLabel(service.date)} · Kilometraje del servicio: ${number(service.km)} km`);
    text('Trabajos realizados', 10, true);
    text(service.work || 'Sin detalle registrado.');
    y += 2;
    text('Insumos y repuestos', 10, true);
    text(serviceSuppliesText(service, includeAmounts) || 'Sin insumos registrados.');
    if (includeAmounts && service.laborAmount !== undefined)
      text(`Mano de obra incluida: ARS ${currency(service.laborAmount)}`);
    const adjustment = serviceAdjustmentCents(service);
    if (includeAmounts && adjustment !== undefined && adjustment !== 0)
      text(`Ajuste / descuento: ${itemMoney(adjustment)}`);
    if (includeAmounts)
      text(`Importe registrado: ARS ${currency(amountCents(service.amount) / 100)}`, 10, true);
    if (service.maintenance) {
      y += 2;
      text('Vencimiento guardado con esta visita', 10, true);
      text(`${service.maintenance.label}: ${service.maintenance.recommendation}`);
      text(
        `${dateLabel(service.maintenance.nextDate)} o ${number(service.maintenance.nextKm)} km, lo que ocurra primero.`,
      );
    }
  }
  if (includePlans) {
    section(`Vencimientos vigentes al ${dateLabel(today)}`);
    const rows = allPlanRows([vehicle], today);
    if (!rows.length) text('No hay vencimientos programados.');
    for (const { plan } of rows) {
      ensure(20);
      text(`${plan.label} · ${planStatus(plan, vehicle.km, today)}`, 11, true);
      text(plan.recommendation);
      text(`${dateLabel(plan.nextDate)} o ${number(plan.nextKm)} km, lo que ocurra primero.`);
      y += 3;
    }
    text(
      'Estos son los objetivos vigentes del vehículo, independientes de los guardados en visitas anteriores. Se usa la última lectura registrada; confirmá el kilometraje actual al coordinar.',
      9,
      false,
      '#52647e',
    );
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
      demo ? 'DEMOSTRACIÓN · DATOS FICTICIOS' : 'Taller Calamante · Historial de mantenimiento',
      margin,
      289,
    );
    doc.text(`Página ${page} de ${pages}`, 194, 289, { align: 'right' });
  }
  const plate = vehicle.plate
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 45);
  return {
    bytes: doc.output('arraybuffer'),
    filename: `taller-calamante-historial-${demo ? 'demo-' : ''}${plate}-${from || 'inicio'}-${to || today}.pdf`,
  };
}
