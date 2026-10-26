import { isServerMode } from '../lib/serverClient';
import { randomId } from '../lib/ids';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  Download,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Avatar, Badge, Empty, Modal, ModalCancelButton, PageTitle, Panel } from '../components/ui';
import { useData } from '../app/store';
import { dateLabel, download, money, type Customer } from '../lib/demo';
import { customerRows, selectCustomerRows, customerCatalogueCSV } from '../lib/customerCatalogue';

export function CustomerEditor({ customer, close }: { customer?: Customer; close: () => void }) {
  const { saveCustomer, notify, mode } = useData();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name')).trim();
    if (!name) return;
    const saved = await saveCustomer({
      id: customer?.id ?? randomId(),
      name,
      document: String(data.get('document')).trim(),
      email: String(data.get('email')).trim(),
      phone: String(data.get('phone')).trim(),
      address: String(data.get('address')).trim(),
      notes: String(data.get('notes')).trim(),
      active: data.get('active') === 'on',
    });
    if (!saved) return;
    notify(
      `${customer ? 'Cliente actualizado' : 'Cliente creado'}${mode === 'demo' ? ' en la demostración.' : ' en la base local.'}`,
    );
    close();
  };
  return (
    <Modal title={customer ? 'Editar cliente' : 'Nuevo cliente'} close={close}>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          {mode === 'demo'
            ? 'Registro de prueba: los cambios se pierden al recargar.'
            : isServerMode()
              ? 'Los cambios se guardan en la PC del taller.'
              : 'Los cambios se guardan en este navegador.'}
        </p>
        <div className="form-grid">
          <label>
            Nombre y apellido <span>*</span>
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={customer?.name}
              autoComplete="name"
            />
          </label>
          <label>
            DNI / CUIT
            <input name="document" maxLength={25} defaultValue={customer?.document} />
          </label>
          <label>
            Teléfono
            <input
              name="phone"
              type="tel"
              maxLength={30}
              defaultValue={customer?.phone}
              autoComplete="tel"
            />
          </label>
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              maxLength={150}
              defaultValue={customer?.email}
              autoComplete="email"
            />
          </label>
        </div>
        <label>
          Dirección
          <input name="address" maxLength={200} defaultValue={customer?.address} />
        </label>
        <label>
          Observaciones
          <textarea name="notes" rows={3} maxLength={500} defaultValue={customer?.notes} />
        </label>
        <label className="check-label">
          <input name="active" type="checkbox" defaultChecked={customer?.active ?? true} />
          Cliente activo
        </label>
        <div className="modal-actions">
          <ModalCancelButton className="button" type="button" onClick={close}>
            Cancelar
          </ModalCancelButton>
          <button className="button primary" type="submit">
            <Check size={16} />
            {mode === 'demo' ? 'Guardar en demo' : 'Guardar cliente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Customers() {
  const { customers, vehicles, activeServices: services, mode, referenceDate, notify } = useData();
  const [params, setParams] = useSearchParams();
  const selected = customers.find((c) => c.id === (params.get('cliente') ?? customers[0]?.id));
  const search = params.get('buscar') ?? '';
  const status = ['activos', 'inactivos'].includes(params.get('estado') ?? '')
    ? params.get('estado')!
    : 'todos';
  const ownership = ['con', 'sin'].includes(params.get('vehiculos') ?? '')
    ? params.get('vehiculos')!
    : 'todos';
  const order = ['nombre-desc', 'vehiculos'].includes(params.get('orden') ?? '')
    ? params.get('orden')!
    : 'nombre';
  const pageSize = [10, 25, 50].includes(Number(params.get('cantidad')))
    ? Number(params.get('cantidad'))
    : 10;
  const currentParams = () => {
    const url = new URL(window.location.href);
    return new URLSearchParams(
      url.hash.startsWith('#/') ? (url.hash.split('?')[1] ?? '') : url.search,
    );
  };
  const change = (key: string, value: string, resetPage = true) => {
    const next = currentParams();
    value ? next.set(key, value) : next.delete(key);
    if (resetPage) next.delete('pagina');
    setParams(next, { replace: true, flushSync: true });
  };
  const selectCustomer = (id: string) => {
    const next = currentParams();
    next.set('cliente', id);
    setParams(next);
  };
  const go = (value: number) => {
    change('pagina', String(value), false);
    searchRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  };
  const [tab, setTab] = useState('Información');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [detailRequest, setDetailRequest] = useState(0);
  const explicitCustomer = params.get('cliente');
  useEffect(() => {
    if (!selected || !explicitCustomer || !window.matchMedia('(max-width: 950px)').matches) return;
    const frame = requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      detailRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selected?.id, explicitCustomer, detailRequest]);

  const rows = customerRows(customers, vehicles);
  const filtered = selectCustomerRows(rows, { search, status, ownership, order });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requested = Number(params.get('pagina') ?? 1);
  const currentPage = Math.min(
    pageCount,
    Math.max(1, Number.isSafeInteger(requested) ? requested : 1),
  );
  const selectedVehicles = vehicles.filter((v) => v.customerId === selected?.id);
  const selectedServices = services
    .filter((s) => selectedVehicles.some((v) => v.id === s.vehicleId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const exportCSV = () => {
    if (!filtered.length) return;
    try {
      download(
        `taller-calamante-clientes${mode === 'demo' ? '-demo' : ''}-${referenceDate}.csv`,
        customerCatalogueCSV(filtered, referenceDate, mode === 'demo'),
        'text/csv;charset=utf-8',
      );
      notify(
        `CSV descargado con ${filtered.length} clientes${mode === 'demo' ? ' de demostración' : ''}. Incluye todas las páginas filtradas.`,
      );
    } catch {
      notify('No se pudo descargar el CSV. Volvé a intentarlo.');
    }
  };
  return (
    <>
      <PageTitle
        title="Clientes"
        subtitle="Conocé a tus clientes. Acompañá cada kilómetro."
        actions={
          <>
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              Nuevo cliente
            </button>
            <button className="button" onClick={exportCSV} disabled={!filtered.length}>
              <Download size={17} />
              Exportar CSV
            </button>
          </>
        }
      />
      <div className={`customers-layout ${selected ? '' : 'detail-hidden'}`}>
        <div className="customers-main">
          <Panel title="Tu comunidad de clientes" icon={Users}>
            <div className="customer-stats">
              {[
                {
                  label: 'Clientes activos',
                  value: customers.filter((c) => c.active).length,
                  color: 'blue',
                  icon: Users,
                },
                {
                  label: 'Con vehículos',
                  value: rows.filter((row) => row.vehicles.length > 0).length,
                  color: 'green',
                  icon: CarFront,
                },
                {
                  label: 'Clientes inactivos',
                  value: customers.filter((c) => !c.active).length,
                  color: 'red',
                  icon: UserRound,
                },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label}>
                  <span className={`stat-icon ${color}`}>
                    <Icon size={22} />
                  </span>
                  <span>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <div className="filter-bar customer-catalogue-filters">
            <div className="input-icon">
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="Buscar clientes"
                placeholder="Nombre, DNI, teléfono, email o patente…"
                value={search}
                onChange={(e) => change('buscar', e.target.value)}
              />
            </div>
            <select
              aria-label="Filtrar clientes por estado"
              value={status}
              onChange={(e) => change('estado', e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
            <select
              aria-label="Filtrar clientes por vehículos"
              value={ownership}
              onChange={(e) => change('vehiculos', e.target.value)}
            >
              <option value="todos">Con o sin vehículos</option>
              <option value="con">Con vehículos</option>
              <option value="sin">Sin vehículos</option>
            </select>
            <select
              aria-label="Ordenar clientes"
              value={order}
              onChange={(e) => change('orden', e.target.value)}
            >
              <option value="nombre">Nombre: A–Z</option>
              <option value="nombre-desc">Nombre: Z–A</option>
              <option value="vehiculos">Más vehículos</option>
            </select>
            <button
              className="text-button"
              onClick={() => {
                const next = currentParams();
                for (const key of ['buscar', 'estado', 'vehiculos', 'pagina']) next.delete(key);
                setParams(next, { replace: true, flushSync: true });
              }}
            >
              <SlidersHorizontal size={15} />
              Limpiar
            </button>
          </div>
          <div className="panel table-panel">
            <div className="table-scroll">
              <table className="customer-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Contacto</th>
                    <th>Vehículos</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Editar</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map(({ customer: c, vehicles: owned }) => (
                      <tr key={c.id} className={selected?.id === c.id ? 'selected-row' : ''}>
                        <td>
                          <button
                            className="customer-name"
                            onClick={(event) => {
                              selectedButton.current = event.currentTarget;
                              setDetailRequest((request) => request + 1);
                              selectCustomer(c.id);
                              setTab('Información');
                            }}
                          >
                            <Avatar name={c.name} />
                            <span>
                              <strong>{c.name}</strong>
                              <small>
                                {c.document ? `DNI ${c.document}` : 'Sin documento registrado'}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <div className="contact-cell">
                            <span>
                              <Phone size={13} />
                              {c.phone || 'Sin teléfono'}
                            </span>
                            <span>
                              <Mail size={13} />
                              {c.email || 'Sin email'}
                            </span>
                          </div>
                        </td>
                        <td>{owned.length}</td>
                        <td>
                          <Badge>{c.active ? 'Activo' : 'Inactivo'}</Badge>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Editar ${c.name}`}
                            onClick={() => setEditing(c)}
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && <Empty text="No encontramos clientes" />}
          </div>
          <div className="history-pagination">
            <span>
              {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–
              {Math.min(currentPage * pageSize, filtered.length)} de {filtered.length} clientes
            </span>
            <nav aria-label="Páginas de clientes">
              <button
                className="button small"
                disabled={currentPage === 1}
                onClick={() => go(currentPage - 1)}
              >
                Anterior
              </button>
              <span aria-live="polite">
                Página {currentPage} de {pageCount}
              </span>
              <button
                className="button small"
                disabled={currentPage === pageCount}
                onClick={() => go(currentPage + 1)}
              >
                Siguiente
              </button>
            </nav>
            <label>
              Clientes por página
              <select value={pageSize} onChange={(e) => change('cantidad', e.target.value)}>
                {[10, 25, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="fineprint">
            El CSV incluye todos los clientes filtrados y sus patentes actuales, sin notas privadas,
            DNI ni domicilio. Los totales superiores representan toda la base.
          </p>
        </div>
        {selected && (
          <aside
            ref={detailRef}
            tabIndex={-1}
            aria-label={`Ficha de ${selected.name}`}
            className="panel customer-detail"
          >
            <button
              className="detail-close icon-button"
              aria-label="Cerrar ficha del cliente"
              onClick={() => {
                selectCustomer('ninguno');
                const target = selectedButton.current?.isConnected
                  ? selectedButton.current
                  : searchRef.current;
                target?.focus({ preventScroll: true });
                if (window.matchMedia('(max-width: 950px)').matches)
                  target?.scrollIntoView({ block: 'center', behavior: 'instant' });
              }}
            >
              <X size={17} />
            </button>
            <div className="customer-profile">
              <Avatar name={selected.name} size="large" />
              <div>
                <h2>{selected.name}</h2>
                <p>{selected.document ? `DNI ${selected.document}` : 'Sin documento registrado'}</p>
                <Badge>{selected.active ? 'Activo' : 'Inactivo'}</Badge>
              </div>
            </div>
            <div className="tabs" role="tablist" aria-label="Ficha del cliente">
              {['Información', 'Vehículos', 'Historial', 'Notas'].map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? 'active' : ''}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="detail-content" role="tabpanel" aria-label={tab}>
              {tab === 'Información' && (
                <>
                  <Panel
                    title="Información de contacto"
                    icon={UserRound}
                    action={
                      <button className="text-button" onClick={() => setEditing(selected)}>
                        <Pencil size={13} />
                        Editar
                      </button>
                    }
                  >
                    <div className="contact-list">
                      <span>
                        <Phone size={17} />
                        {selected.phone || 'Sin teléfono'}
                      </span>
                      <span>
                        <Mail size={17} />
                        {selected.email || 'Sin email'}
                      </span>
                      <span>
                        <MapPin size={17} />
                        {selected.address || 'Sin dirección'}
                      </span>
                    </div>
                  </Panel>
                  <Panel title="Vehículos del cliente" icon={CarFront}>
                    {selectedVehicles.length ? (
                      selectedVehicles.map((v) => (
                        <Link className="vehicle-list-item" key={v.id} to={`/vehiculos/${v.id}`}>
                          <span className="mini-car">
                            <CarFront size={28} />
                          </span>
                          <span>
                            <strong>
                              {v.brand} {v.model}
                            </strong>
                            <small>
                              {v.plate} · {v.year}
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </Link>
                      ))
                    ) : (
                      <p className="muted">Todavía no tiene vehículos asociados.</p>
                    )}
                  </Panel>
                  <button className="button full" onClick={() => setTab('Historial')}>
                    <CalendarDays size={16} />
                    Ver historial del cliente
                  </button>
                </>
              )}
              {tab === 'Vehículos' &&
                (selectedVehicles.length ? (
                  selectedVehicles.map((v) => (
                    <Link key={v.id} className="vehicle-list-item" to={`/vehiculos/${v.id}`}>
                      <CarFront size={25} />
                      <span>
                        <strong>
                          {v.brand} {v.model}
                        </strong>
                        <small>
                          {v.plate} · {v.year}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </Link>
                  ))
                ) : (
                  <Empty text="Sin vehículos asociados" />
                ))}
              {tab === 'Historial' &&
                (selectedServices.length ? (
                  selectedServices.map((s) => (
                    <div key={s.id}>
                      <Link className="history-mini" to={`/vehiculos/${s.vehicleId}`}>
                        <CalendarDays size={18} />
                        <span>
                          <strong>{s.type}</strong>
                          <small>
                            {dateLabel(s.date)} · {money(s.amount)}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </Link>
                      <Link className="button small" to={`/mantenimientos/${s.id}/editar`}>
                        <Pencil size={14} />
                        Editar mantenimiento
                      </Link>
                    </div>
                  ))
                ) : (
                  <Empty text="Sin mantenimientos registrados" />
                ))}
              {tab === 'Notas' && (
                <div className="notes-block">
                  <h3>Observaciones privadas</h3>
                  <p>{selected.notes || 'Este cliente no tiene observaciones.'}</p>
                  <button className="button" onClick={() => setEditing(selected)}>
                    <Pencil size={15} />
                    Editar notas
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      {editing && (
        <CustomerEditor
          customer={editing === 'new' ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
    </>
  );
}
