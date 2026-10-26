import { dateLabel, number, type Customer, type Vehicle } from './demo';
import type { Workshop } from './localDatabase';
import { planStatus, type MaintenancePlan } from './maintenancePlans';

export function dueDetail(plan: MaintenancePlan, km: number, today: string) {
  const days = Math.round(
    (Date.parse(`${plan.nextDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
  const distance = plan.nextKm - km;
  return {
    date:
      days === 0
        ? 'Vence hoy'
        : days < 0
          ? `Venció hace ${number(-days)} ${days === -1 ? 'día' : 'días'}`
          : `En ${number(days)} ${days === 1 ? 'día' : 'días'}`,
    km:
      distance === 0
        ? 'Kilometraje objetivo alcanzado'
        : distance < 0
          ? `Superado por ${number(-distance)} km`
          : `Faltan ${number(distance)} km`,
  };
}

export function customerReminder({
  customer,
  vehicle,
  plans,
  workshop,
  today,
  demo = false,
}: {
  customer: Customer;
  vehicle: Vehicle;
  plans: MaintenancePlan[];
  workshop: Workshop;
  today: string;
  demo?: boolean;
}): string {
  if (!plans.length) return '';
  return [
    ...(demo ? ['[DEMOSTRACIÓN · DATOS FICTICIOS]', ''] : []),
    `Hola ${customer.name}, te contactamos de ${workshop.name}.`,
    `Recordatorio para ${vehicle.brand} ${vehicle.model} (${vehicle.plate}):`,
    '',
    ...plans.flatMap((plan) => [
      `• ${plan.label}: ${plan.recommendation}`,
      `  Fecha: ${dateLabel(plan.nextDate)} o ${number(plan.nextKm)} km, lo que ocurra primero.`,
      `  Estado: ${planStatus(plan, vehicle.km, today) === 'Vencido' ? 'Vencido según los registros' : planStatus(plan, vehicle.km, today)}.`,
      '',
    ]),
    `Último kilometraje registrado: ${number(vehicle.km)} km. Confirmá el kilometraje actual al coordinar.`,
    workshop.phone
      ? `Para coordinar una visita, comunicate al ${workshop.phone}.`
      : 'Contactanos para coordinar una visita.',
    `Fecha de referencia: ${dateLabel(today)}.`,
  ].join('\n');
}
