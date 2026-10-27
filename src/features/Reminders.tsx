import { MoreOptions } from '../components/MoreOptions';
import { CustomerFilter } from '../components/CustomerFilter';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, Copy, Info, MessageSquare, Plus, Search } from 'lucide-react';
import { useData } from '../app/store';
import { Badge, Empty, Modal, PageTitle, Panel } from '../components/ui';
import { dateLabel, number } from '../lib/demo';
import { allPlanRows, planServiceURL, planStatus } from '../lib/maintenancePlans';
import { customerReminder, dueDetail } from '../lib/customerReminder';

function ReminderPreview({
  vehicleId,
  category,
  close,
}: {
  vehicleId: string;
  category: string;
  close: () => void;
}) {
  const { vehicles, customers, workshop, referenceDate, mode } = useData();
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const customer = customers.find((c) => c.id === vehicle?.customerId);
  const [selected, setSelected] = useState(new Set([category]));
  const [feedback, setFeedback] = useState('');
  const [copiedText, setCopiedText] = useState('');
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rows = vehicle ? allPlanRows([vehicle], referenceDate) : [];
  const plans = rows.filter(({ plan }) => selected.has(plan.category)).map(({ plan }) => plan);
  const text =
    vehicle && customer
      ? customerReminder({
          customer,
          vehicle,
          plans,
          workshop,
          today: referenceDate,
          demo: mode === 'demo',
        })
      : '';
  const copy = async () => {
    if (!text || busy) return;
    setBusy(true);
    setFeedback('');
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      /* Se ofrece selección y copia manual. */
    }
    if (!copied) {
      textRef.current?.focus();
      textRef.current?.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        /* El texto queda seleccionado. */
      }
    }
    setCopiedText(text);
    setFeedback(
      copied
        ? 'Aviso copiado. Podés pegarlo y revisarlo en el medio que uses para contactar al cliente.'
        : 'El navegador no permitió copiar. El texto quedó seleccionado: usá Copiar en tu dispositivo o Ctrl+C.',
    );
    setBusy(false);
  };
  return (
    <Modal title="Preparar aviso al cliente" close={close}>
      <div className="form-stack reminder-preview">
        {!vehicle || !customer ? (
          <p role="alert">
            El vehículo o su cliente ya no están disponibles. Volvé a abrir la agenda.
          </p>
        ) : (
          <>
            <p>
              <strong>{customer.name}</strong>
              <br />
              {vehicle.brand} {vehicle.model} · {vehicle.plate}
            </p>
            <div className="notice">
              <strong>Teléfono del cliente</strong>
              <p>{customer.phone || 'Sin teléfono registrado'}</p>
              <Link
                className="text-link"
                to={`/clientes?cliente=${encodeURIComponent(customer.id)}`}
              >
                Ver ficha del cliente
              </Link>
            </div>
            <fieldset className="reminder-plan-picker">
              <legend>Servicios a incluir en el aviso</legend>
              {rows.map(({ plan }) => (
                <button
                  type="button"
                  className={`button reminder-plan-option ${selected.has(plan.category) ? 'selected' : ''}`}
                  key={plan.category}
                  aria-pressed={selected.has(plan.category)}
                  onClick={() => {
                    const next = new Set(selected);
                    next.has(plan.category) ? next.delete(plan.category) : next.add(plan.category);
                    setSelected(next);
                    setFeedback('');
                  }}
                >
                  <span>
                    <strong>{plan.label}</strong>
                    <small>
                      {dateLabel(plan.nextDate)} · {number(plan.nextKm)} km
                    </small>
                  </span>
                  <Badge>{planStatus(plan, vehicle.km, referenceDate)}</Badge>
                </button>
              ))}
            </fieldset>
            <label>
              Texto del aviso
              <textarea
                ref={textRef}
                readOnly
                rows={10}
                value={text}
                placeholder="Elegí al menos un servicio."
              />
            </label>
            <p className="fineprint">
              Revisá los servicios seleccionados y el teléfono antes de contactar al cliente. Podés
              modificar el texto después de pegarlo.{' '}
              {mode === 'demo' && 'Este aviso contiene datos ficticios.'}
            </p>
            <button
              type="button"
              className="button primary"
              disabled={!text || busy}
              onClick={copy}
            >
              <Copy size={17} />
              {busy ? 'Copiando…' : 'Copiar aviso'}
            </button>
            {feedback && copiedText === text && (
              <p role="status" className="reminder-copy-feedback">
                {feedback}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function Reminders() {
  const { vehicles, customers, referenceDate } = useData();
  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState<{ vehicleId: string; category: string } | null>(null);
  const status = params.get('estado') ?? 'Todos';
  const search = params.get('buscar') ?? '';
  const customerId = params.get('cliente') ?? '';
  const category = params.get('tipo') ?? '';
  const pageSize = params.get('cantidad') === '50' ? 50 : 20;
  const currentParams = () => {
    const url = new URL(window.location.href);
    return new URLSearchParams(
      url.hash.startsWith('#/') ? (url.hash.split('?')[1] ?? '') : url.search,
    );
  };
  const change = (key: string, value: string) => {
    const next = currentParams();
    value ? next.set(key, value) : next.delete(key);
    next.delete('pagina');
    setParams(next, { replace: true, flushSync: true });
  };
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  const query = normalize(search);
  const rows = allPlanRows(vehicles, referenceDate);
  const categories = [
    ...new Map(rows.map(({ plan }) => [plan.category, plan.label])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const matching = rows.filter(
    ({ vehicle, plan }) =>
      (!customerId || vehicle.customerId === customerId) &&
      (!category || plan.category === category) &&
      normalize(
        `${vehicle.plate} ${vehicle.brand} ${vehicle.model} ${plan.label} ${plan.recommendation} ${customerById.get(vehicle.customerId)?.name ?? ''}`,
      ).includes(query),
  );
  const filtered = matching.filter(
    ({ vehicle, plan }) =>
      status === 'Todos' || planStatus(plan, vehicle.km, referenceDate) === status,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requested = Number(params.get('pagina') ?? 1);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const go = (value: number) => {
    const next = currentParams();
    next.set('pagina', String(value));
    setParams(next, { replace: true, flushSync: true });
  };
  return (
    <>
      <PageTitle
        title="Próximos servicios"
        subtitle="Anticipate a cada revisión. Que ningún mantenimiento quede atrás."
      />
      <div className="reminder-summary">
        {['Vencido', 'Próximo', 'Al día'].map((state, i) => (
          <button
            key={state}
            aria-pressed={status === state}
            className={`reminder-summary-card ${['red', 'amber', 'green'][i]} ${status === state ? 'chosen' : ''}`}
            onClick={() => change('estado', currentParams().get('estado') === state ? '' : state)}
          >
            <CalendarDays size={24} />
            <span>
              <strong>
                {
                  matching.filter(
                    ({ vehicle, plan }) => planStatus(plan, vehicle.km, referenceDate) === state,
                  ).length
                }
              </strong>
              <small>
                {state === 'Vencido'
                  ? 'Vencidos'
                  : state === 'Próximo'
                    ? 'Próximos a vencer'
                    : 'Al día'}
              </small>
            </span>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      <section className="panel reminder-filters" aria-label="Filtros de próximos servicios">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar próximos servicios"
            placeholder="Patente, cliente o tipo de servicio…"
            value={search}
            onChange={(e) => change('buscar', e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar vencimientos"
          value={status}
          onChange={(e) => change('estado', e.target.value)}
        >
          {['Todos', 'Vencido', 'Próximo', 'Al día'].map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
        <button
          className="button"
          onClick={() => setParams({}, { replace: true, flushSync: true })}
        >
          Limpiar filtros
        </button>
        <MoreOptions
          label="Más opciones de próximos servicios"
          active={[customerId, category].filter(Boolean).length}
        >
          <div className="options-fields">
            <CustomerFilter
              label="Cliente de próximos servicios"
              customers={customers}
              value={customerId}
              onChange={(value) => change('cliente', value)}
            />
            <select
              aria-label="Tipo de próximos servicios"
              value={category}
              onChange={(e) => change('tipo', e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {categories.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </MoreOptions>
        <span className="results-count" aria-live="polite">
          {filtered.length} servicios · {new Set(filtered.map(({ vehicle }) => vehicle.id)).size}{' '}
          vehículos
        </span>
      </section>
      <Panel title="Agenda de mantenimiento" icon={CalendarDays}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Cliente</th>
                <th>Trabajo recomendado</th>
                <th>Fecha / Kilometraje objetivo</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice((page - 1) * pageSize, page * pageSize)
                .map(({ vehicle: v, plan }) => {
                  const due = dueDetail(plan, v.km, referenceDate);
                  return (
                    <tr
                      key={`${v.id}-${plan.category}`}
                      data-vehicle-id={v.id}
                      data-plan-category={plan.category}
                    >
                      <td>
                        <Link className="table-link" to={`/vehiculos/${v.id}`}>
                          <strong>{v.plate}</strong>
                          <small>
                            {v.brand} {v.model}
                          </small>
                        </Link>
                      </td>
                      <td>{customerById.get(v.customerId)?.name}</td>
                      <td>
                        <strong>{plan.label}</strong>
                        <small className="block muted">{plan.recommendation}</small>
                      </td>
                      <td>
                        <div className="table-link">
                          <strong>{dateLabel(plan.nextDate)}</strong>
                          <small>{due.date}</small>
                          <small>
                            {number(plan.nextKm)} km · actual: {number(v.km)} km
                          </small>
                          <small>{due.km}</small>
                        </div>
                      </td>
                      <td>
                        <Badge>{planStatus(plan, v.km, referenceDate)}</Badge>
                      </td>
                      <td>
                        <div className="reminder-row-actions">
                          <Link className="button small" to={planServiceURL(v, plan)}>
                            <Plus size={14} />
                            Registrar
                          </Link>
                          <button
                            className="button small"
                            aria-label={`Preparar aviso de ${plan.label} para ${v.plate}`}
                            onClick={() => setPreview({ vehicleId: v.id, category: plan.category })}
                          >
                            <MessageSquare size={14} />
                            Preparar aviso
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!filtered.length && <Empty text="No hay servicios con estos filtros" />}
        <div className="history-pagination">
          <span>
            {filtered.length
              ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`
              : '0 servicios'}
          </span>
          <nav aria-label="Páginas de próximos servicios">
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
            Servicios por página
            <select value={pageSize} onChange={(e) => change('cantidad', e.target.value)}>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>
      </Panel>
      <div className="info-strip">
        <Info size={18} />
        <span>
          Fecha de referencia: {dateLabel(referenceDate)}. “Próximo” significa hasta 30 días o 1.000
          km restantes. Se usan los últimos kilómetros registrados; confirmalos con el cliente. Los
          contadores respetan la búsqueda, el cliente y el tipo elegidos.
        </span>
      </div>
      {preview && (
        <ReminderPreview
          key={`${preview.vehicleId}-${preview.category}`}
          {...preview}
          close={() => setPreview(null)}
        />
      )}
    </>
  );
}
