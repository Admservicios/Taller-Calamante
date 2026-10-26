import type { Service, ServiceChange } from './demo';
import type { LocalData } from './localDatabase';
import { editServiceData } from './serviceEditing';

const fields: [keyof Service, string][] = [
  ['vehicleId', 'Vehículo (ID)'],
  ['date', 'Fecha'],
  ['km', 'Kilometraje'],
  ['type', 'Tipo de servicio'],
  ['work', 'Trabajos'],
  ['supplies', 'Insumos'],
  ['suppliesDetail', 'Campos de insumos'],
  ['amount', 'Importe'],
  ['notes', 'Observaciones privadas'],
  ['public', 'Visibilidad pública'],
  ['maintenance', 'Vencimiento'],
];
const display = (value: unknown): string =>
  value === undefined
    ? 'Sin dato'
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

export function recordServiceChange(
  original: Service | undefined,
  edited: Service,
  action: ServiceChange['action'],
  reason?: string,
  extra: ServiceChange['changes'] = [],
): Service {
  const changes = original
    ? fields.flatMap(([key, label]) =>
        JSON.stringify(original[key]) === JSON.stringify(edited[key])
          ? []
          : [{ field: label, before: display(original[key]), after: display(edited[key]) }],
      )
    : [];
  return {
    ...edited,
    changes: [
      ...(original?.changes ?? []),
      {
        at: new Date().toISOString(),
        action,
        ...(reason ? { reason } : {}),
        changes: [...changes, ...extra],
      },
    ],
  };
}

export function changeServiceStatus(
  data: LocalData,
  original: Service,
  reason: string,
  today: string,
): LocalData {
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 500)
    throw new Error('Indicá un motivo de entre 3 y 500 caracteres.');
  const edited = { ...original };
  if (original.annulment) delete edited.annulment;
  else edited.annulment = { at: new Date().toISOString(), reason: cleanReason };
  const updated = recordServiceChange(
    original,
    edited,
    original.annulment ? 'restored' : 'annulled',
    cleanReason,
  );
  return editServiceData(data, original, updated, today);
}
