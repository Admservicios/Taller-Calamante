import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useData } from '../app/store';
import { PageTitle, Empty } from '../components/ui';
import { QuoteHistory } from '../components/QuoteHistory';
import { dateLabel, number } from '../lib/demo';
import { reportMoney } from '../lib/maintenanceReport';
import { workStages } from '../lib/workOrders';
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
export function PendingJobs() {
  const { jobs = [], vehicles, customers } = useData();
  const [params, setParams] = useSearchParams();
  const search = params.get('buscar') ?? '';
  const stage = ['abiertos', 'presupuesto', 'en-trabajo', 'cancelado', 'todos'].includes(
    params.get('etapa') ?? '',
  )
    ? params.get('etapa')!
    : 'abiertos';
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const customersById = new Map(customers.map((c) => [c.id, c]));
  const change = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        value ? next.set(key, value) : next.delete(key);
        next.delete('pagina');
        return next;
      },
      { replace: true, flushSync: true },
    );
  const filtered = jobs
    .filter((job) => {
      const v = vehiclesById.get(job.vehicleId);
      const c = v && customersById.get(v.customerId);
      return (
        (stage === 'todos' ||
          (stage === 'abiertos' && job.stage !== 'cancelado') ||
          stage === job.stage) &&
        normalize(
          `${v?.plate} ${v?.brand} ${v?.model} ${c?.name} ${job.type} ${job.work}`,
        ).includes(normalize(search))
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const requested = Number(params.get('pagina') ?? 1);
  const page = Math.max(1, Math.min(pages, Number.isSafeInteger(requested) ? requested : 1));
  return (
    <>
      <PageTitle
        title="Mantenimientos"
        subtitle="Prepará presupuestos y seguí los trabajos hasta completarlos."
        actions={
          <Link className="button primary" to="/mantenimientos/nuevo?estado=presupuesto">
            <Plus size={17} />
            Nuevo presupuesto
          </Link>
        }
      />
      <div className="filter-bar job-filters">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar presupuestos y trabajos"
            placeholder="Patente, cliente o trabajo…"
            value={search}
            onChange={(e) => change('buscar', e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por estado del trabajo"
          value={stage}
          onChange={(e) => change('etapa', e.target.value)}
        >
          <option value="abiertos">En curso</option>
          <option value="presupuesto">Presupuestos</option>
          <option value="en-trabajo">En trabajo</option>
          <option value="cancelado">Cancelados</option>
          <option value="todos">Todos</option>
        </select>
        <button
          className="button"
          onClick={() => setParams({ vista: 'pendientes' }, { replace: true, flushSync: true })}
        >
          Limpiar filtros
        </button>
      </div>
      <div className="pending-jobs">
        {filtered.slice((page - 1) * 10, page * 10).map((job) => {
          const v = vehiclesById.get(job.vehicleId);
          const c = v && customersById.get(v.customerId);
          return (
            <article className="panel pending-job" key={job.id} data-job-id={job.id}>
              <div className="pending-job-heading">
                <div>
                  <h2>
                    {v?.plate} · {v?.brand} {v?.model}
                  </h2>
                  <p>
                    {c?.name} · {dateLabel(job.date)}
                  </p>
                </div>
                <span
                  className={`badge ${job.stage === 'cancelado' ? 'neutral' : job.stage === 'presupuesto' ? 'amber' : 'blue'}`}
                >
                  {workStages[job.stage]}
                </span>
              </div>
              <p>
                <strong>{job.type}</strong> · {number(job.km)} km informados
              </p>
              <div className="pending-job-actions">
                <strong>{reportMoney(job.amount)}</strong>
                <Link
                  className="button primary small"
                  to={`/mantenimientos/${encodeURIComponent(job.id)}/editar`}
                >
                  Abrir trabajo
                </Link>
              </div>
              {job.cancellationReason && (
                <p className="fineprint">Motivo: {job.cancellationReason}</p>
              )}
              <QuoteHistory service={job} />
            </article>
          );
        })}
      </div>
      {!filtered.length && <Empty text="No hay presupuestos o trabajos en este listado" />}
      <div className="history-pagination">
        <span>{filtered.length} presupuestos y trabajos</span>
        <button
          className="button small"
          disabled={page <= 1}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set('pagina', String(page - 1));
            setParams(next, { replace: true, flushSync: true });
          }}
        >
          Anterior
        </button>
        <span>
          Página {page} de {pages}
        </span>
        <button
          className="button small"
          disabled={page >= pages}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set('pagina', String(page + 1));
            setParams(next, { replace: true, flushSync: true });
          }}
        >
          Siguiente
        </button>
      </div>
    </>
  );
}
