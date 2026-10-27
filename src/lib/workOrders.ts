import type { Service } from './demo';
import { type LocalData, type QuoteSnapshot } from './localDatabase';
import { recordServicePlan, withPlanSummary } from './maintenancePlans';
import { applyServiceStock } from './inventory';
import { recordServiceChange } from './serviceHistory';
import { randomId } from './ids';
export const workStages = {
  presupuesto: 'Presupuesto',
  'en-trabajo': 'Confirmado / En trabajo',
  completado: 'Completado',
  cancelado: 'Cancelado',
} as const;
export type WorkStage = keyof typeof workStages;
export type WorkEvent = { at: string; from: WorkStage | 'nuevo'; to: WorkStage; reason?: string };
export type PendingJob = Service & {
  stage: Exclude<WorkStage, 'completado'>;
  cancellationReason?: string;
};

export function changeWorkOrder(
  data: LocalData,
  original: PendingJob | undefined,
  service: Service,
  stage: WorkStage,
  today: string,
  issueQuote = false,
  reason = '',
) {
  const jobs = data.jobs ?? [];
  const current = original && jobs.find((job) => job.id === original.id);
  if (original && (!current || JSON.stringify(current) !== JSON.stringify(original)))
    throw new Error('Este trabajo cambió en otra pestaña. Cerrá y volvé a abrirlo.');
  if (
    data.services.some((s) => s.id === service.id) ||
    (!original && jobs.some((job) => job.id === service.id)) ||
    (original && original.id !== service.id)
  )
    throw new Error(
      'El trabajo ya fue completado o su identificador no es válido. Volvé al listado.',
    );
  const vehicle = data.vehicles.find((v) => v.id === service.vehicleId);
  const customer = vehicle && data.customers.find((c) => c.id === vehicle.customerId);
  if (!vehicle || !customer) throw new Error('Elegí un cliente y un vehículo válidos.');
  if (service.date > today) throw new Error('La fecha no puede ser posterior a hoy.');
  if (stage === 'cancelado' && reason.trim().length < 3)
    throw new Error('Indicá el motivo de cancelación.');
  if (issueQuote && !['presupuesto', 'en-trabajo'].includes(stage))
    throw new Error('Solo se emiten presupuestos de trabajos pendientes.');
  const {
    stage: _stage,
    cancellationReason: _reason,
    ...base
  } = service as Service & Partial<PendingJob>;
  const {
    stockManaged: _stock,
    annulment: _annulment,
    changes: _changes,
    quotes: _quotes,
    workHistory: _history,
    ...fields
  } = base;
  let saved: Service = {
    ...fields,
    public: stage === 'completado' ? service.public : false,
    ...(original?.quotes ? { quotes: original.quotes } : {}),
    ...(original?.workHistory ? { workHistory: original.workHistory } : {}),
  };
  if (!original || original.stage !== stage)
    saved.workHistory = [
      ...(original?.workHistory ?? []),
      {
        at: new Date().toISOString(),
        from: original?.stage ?? 'nuevo',
        to: stage,
        ...(stage === 'cancelado' ? { reason: reason.trim() } : {}),
      },
    ];
  if (issueQuote) {
    if ((saved.quotes?.length ?? 0) >= 20)
      throw new Error(
        'Este trabajo ya tiene 20 presupuestos emitidos. Conservá sus versiones anteriores.',
      );
    const { maintenance: _plan, ...quoteService } = fields;
    const { maintenancePlans: _plans, manualKm: _manual, ...quoteVehicle } = vehicle;
    const quote: QuoteSnapshot = {
      id: randomId(),
      version: (saved.quotes?.length ?? 0) + 1,
      issuedAt: new Date().toISOString(),
      service: structuredClone({ ...quoteService, notes: '', public: false }),
      vehicle: quoteVehicle,
      customer: { ...customer, notes: '' },
      workshop: { ...data.workshop },
    };
    saved.quotes = [...(saved.quotes ?? []), quote];
  }
  let next: LocalData;
  if (stage === 'completado') {
    if (service.km < vehicle.km)
      throw new Error(
        `Revisá el kilometraje real: el vehículo tiene ${vehicle.km.toLocaleString('es-AR')} km registrados.`,
      );
    if (
      data.services.some(
        (s) =>
          !s.annulment && s.vehicleId === vehicle.id && s.date > service.date && s.km < service.km,
      )
    )
      throw new Error(
        'La fecha y los kilómetros contradicen un servicio posterior. Revisá los datos reales.',
      );
    const history = data.services.filter((s) => !s.annulment);
    saved = recordServiceChange(undefined, { ...saved, stockManaged: true }, 'created');
    next = {
      ...data,
      jobs: jobs.filter((job) => job.id !== saved.id),
      services: [saved, ...data.services],
      vehicles: data.vehicles.map((v) =>
        v.id !== vehicle.id
          ? v
          : service.maintenance
            ? recordServicePlan(
                v,
                saved,
                {
                  date: service.maintenance.nextDate,
                  km: service.maintenance.nextKm,
                  recommendation: service.maintenance.recommendation,
                },
                today,
                history,
              )
            : withPlanSummary(
                {
                  ...v,
                  manualKm:
                    v.manualKm ??
                    (v.km >
                    Math.max(0, ...history.filter((s) => s.vehicleId === v.id).map((s) => s.km))
                      ? v.km
                      : 0),
                  km: saved.km,
                },
                today,
              ),
      ),
    };
    next = applyServiceStock(data, next, saved);
  } else {
    const pending: PendingJob = {
      ...saved,
      stage,
      ...(stage === 'cancelado' ? { cancellationReason: reason.trim() } : {}),
    };
    saved = pending;
    next = {
      ...data,
      jobs: original
        ? jobs.map((job) => (job.id === original.id ? pending : job))
        : [pending, ...jobs],
    };
  }
  // Las fotos nuevas se incorporan en la misma operación antes de validar y guardar.
  return { data: next, saved };
}
