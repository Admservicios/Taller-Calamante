import { CustomerFilter } from '../components/CustomerFilter';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, History, Plus, Search, Wrench } from 'lucide-react';
import { useData } from '../app/store';
import { Empty, Modal, ModalCancelButton, PageTitle, Panel } from '../components/ui';
import { PhotoGallery } from '../components/MaintenancePhotos';
import { ServicePDFButton } from '../components/ServicePDFButton';
import { dateLabel, download, number, type Service } from '../lib/demo';
import { maintenanceKind } from '../lib/maintenancePlans';
import { maintenanceCSV, maintenanceSummary, reportMoney as money } from '../lib/maintenanceReport';

const actions = {
  created: 'Registro creado',
  edited: 'Registro editado',
  annulled: 'Mantenimiento anulado',
  restored: 'Mantenimiento recuperado',
};
function timestamp(value: string) {
  return new Date(value).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
function ChangeValue({ field, value }: { field: string; value: string }) {
  const { vehicles } = useData();
  if (field === 'Vehículo (ID)') {
    const vehicle = vehicles.find((v) => v.id === value);
    return <span>{vehicle ? `${vehicle.plate} · ${vehicle.brand} ${vehicle.model}` : value}</span>;
  }
  if (field === 'Vencimiento' && value !== 'Sin dato') {
    try {
      const plan = JSON.parse(value);
      return (
        <span>
          {plan.label} · {dateLabel(plan.nextDate)} · {number(plan.nextKm)} km ·{' '}
          {plan.recommendation}
        </span>
      );
    } catch {
      /* Un valor importado se muestra como texto. */
    }
  }
  return (
    <span>
      {field === 'Importe' ? money(Number(value)) : field === 'Fecha' ? dateLabel(value) : value}
    </span>
  );
}
function ServiceHistory({ service, close }: { service: Service; close: () => void }) {
  const { vehicles } = useData();
  const vehicle = vehicles.find((v) => v.id === service.vehicleId);
  return (
    <Modal title="Detalle y cambios del mantenimiento" close={close}>
      <div className="form-stack service-audit">
        <p>
          <strong>
            {vehicle?.plate} · {service.type}
          </strong>
          <br />
          {dateLabel(service.date)} · {number(service.km)} km · {money(service.amount)}
        </p>
        {service.annulment && (
          <div className="notice">
            <strong>Anulado el {timestamp(service.annulment.at)}</strong>
            <p>{service.annulment.reason}</p>
          </div>
        )}
        <dl>
          <dt>Trabajos realizados</dt>
          <dd>{service.work || 'Sin detalle'}</dd>
          <dt>Insumos</dt>
          <dd>{service.supplies || 'Sin insumos'}</dd>
          <dt>Observaciones privadas</dt>
          <dd>{service.notes || 'Sin observaciones'}</dd>
        </dl>
        <PhotoGallery services={[service]} />
        <h3>Historial de cambios</h3>
        <p className="fineprint">
          Se registran los cambios realizados desde esta actualización. Los registros anteriores no
          tienen un historial reconstruido. Este detalle es privado del taller.
        </p>
        {!service.changes?.length && <p>Todavía no hay cambios registrados.</p>}
        <ol className="service-audit-list">
          {[...(service.changes ?? [])].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <strong>{actions[entry.action]}</strong>
              <small>{timestamp(entry.at)}</small>
              {entry.reason && <p>Motivo: {entry.reason}</p>}
              {entry.changes.map((change, i) => (
                <div className="audit-change" key={i}>
                  <strong>{change.field}</strong>
                  <div>
                    <small>Antes</small>
                    <ChangeValue field={change.field} value={change.before} />
                  </div>
                  <div>
                    <small>Después</small>
                    <ChangeValue field={change.field} value={change.after} />
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
function StatusDialog({ service, close }: { service: Service; close: () => void }) {
  const { vehicles, setServiceStatus, notify } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const restoring = !!service.annulment;
  const vehicle = vehicles.find((v) => v.id === service.vehicleId);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();
    setBusy(true);
    setError('');
    if (await setServiceStatus(service, reason)) {
      notify(
        restoring
          ? 'Mantenimiento recuperado. Kilómetros y vencimientos actualizados.'
          : 'Mantenimiento anulado. Sus datos y fotos se conservaron.',
      );
      close();
    } else {
      setError('No se pudo guardar. Revisá el aviso del taller y volvé a intentarlo.');
      setBusy(false);
    }
  };
  return (
    <Modal title={restoring ? 'Recuperar mantenimiento' : 'Anular mantenimiento'} close={close}>
      <form className="form-stack" onSubmit={submit}>
        <p>
          <strong>
            {vehicle?.plate} · {service.type}
          </strong>
          <br />
          {dateLabel(service.date)} · {number(service.km)} km
        </p>
        <p>
          {restoring
            ? 'El registro volverá al historial activo. Se verificará que sus kilómetros sean coherentes con las otras visitas.'
            : 'El registro dejará de contar en el historial activo, las estadísticas y los vencimientos. Se conservarán sus datos y fotos para poder recuperarlo.'}
        </p>
        <p className="fineprint">
          Se recalculan los vencimientos del servicio afectado. Las lecturas y los ajustes manuales
          se conservan. Los PDF ya descargados permanecen en tu dispositivo.
        </p>
        <label>
          Motivo de {restoring ? 'recuperación' : 'anulación'}
          <textarea name="reason" required minLength={3} maxLength={500} rows={3} />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <ModalCancelButton className="button" onClick={close} disabled={busy}>
            Cancelar
          </ModalCancelButton>
          <button className="button primary" disabled={busy}>
            {busy ? 'Guardando…' : restoring ? 'Confirmar recuperación' : 'Confirmar anulación'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function MaintenanceList() {
  const { services, vehicles, customers, mode, referenceDate, notify } = useData();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ service: Service; kind: 'history' | 'status' } | null>(
    null,
  );
  const search = params.get('buscar') ?? '';
  const customer = params.get('cliente') ?? '';
  const category = params.get('tipo') ?? '';
  const state = params.get('estado') ?? 'activos';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const pageSize = [10, 25, 50].includes(Number(params.get('cantidad')))
    ? Number(params.get('cantidad'))
    : 10;
  // La dirección se actualiza antes que la transición de React. Leerla evita
  // reponer filtros viejos al cambiar otro control inmediatamente después.
  const currentParams = () => {
    const url = new URL(window.location.href);
    return new URLSearchParams(
      url.hash.startsWith('#/') ? (url.hash.split('?')[1] ?? '') : url.search,
    );
  };
  const update = (key: string, value: string) => {
    const next = currentParams();
    value ? next.set(key, value) : next.delete(key);
    next.delete('pagina');
    setParams(next, { replace: true, flushSync: true });
  };
  const categories = [
    ...new Map(
      services.map((s) => {
        const kind = maintenanceKind(s.type);
        return [kind.key, kind.label];
      }),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const invalidDates = !!from && !!to && from > to;
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const query = normalize(search);
  const filtered = services
    .filter((service) => {
      const vehicle = vehiclesById.get(service.vehicleId);
      const owner = vehicle && customersById.get(vehicle.customerId);
      return (
        !invalidDates &&
        (state === 'todos' || (state === 'anulados' ? !!service.annulment : !service.annulment)) &&
        (!customer || vehicle?.customerId === customer) &&
        (!category || maintenanceKind(service.type).key === category) &&
        (!from || service.date >= from) &&
        (!to || service.date <= to) &&
        normalize(
          `${service.type} ${service.work} ${service.supplies} ${vehicle?.brand} ${vehicle?.model} ${vehicle?.plate} ${owner?.name}`,
        ).includes(query)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km || a.id.localeCompare(b.id));
  const summary = maintenanceSummary(filtered);
  const exportCSV = () => {
    if (!filtered.length || invalidDates) return;
    try {
      download(
        `taller-calamante-mantenimientos${mode === 'demo' ? '-demo' : ''}-${referenceDate}.csv`,
        maintenanceCSV(filtered, vehicles, customers, mode === 'demo'),
        'text/csv;charset=utf-8',
      );
      notify(
        `CSV descargado con ${filtered.length} mantenimientos${mode === 'demo' ? ' de demostración' : ''}. Incluye todas las páginas del resultado filtrado.`,
      );
    } catch {
      notify('No se pudo descargar el CSV. Tus registros se conservan; volvé a intentarlo.');
    }
  };
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requestedPage = Number(params.get('pagina') ?? 1);
  const page = Math.min(
    pages,
    Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1),
  );
  const go = (number: number) => {
    const next = currentParams();
    next.set('pagina', String(number));
    setParams(next, { replace: true, flushSync: true });
  };
  return (
    <>
      <PageTitle
        title="Mantenimientos"
        subtitle="El trabajo de tu taller, registrado visita a visita."
        actions={
          <div className="history-heading-actions">
            <button
              className="button"
              onClick={exportCSV}
              disabled={!filtered.length || invalidDates}
            >
              <Download size={17} />
              Exportar CSV
            </button>
            <Link className="button primary" to="/mantenimientos/nuevo">
              <Plus size={17} />
              Registrar mantenimiento
            </Link>
          </div>
        }
      />
      <section className="panel history-filters" aria-label="Filtros del historial">
        <div className="input-icon history-search">
          <Search size={17} />
          <input
            aria-label="Buscar mantenimientos"
            placeholder="Patente, cliente, vehículo o trabajo…"
            value={search}
            onChange={(e) => update('buscar', e.target.value)}
          />
        </div>
        <div className="customer-filter-field">
          <span>Cliente del vehículo</span>
          <CustomerFilter
            label="Cliente del vehículo"
            customers={customers}
            value={customer}
            onChange={(value) => update('cliente', value)}
          />
        </div>
        <label>
          Tipo de servicio
          <select value={category} onChange={(e) => update('tipo', e.target.value)}>
            <option value="">Todos los servicios</option>
            {categories.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado del mantenimiento
          <select value={state} onChange={(e) => update('estado', e.target.value)}>
            <option value="activos">Activos</option>
            <option value="anulados">Anulados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => update('desde', e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => update('hasta', e.target.value)} />
        </label>
        <button
          className="button"
          onClick={() => setParams({}, { replace: true, flushSync: true })}
        >
          Limpiar filtros
        </button>
        <span className="results-count" aria-live="polite">
          {filtered.length} registros
        </span>
        {invalidDates && <p role="alert">La fecha Desde debe ser anterior o igual a Hasta.</p>}
      </section>
      <section aria-label="Resumen del historial" className="history-report">
        <div className="history-report-cards">
          <article aria-label="Servicios activos del resultado">
            <span>Servicios activos</span>
            <strong>{number(summary.active)}</strong>
            <small>Dentro de los filtros elegidos</small>
          </article>
          <article aria-label="Importe de servicios activos">
            <span>Importe registrado</span>
            <strong>{money(summary.total)}</strong>
            <small>ARS · Solo servicios activos</small>
          </article>
          <article aria-label="Importe promedio por servicio activo">
            <span>Importe promedio</span>
            <strong>{money(summary.average)}</strong>
            <small>ARS · Por servicio activo</small>
          </article>
          <article aria-label="Servicios anulados del resultado">
            <span>Servicios anulados</span>
            <strong>{number(summary.annulled)}</strong>
            <small>Fuera de los importes del resumen</small>
          </article>
        </div>
        <p className="fineprint">
          El resumen y el CSV incluyen todas las páginas del resultado filtrado. Los importes son
          valores registrados de servicios; no indican cobros ni ganancias. El CSV incluye los
          anulados si los elegís en Estado, y excluye notas privadas e historial de cambios.{' '}
          {mode === 'demo' && 'Estás viendo datos ficticios de demostración.'}
        </p>
      </section>
      <Panel title="Historial del taller" icon={Wrench}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Vehículo</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Kilometraje</th>
                <th>Importe</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice((page - 1) * pageSize, page * pageSize).map((service) => {
                const v = vehicles.find((v) => v.id === service.vehicleId);
                return (
                  <tr key={service.id} data-service-id={service.id}>
                    <td>{dateLabel(service.date)}</td>
                    <td>
                      <Link className="table-link" to={`/vehiculos/${service.vehicleId}`}>
                        <strong>{v?.plate}</strong>
                        <small>
                          {v?.brand} {v?.model}
                        </small>
                      </Link>
                    </td>
                    <td>{customers.find((c) => c.id === v?.customerId)?.name}</td>
                    <td>
                      <span className="service-type">
                        <Wrench size={15} />
                        {service.type}
                      </span>
                      {service.annulment && <span className="badge red">Anulado</span>}
                    </td>
                    <td>{number(service.km)} km</td>
                    <td>{money(service.amount)}</td>
                    <td>
                      <div className="history-row-actions">
                        {!service.annulment && (
                          <>
                            <Link
                              className="button small"
                              to={`/mantenimientos/${service.id}/editar`}
                              aria-label={`Editar servicio de ${v?.plate} del ${service.date}`}
                            >
                              Editar
                            </Link>
                            <ServicePDFButton service={service} />
                          </>
                        )}
                        <button
                          className="button small"
                          aria-label={`Ver cambios de ${v?.plate} del ${service.date}`}
                          onClick={() => setDialog({ service, kind: 'history' })}
                        >
                          <History size={14} />
                          Detalle y cambios
                        </button>
                        <button
                          className="button small"
                          aria-label={`${service.annulment ? 'Recuperar' : 'Anular'} servicio de ${v?.plate} del ${service.date}`}
                          onClick={() => setDialog({ service, kind: 'status' })}
                        >
                          {service.annulment ? 'Recuperar' : 'Anular'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty text="No encontramos mantenimientos" />}
        <div className="history-pagination">
          <span>
            {filtered.length
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`
              : '0 registros'}
          </span>
          <nav aria-label="Páginas del historial">
            <button className="button small" disabled={page <= 1} onClick={() => go(page - 1)}>
              Anterior
            </button>
            <span aria-live="polite">
              Página {page} de {pages}
            </span>
            <button className="button small" disabled={page >= pages} onClick={() => go(page + 1)}>
              Siguiente
            </button>
          </nav>
          <label>
            Registros por página
            <select value={pageSize} onChange={(e) => update('cantidad', e.target.value)}>
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>
      {dialog?.kind === 'history' && (
        <ServiceHistory service={dialog.service} close={() => setDialog(null)} />
      )}
      {dialog?.kind === 'status' && (
        <StatusDialog service={dialog.service} close={() => setDialog(null)} />
      )}
    </>
  );
}
