import { describe, expect, it } from 'vitest';
import { initialServices, initialVehicles, initialCustomers } from '../../src/lib/demo';
import { dataSchema, emptyData, makeBackup, parseBackup } from '../../src/lib/localDatabase';
import { recordServiceChange } from '../../src/lib/serviceHistory';
import {
  alignmentEntry,
  alignmentSummary,
  appendTask,
  blankSupplies,
  entrySupplies,
  saveEntrySupplies,
  suppliesSummary,
} from '../../src/lib/maintenanceEntry';
describe('carga y edición unificadas de mantenimiento', () => {
  it('conserva sin interpretar el texto antiguo, incluso si solo se corrige otro campo', () => {
    for (const supplies of [
      'Shell Helix HX8 5W30 · MANN W712/95',
      '',
      'Sin insumos registrados',
      'Texto; con · separadores\ny saltos',
    ]) {
      const original = { ...initialServices[0], supplies };
      const result = saveEntrySupplies(entrySupplies(original), original);
      expect(result).toEqual({ supplies });
      expect(entrySupplies(original).oil).toBe('');
    }
  });
  it('reabre los campos estructurados sin perder códigos, acentos ni texto adicional y conserva el original', () => {
    const detail = {
      ...blankSupplies(),
      oil: 'Shell Helix HX8',
      viscosity: '5W-30',
      cabinFilter: 'MANN · CUK 2939',
      other: 'Arandela\ny repuesto "especial"',
    };
    const before = structuredClone(detail);
    const saved = { ...initialServices[0], ...saveEntrySupplies(detail) };
    expect(entrySupplies(saved)).toEqual(detail);
    expect(saved.supplies).toContain('Filtro de habitáculo: MANN · CUK 2939');
    expect(saved.supplies).toContain('Arandela\ny repuesto "especial"');
    const changed = entrySupplies(saved);
    changed.oil = 'Motul 8100';
    expect(entrySupplies(saved).oil).toBe('Shell Helix HX8');
    expect(detail).toEqual(before);
    expect(suppliesSummary(blankSupplies())).toBe('Sin insumos registrados');
  });
  it('conserva los campos en los respaldos y rechaza resúmenes inconsistentes o valores excesivos', () => {
    const detail = { ...blankSupplies(), airFilter: 'MANN C 2287' };
    const service = { ...initialServices[0], ...saveEntrySupplies(detail) };
    const data = {
      ...emptyData(),
      customers: initialCustomers,
      vehicles: initialVehicles,
      services: [service],
    };
    expect(parseBackup(JSON.stringify(makeBackup(data))).data.services[0].suppliesDetail).toEqual(
      detail,
    );
    expect(
      dataSchema.safeParse({ ...data, services: [{ ...service, supplies: 'otro' }] }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        ...data,
        services: [{ ...service, suppliesDetail: { ...detail, oil: 'x'.repeat(101) } }],
      }).success,
    ).toBe(false);
    const changes = recordServiceChange(initialServices[0], service, 'edited').changes!.at(
      -1,
    )!.changes;
    expect(changes.map((change) => change.field)).toContain('Campos de insumos');
  });
  it('reconoce únicamente el formato guardado de alineación y vuelve a guardarlo sin duplicaciones', () => {
    for (const [alignment, balancing] of [
      ['Ejes delantero y trasero', '2 ruedas delanteras'],
      ['', 'Las 4 ruedas'],
      ['No realizada', '2 ruedas traseras'],
      ['', ''],
    ]) {
      const work = alignmentSummary('Se corrigió la vibración.', alignment, balancing);
      const fields = alignmentEntry(work);
      expect(fields).toEqual({ alignment, balancing, work: 'Se corrigió la vibración.' });
      expect(alignmentSummary(fields.work, fields.alignment, fields.balancing)).toBe(work);
    }
    const free = 'Alineación revisada, detalle sin formato.';
    expect(alignmentEntry(free)).toEqual({ alignment: '', balancing: '', work: free });
  });
  it('agrega tareas explícitamente, sin reemplazar el texto ni repetir una tarea ya agregada', () => {
    expect(appendTask('', 'Cambio de aceite de motor')).toBe('Cambio de aceite de motor');
    const text = 'Detalle escrito por el taller.\nControl de niveles';
    expect(appendTask(text, 'Control de niveles')).toBe(text);
    expect(appendTask(text, 'Revisión de frenos')).toBe(text + '\nRevisión de frenos');
  });
});
