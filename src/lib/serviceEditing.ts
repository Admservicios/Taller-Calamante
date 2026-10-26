import type { Service, Vehicle } from './demo';
import type { LocalData } from './localDatabase';
import { dataSchema } from './localDatabase';
import {
  maintenanceKind,
  vehiclePlans,
  withPlanSummary,
  type MaintenancePlan,
} from './maintenancePlans';

const latest = (services: Service[], vehicleId: string, category: string) =>
  services
    .filter(
      (s) => !s.annulment && s.vehicleId === vehicleId && maintenanceKind(s.type).key === category,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)[0];

function owns(plan: MaintenancePlan, service: Service, history: Service[]) {
  if (service.annulment || plan.manual || plan.category !== maintenanceKind(service.type).key)
    return false;
  if (plan.sourceServiceId) return plan.sourceServiceId === service.id;
  if (plan.lastDate !== undefined)
    return (
      plan.lastDate === service.date &&
      plan.lastKm === service.km &&
      latest(history, service.vehicleId, plan.category)?.id === service.id
    );
  return false;
}

// Los registros antiguos solo recuperan el vencimiento vigente cuando la relación es comprobable.
export function editableServicePlan(
  service: Service,
  data: Pick<LocalData, 'vehicles' | 'services'>,
) {
  if (service.maintenance) return service.maintenance;
  const vehicle = data.vehicles.find((v) => v.id === service.vehicleId);
  const plan = vehicle && vehiclePlans(vehicle).find((p) => owns(p, service, data.services));
  return plan && plan.nextDate > service.date && plan.nextKm > service.km ? plan : undefined;
}

export function editServiceData(
  data: LocalData,
  original: Service,
  edited: Service,
  today: string,
): LocalData {
  const current = data.services.find((s) => s.id === original.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(original))
    throw new Error(
      'Este mantenimiento cambió en otra pestaña. Volvé al historial y abrí Editar nuevamente.',
    );
  if (edited.id !== original.id)
    throw new Error('No se puede cambiar el identificador del mantenimiento.');
  if (!data.vehicles.some((v) => v.id === edited.vehicleId))
    throw new Error('Elegí un vehículo válido.');
  if (edited.date > today) throw new Error('La fecha del servicio no puede ser futura.');
  if (
    !edited.annulment &&
    (!!original.annulment ||
      edited.km !== original.km ||
      edited.date !== original.date ||
      edited.vehicleId !== original.vehicleId)
  ) {
    const conflict = data.services.find(
      (s) =>
        !s.annulment &&
        s.id !== edited.id &&
        s.vehicleId === edited.vehicleId &&
        ((s.date < edited.date && s.km > edited.km) || (s.date > edited.date && s.km < edited.km)),
    );
    if (conflict)
      throw new Error(
        `El kilometraje contradice el servicio del ${conflict.date} (${conflict.km.toLocaleString('es-AR')} km). Corregí primero ese registro o revisá la fecha.`,
      );
  }
  const services = data.services.map((s) => (s.id === edited.id ? edited : s));
  const vehicles = data.vehicles.map((vehicle): Vehicle => {
    if (![original.vehicleId, edited.vehicleId].includes(vehicle.id)) return vehicle;
    const oldCategory = maintenanceKind(original.type).key;
    const newCategory = maintenanceKind(edited.type).key;
    const plans = vehiclePlans(vehicle).flatMap((plan) => {
      if (!owns(plan, original, data.services) || vehicle.id !== original.vehicleId) return [plan];
      const last = latest(services, vehicle.id, oldCategory);
      // Si el último registro no tiene un vencimiento guardado, no se inventa uno anterior.
      return last?.maintenance ? [last.maintenance] : [];
    });
    if (
      vehicle.id === edited.vehicleId &&
      !edited.annulment &&
      edited.maintenance &&
      latest(services, vehicle.id, newCategory)?.id === edited.id
    ) {
      const index = plans.findIndex((p) => p.category === newCategory);
      const previous = index >= 0 ? plans[index] : undefined;
      // Un ajuste manual tiene prioridad sobre el vencimiento de una visita histórica.
      if (!previous?.manual) {
        if (index >= 0) plans[index] = edited.maintenance;
        else plans.push(edited.maintenance);
      }
    }
    const oldMax = Math.max(
      0,
      ...data.services.filter((s) => !s.annulment && s.vehicleId === vehicle.id).map((s) => s.km),
    );
    // Una lectura independiente no se reduce al corregir un mantenimiento.
    const historyMax = Math.max(
      0,
      ...services.filter((s) => !s.annulment && s.vehicleId === vehicle.id).map((s) => s.km),
    );
    const hasRemainingHistory = services.some((s) => !s.annulment && s.vehicleId === vehicle.id);
    // En una base anterior sin lectura de origen, mover su única visita no permite deducir cero.
    const independent =
      vehicle.manualKm ?? (vehicle.km > oldMax || !hasRemainingHistory ? vehicle.km : 0);
    const planMax = Math.max(0, ...plans.map((p) => p.lastKm ?? 0));
    const km = Math.max(independent, historyMax, planMax);
    return withPlanSummary(
      { ...vehicle, manualKm: independent, km, maintenancePlans: plans },
      today,
    );
  });
  const result: LocalData = {
    ...(data.products ? { products: data.products } : {}),
    customers: data.customers,
    workshop: data.workshop,
    services,
    vehicles,
    ...(data.photoSet ? { photoSet: data.photoSet } : {}),
    ...(data.photos ? { photos: data.photos } : {}),
    ...(data.documentSet ? { documentSet: data.documentSet } : {}),
    ...(data.documents ? { documents: data.documents } : {}),
  };
  const valid = dataSchema.safeParse(result);
  if (!valid.success) throw new Error(valid.error.issues[0].message);
  return result;
}
