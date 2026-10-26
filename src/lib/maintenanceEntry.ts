import { z } from 'zod';
import type { Service } from './demo';

export const supplyLabels = {
  oil: 'Aceite de motor',
  viscosity: 'Viscosidad',
  oilFilter: 'Filtro de aceite',
  airFilter: 'Filtro de aire',
  fuelFilter: 'Filtro de combustible',
  cabinFilter: 'Filtro de habitáculo',
  other: 'Otros repuestos y detalles',
} as const;
export const suppliesDetailSchema = z.strictObject({
  oil: z.string().max(100),
  viscosity: z.string().max(100),
  oilFilter: z.string().max(100),
  airFilter: z.string().max(100),
  fuelFilter: z.string().max(100),
  cabinFilter: z.string().max(100),
  other: z.string().max(1000),
});
export type SuppliesDetail = z.infer<typeof suppliesDetailSchema>;
export const blankSupplies = (): SuppliesDetail => ({
  oil: '',
  viscosity: '',
  oilFilter: '',
  airFilter: '',
  fuelFilter: '',
  cabinFilter: '',
  other: '',
});
export function entrySupplies(service?: Service): SuppliesDetail {
  return service?.suppliesDetail
    ? { ...service.suppliesDetail }
    : {
        ...blankSupplies(),
        other: service?.supplies === 'Sin insumos registrados' ? '' : (service?.supplies ?? ''),
      };
}
export function suppliesSummary(detail: SuppliesDetail): string {
  return (
    (Object.keys(supplyLabels) as (keyof SuppliesDetail)[])
      .map((key) =>
        detail[key].trim()
          ? key === 'other'
            ? detail[key].trim()
            : `${supplyLabels[key]}: ${detail[key].trim()}`
          : '',
      )
      .filter(Boolean)
      .join(' · ') || 'Sin insumos registrados'
  );
}
// No se interpreta texto libre antiguo como marcas o códigos de repuesto.
export function saveEntrySupplies(detail: SuppliesDetail, original?: Service) {
  if (
    original &&
    !original.suppliesDetail &&
    JSON.stringify(detail) === JSON.stringify(entrySupplies(original))
  )
    return { supplies: original.supplies };
  return { supplies: suppliesSummary(detail), suppliesDetail: { ...detail } };
}
export const alignmentOptions = [
  'Eje delantero',
  'Ejes delantero y trasero',
  'No realizada',
] as const;
export const balancingOptions = [
  'Las 4 ruedas',
  '2 ruedas delanteras',
  '2 ruedas traseras',
  'No realizado',
] as const;
export function alignmentEntry(work: string) {
  for (const alignment of ['', ...alignmentOptions])
    for (const balancing of ['', ...balancingOptions]) {
      const prefix = `Alineación: ${alignment || 'Sin especificar'}. Balanceo: ${balancing || 'Sin especificar'}. `;
      if (work.startsWith(prefix)) return { alignment, balancing, work: work.slice(prefix.length) };
    }
  return { alignment: '', balancing: '', work };
}
export function alignmentSummary(work: string, alignment: string, balancing: string) {
  if (!alignment && !balancing) return work;
  return `Alineación: ${alignment || 'Sin especificar'}. Balanceo: ${balancing || 'Sin especificar'}. ${work}`;
}
export const commonTasks: Record<string, string[]> = {
  'aceite-filtros': [
    'Cambio de aceite de motor',
    'Cambio de filtro de aceite',
    'Control de niveles',
  ],
  filtros: [
    'Cambio de filtro de aire',
    'Cambio de filtro de combustible',
    'Cambio de filtro de aceite',
  ],
  'otro-filtro-de-habitaculo': [
    'Cambio de filtro de habitáculo',
    'Revisión del sistema de ventilación',
  ],
  frenos: [
    'Cambio de pastillas delanteras',
    'Cambio de pastillas traseras',
    'Revisión de discos',
    'Cambio de líquido de frenos',
  ],
  neumaticos: ['Rotación de neumáticos', 'Control de presión', 'Revisión de desgaste'],
  'alineacion-balanceo': [
    'Control de tren delantero',
    'Corrección de deriva',
    'Control de vibraciones',
  ],
  'revision-general': [
    'Control de niveles',
    'Revisión de luces',
    'Revisión de frenos',
    'Diagnóstico general',
  ],
};
export function appendTask(work: string, task: string) {
  if (work.split('\n').some((line) => line.trim() === task)) return work;
  return work.trim() ? `${work.trimEnd()}\n${task}` : task;
}
