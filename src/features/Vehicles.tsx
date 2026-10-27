import { MoreOptions } from '../components/MoreOptions';
import { VehicleHistoryPDFButton } from '../components/VehicleHistoryPDF';
import { CustomerFilter } from '../components/CustomerFilter';
import { isServerMode } from '../lib/serverClient';
import { useConfirmDiscard } from '../components/UnsavedChanges';
import { randomId } from '../lib/ids';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { nextServiceDate } from '../lib/localDatabase';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  CarFront,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  Fuel,
  Gauge,
  Info,
  LayoutGrid,
  List,
  Mail,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Search,
  Settings2,
  UserRound,
  Wrench,
} from 'lucide-react';
import {
  Badge,
  Empty,
  Modal,
  ModalCancelButton,
  PageTitle,
  Panel,
  VehicleArt,
} from '../components/ui';
import { useData } from '../app/store';
import { ServicePDFButton } from '../components/ServicePDFButton';
import { PhotoGallery } from '../components/MaintenancePhotos';
import { MaintenanceSchedules } from '../components/MaintenanceSchedules';
import { VehicleDocuments } from '../components/VehicleDocuments';
import { nextVehiclePlan, planServiceURL } from '../lib/maintenancePlans';
import { dateLabel, download, maintenanceStatus, money, number, type Vehicle } from '../lib/demo';
import {
  normalizedVehicleText,
  selectVehicleRows,
  vehicleCSV,
  vehicleRows,
} from '../lib/vehicleCatalogue';

export function VehicleEditor({ vehicle, close }: { vehicle?: Vehicle; close: () => void }) {
  const {
    customers,
    vehicles,
    activeServices: services,
    saveVehicle,
    notify,
    mode,
    referenceDate,
  } = useData();
  const [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const plate = String(data.get('plate')).trim().toUpperCase().replace(/\s+/g, ' ');
    if (
      vehicles.some(
        (v) => v.id !== vehicle?.id && v.plate.replaceAll(' ', '') === plate.replaceAll(' ', ''),
      )
    ) {
      setError('Ya existe un vehículo con esta patente.');
      return;
    }
    const km = Number(data.get('km'));
    const minimum = Math.max(
      0,
      ...services.filter((s) => s.vehicleId === vehicle?.id).map((s) => s.km),
      ...(vehicle?.maintenancePlans ?? []).map((p) => p.lastKm ?? 0),
    );
    if (km < minimum) {
      setError(
        `Hay un mantenimiento o vencimiento con ${number(minimum)} km. Corregí primero ese registro para poder bajar el kilometraje del vehículo.`,
      );
      return;
    }
    const saved = await saveVehicle({
      ...vehicle,
      id: vehicle?.id ?? randomId(),
      customerId: String(data.get('customer')),
      plate,
      brand: String(data.get('brand')).trim(),
      model: String(data.get('model')).trim(),
      year: Number(data.get('year')),
      fuel: String(data.get('fuel')),
      engine: String(data.get('engine')).trim(),
      km: Number(data.get('km')),
      color: String(data.get('color')),
      nextDate: vehicle?.nextDate ?? nextServiceDate(referenceDate),
      nextKm: vehicle?.nextKm ?? Number(data.get('km')) + 10000,
      recommendation: vehicle?.recommendation ?? 'Service general',
    });
    if (!saved) return;
    notify(
      mode === 'demo'
        ? 'Vehículo guardado en la demostración. Los cambios se pierden al recargar.'
        : 'Vehículo guardado en la base local.',
    );
    close();
  };
  return (
    <Modal title={vehicle ? 'Editar vehículo' : 'Nuevo vehículo'} close={close}>
      <form onSubmit={submit} className="form-stack">
        <p className="muted">
          {mode === 'demo'
            ? 'Datos de prueba, sin persistencia.'
            : isServerMode()
              ? 'Los datos quedan guardados en la PC del taller.'
              : 'Los datos quedan guardados en este navegador.'}
        </p>
        <div className="form-grid">
          <label>
            Patente <span>*</span>
            <input name="plate" required maxLength={12} defaultValue={vehicle?.plate} />
          </label>
          <label>
            Cliente propietario <span>*</span>
            <select name="customer" defaultValue={vehicle?.customerId} required>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.active ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Marca <span>*</span>
            <input name="brand" required maxLength={50} defaultValue={vehicle?.brand} />
          </label>
          <label>
            Modelo <span>*</span>
            <input name="model" required maxLength={70} defaultValue={vehicle?.model} />
          </label>
          <label>
            Año <span>*</span>
            <input
              name="year"
              type="number"
              min="1900"
              max="2027"
              required
              defaultValue={vehicle?.year ?? 2021}
            />
          </label>
          <label>
            Kilometraje registrado <span>*</span>
            <input
              name="km"
              type="number"
              min="0"
              max="9999999"
              required
              defaultValue={vehicle?.km ?? 0}
            />
          </label>
          <label>
            Color
            <input name="color" maxLength={30} defaultValue={vehicle?.color ?? 'silver'} />
          </label>
          <label>
            Motor
            <input name="engine" maxLength={60} defaultValue={vehicle?.engine} />
          </label>
          <label>
            Combustible
            <select name="fuel" defaultValue={vehicle?.fuel ?? 'Nafta'}>
              <option>Nafta</option>
              <option>Diésel</option>
              <option>GNC</option>
              <option>Híbrido</option>
              <option>Eléctrico</option>
            </select>
          </label>
        </div>
        {vehicle && (
          <p className="fine-print">
            Cambiar el propietario mueve la ficha y su historial al cliente seleccionado. Corregir
            kilómetros actualiza los estados de todos sus vencimientos, conservando sus fechas y
            objetivos.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <ModalCancelButton type="button" className="button" onClick={close}>
            Cancelar
          </ModalCancelButton>
          <button className="button primary">
            <Check size={16} />
            {mode === 'demo' ? 'Guardar en demo' : 'Guardar vehículo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Vehicles() {
  const { vehicles, customers, referenceDate, mode, notify } = useData();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const search = params.get('buscar') ?? '';
  const status = params.get('estado') ?? 'todos';
  const customerId = params.get('cliente') ?? '';
  const brand = params.get('marca') ?? '';
  const order = params.get('orden') ?? 'patente';
  const table = params.get('vista') === 'tabla';
  const pageSize = [12, 24, 48].includes(Number(params.get('cantidad')))
    ? Number(params.get('cantidad'))
    : 12;
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
  const go = (value: number) => {
    change('pagina', String(value), false);
    window.scrollTo(0, 0);
  };
  const clearFilters = () => {
    const next = currentParams();
    for (const key of ['buscar', 'estado', 'cliente', 'marca', 'pagina']) next.delete(key);
    setParams(next, { replace: true, flushSync: true });
  };
  const brands = [
    ...new Map(vehicles.map((v) => [normalizedVehicleText(v.brand), v.brand.trim()])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const filtered = selectVehicleRows(vehicleRows(vehicles, customers, referenceDate), {
    search,
    status,
    customerId,
    brand,
    order,
  });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requested = Number(params.get('pagina') ?? 1);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const exportCSV = () => {
    if (!filtered.length) return;
    try {
      download(
        `taller-calamante-vehiculos${mode === 'demo' ? '-demo' : ''}-${referenceDate}.csv`,
        vehicleCSV(filtered, referenceDate, mode === 'demo'),
        'text/csv;charset=utf-8',
      );
      notify(
        `CSV descargado con ${filtered.length} vehículos${mode === 'demo' ? ' de demostración' : ''}. Incluye todas las páginas filtradas y sus vencimientos vigentes.`,
      );
    } catch {
      notify('No se pudo descargar el CSV. Volvé a intentarlo.');
    }
  };
  return (
    <>
      <PageTitle
        title="Vehículos"
        subtitle="Cada vehículo, su historia. Toda tu flota organizada."
        actions={
          <div className="history-heading-actions">
            <button className="button primary" onClick={() => setAdding(true)}>
              <Plus size={17} />
              Nuevo vehículo
            </button>
          </div>
        }
      />
      <section className="panel vehicle-filters" aria-label="Filtros de vehículos">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Buscar vehículos"
            placeholder="Patente, marca, modelo o cliente…"
            value={search}
            onChange={(e) => change('buscar', e.target.value)}
          />
        </div>
        <select
          aria-label="Estado de mantenimiento"
          value={status}
          onChange={(e) => change('estado', e.target.value)}
        >
          <option value="todos">Todos los estados</option>
          {['Al día', 'Próximo', 'Vencido', 'Sin datos'].map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
        <button className="button" onClick={clearFilters}>
          Limpiar filtros
        </button>
        <MoreOptions
          label="Más opciones de vehículos"
          active={
            [customerId, brand, order !== 'patente' ? 'orden' : '', table ? 'tabla' : ''].filter(
              Boolean,
            ).length
          }
        >
          <div className="options-fields">
            <CustomerFilter
              label="Cliente de vehículos"
              customers={customers}
              value={customerId}
              onChange={(value) => change('cliente', value)}
            />
            <select
              aria-label="Marca del vehículo"
              value={brand}
              onChange={(e) => change('marca', e.target.value)}
            >
              <option value="">Todas las marcas</option>
              {brands.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Ordenar vehículos"
              value={order}
              onChange={(e) => change('orden', e.target.value)}
            >
              <option value="patente">Patente (A–Z)</option>
              <option value="urgencia">Más urgentes</option>
              <option value="kilometraje">Mayor kilometraje</option>
            </select>
            <div className="vehicle-view-options" role="group" aria-label="Vista de vehículos">
              <button
                className="button small"
                aria-pressed={!table}
                onClick={() => change('vista', '', false)}
              >
                <LayoutGrid size={16} />
                Tarjetas
              </button>
              <button
                className="button small"
                aria-pressed={table}
                onClick={() => change('vista', 'tabla', false)}
              >
                <List size={16} />
                Tabla
              </button>
            </div>
          </div>
          <button className="button" disabled={!filtered.length} onClick={exportCSV}>
            <Download size={17} />
            Exportar CSV
          </button>
          <p className="fine-print">
            El CSV se abre con Excel e incluye todos los vehículos encontrados y sus próximos
            servicios.
          </p>
        </MoreOptions>
        <span className="results-count" aria-live="polite">
          {filtered.length} vehículos
        </span>
      </section>
      {table ? (
        <Panel title="Listado de vehículos" icon={CarFront}>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Patente / Vehículo</th>
                  <th>Cliente</th>
                  <th>Kilometraje</th>
                  <th>Estado general</th>
                  <th>Servicio prioritario</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ vehicle: v, customerName, plans, priority, status: state }) => (
                  <tr key={v.id} data-vehicle-id={v.id}>
                    <td>
                      <Link className="table-link" to={`/vehiculos/${v.id}`}>
                        <strong>{v.plate}</strong>
                        <small>
                          {v.brand} {v.model} · {v.year}
                        </small>
                      </Link>
                    </td>
                    <td>{customerName}</td>
                    <td>{number(v.km)} km</td>
                    <td>
                      <Badge>{state}</Badge>
                      <small className="block muted">{plans.length} vencimientos</small>
                    </td>
                    <td>
                      {priority ? (
                        <>
                          <strong>{priority.label}</strong>
                          <small className="block muted">
                            {dateLabel(priority.nextDate)} · {number(priority.nextKm)} km
                          </small>
                        </>
                      ) : (
                        <span>Sin vencimientos programados</span>
                      )}
                    </td>
                    <td>
                      <div className="reminder-row-actions">
                        <Link className="button small" to={`/vehiculos/${v.id}`}>
                          Ver ficha
                        </Link>
                        <Link
                          className="button small"
                          to={
                            priority
                              ? planServiceURL(v, priority)
                              : `/mantenimientos/nuevo?vehiculo=${encodeURIComponent(v.id)}`
                          }
                        >
                          <Plus size={14} />
                          Registrar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="vehicle-grid">
          {visible.map(({ vehicle: v, customerName, priority, status: state }) => (
            <Link
              className="vehicle-card"
              key={v.id}
              data-vehicle-id={v.id}
              to={`/vehiculos/${v.id}`}
            >
              <div className="vehicle-card-image">
                <VehicleArt color={v.color} />
                <span className="vehicle-plate">{v.plate}</span>
              </div>
              <div className="vehicle-card-content">
                <div className="vehicle-card-title">
                  <div>
                    <h2>
                      {v.brand} {v.model}
                    </h2>
                    <p>
                      {v.year} · {v.engine} · {v.fuel}
                    </p>
                  </div>
                  <ArrowRight size={18} />
                </div>
                <div className="vehicle-card-meta">
                  <span>
                    <Gauge size={16} />
                    {number(v.km)} km
                  </span>
                  <Badge>{state}</Badge>
                </div>
                <div className="vehicle-card-priority">
                  {priority ? (
                    <>
                      <strong>{priority.label}</strong>
                      <span>
                        {dateLabel(priority.nextDate)} · {number(priority.nextKm)} km
                      </span>
                    </>
                  ) : (
                    <span>Sin vencimientos programados</span>
                  )}
                </div>
                <div className="vehicle-card-owner">
                  <UserRound size={15} />
                  {customerName}
                  <span>
                    Ver ficha
                    <ChevronRight size={13} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!filtered.length && <Empty text="No encontramos vehículos" />}
      <div className="history-pagination">
        <span>
          {filtered.length
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`
            : '0 vehículos'}
        </span>
        <nav aria-label="Páginas de vehículos">
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
          Vehículos por página
          <select value={pageSize} onChange={(e) => change('cantidad', e.target.value)}>
            {[12, 24, 48].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {adding && <VehicleEditor close={() => setAdding(false)} />}
    </>
  );
}
export function VehicleQR({ id }: { id: string }) {
  const { mode } = useData();
  const [image, setImage] = useState('');
  const url = import.meta.env.PROD
    ? `${window.location.href.split('#')[0]}#/publico/demo/${id}`
    : `${window.location.origin}/publico/demo/${id}`;
  useEffect(() => {
    if (mode !== 'demo') return;
    let active = true;
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: '#10203a', light: '#ffffff' },
    }).then((data) => {
      if (active) setImage(data);
    });
    return () => {
      active = false;
    };
  }, [url, mode]);
  if (mode !== 'demo')
    return (
      <Panel title="Historial por QR" icon={QrCode} className="qr-panel">
        <QrCode size={52} />
        <p>
          Los datos de este vehículo están{' '}
          {isServerMode() ? 'en la PC del taller' : 'solo en este navegador'}. Un QR público
          requerirá un servicio para compartir la información autorizada.
        </p>
        <Link className="button full" to="/publico/demo/v2">
          Ver ejemplo ficticio
        </Link>
      </Panel>
    );
  return (
    <Panel title="Código QR del vehículo" icon={QrCode} className="qr-panel">
      {image && (
        <img src={image} alt="QR de demostración del historial público" width={148} height={148} />
      )}
      <p>Explorá el historial público de ejemplo.</p>
      <a
        className="button full"
        href={image || undefined}
        download={`taller-calamante-qr-demo-${id}.png`}
      >
        <Download size={16} />
        Descargar QR demo
      </a>
      <small className="muted">
        Enlace de prueba del entorno actual. El acceso revocable se implementará en la etapa 5.
      </small>
    </Panel>
  );
}
export function VehicleDetail() {
  const confirmDiscard = useConfirmDiscard();
  const { id } = useParams();
  const { vehicles, customers, activeServices: services, photos, referenceDate } = useData();
  const vehicle = vehicles.find((v) => v.id === id);
  const [tab, setTab] = useState('Historial de mantenimientos');
  const [editing, setEditing] = useState(false);
  const history = useMemo(
    () => services.filter((s) => s.vehicleId === id).sort((a, b) => b.date.localeCompare(a.date)),
    [services, id],
  );
  const photoCount = (photos ?? []).filter((p) => history.some((s) => s.id === p.serviceId)).length;
  if (!vehicle)
    return (
      <Empty
        text="No encontramos este vehículo"
        action={
          <Link className="button" to="/vehiculos">
            Volver a vehículos
          </Link>
        }
      />
    );
  const next = nextVehiclePlan(vehicle, referenceDate);
  const customer = customers.find((c) => c.id === vehicle.customerId);
  return (
    <>
      <div className="breadcrumb">
        <Link to="/vehiculos">
          <ArrowLeft size={16} />
          Vehículos
        </Link>
        <ChevronRight size={14} />
        <span>
          {vehicle.brand} {vehicle.model} · {vehicle.plate}
        </span>
        <button className="button" onClick={() => setEditing(true)}>
          <Pencil size={15} />
          Editar vehículo
        </button>
      </div>
      <div className="vehicle-top">
        <div className="panel vehicle-summary">
          <VehicleArt color={vehicle.color} large />
          <div>
            <span className="eyebrow">FICHA DEL VEHÍCULO</span>
            <h1>
              {vehicle.brand} {vehicle.model}
            </h1>
            <div className="vehicle-tags">
              <span>{vehicle.year}</span>
              <span>{vehicle.plate}</span>
              <Badge>{maintenanceStatus(vehicle, referenceDate)}</Badge>
            </div>
            <dl className="vehicle-specs">
              <div>
                <dt>
                  <Gauge size={17} />
                  Último kilometraje
                </dt>
                <dd>{number(vehicle.km)} km</dd>
              </div>
              <div>
                <dt>
                  <Fuel size={17} />
                  Combustible
                </dt>
                <dd>{vehicle.fuel}</dd>
              </div>
              <div>
                <dt>
                  <Settings2 size={17} />
                  Motor
                </dt>
                <dd>{vehicle.engine || 'Sin registrar'}</dd>
              </div>
              <div>
                <dt>
                  <UserRound size={17} />
                  Propietario
                </dt>
                <dd>{customer?.name}</dd>
              </div>
            </dl>
          </div>
        </div>
        <VehicleQR id={vehicle.id} />
      </div>
      <div className="vehicle-detail-grid">
        <div>
          <div className="tabs vehicle-tabs" role="tablist" aria-label="Información del vehículo">
            {[
              { title: 'Historial de mantenimientos', icon: ClipboardList },
              { title: 'Información técnica', icon: Settings2 },
              { title: 'Fotos', icon: Camera },
              { title: 'Documentación', icon: FileText },
              { title: 'Recordatorios', icon: CalendarDays },
            ].map(({ title, icon: Icon }) => (
              <button
                role="tab"
                aria-selected={tab === title}
                className={tab === title ? 'active' : ''}
                key={title}
                onClick={() => {
                  if (title === tab || confirmDiscard()) setTab(title);
                }}
              >
                <Icon size={16} />
                {title}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={tab}>
            {tab === 'Historial de mantenimientos' && (
              <Panel
                title="Historial de mantenimientos"
                icon={Wrench}
                action={
                  <div className="history-heading-actions">
                    <VehicleHistoryPDFButton vehicleId={vehicle.id} />
                    <Link className="button small" to={`/mantenimientos/nuevo?vehiculo=${id}`}>
                      <Plus size={16} />
                      Registrar mantenimiento
                    </Link>
                  </div>
                }
              >
                <p className="panel-description">
                  Todos los trabajos realizados, en un mismo lugar.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Kilometraje</th>
                        <th>Servicio / Trabajos</th>
                        <th>Insumos</th>
                        <th>Importe</th>
                        <th>Visibilidad</th>
                        <th>Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((s) => (
                        <tr key={s.id}>
                          <td>{dateLabel(s.date)}</td>
                          <td>{number(s.km)} km</td>
                          <td className="work-cell">
                            <strong>{s.type}</strong>
                            <small>{s.work}</small>
                          </td>
                          <td className="wrap-cell">{s.supplies}</td>
                          <td>{money(s.amount)}</td>
                          <td>
                            <span className="subtle-chip">{s.public ? 'Público' : 'Privado'}</span>
                          </td>
                          <td>
                            <Link className="button small" to={`/mantenimientos/${s.id}/editar`}>
                              <Pencil size={14} />
                              Editar
                            </Link>
                            <ServicePDFButton service={s} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!history.length && <Empty text="Este vehículo todavía no tiene mantenimientos" />}
                <div className="info-strip">
                  <Info size={18} />
                  <span>
                    {next
                      ? `Próximo servicio: ${dateLabel(next.nextDate)} o ${number(next.nextKm)} km, lo que ocurra primero.`
                      : 'Sin vencimientos programados. Agregá uno desde Recordatorios.'}
                  </span>
                </div>
              </Panel>
            )}
            {tab === 'Información técnica' && (
              <Panel title="Información técnica" icon={Settings2}>
                <dl className="technical-list">
                  {[
                    ['Marca', vehicle.brand],
                    ['Modelo', vehicle.model],
                    ['Año', vehicle.year],
                    ['Patente', vehicle.plate],
                    ['Motor', vehicle.engine],
                    ['Color', vehicle.color],
                    ['Combustible', vehicle.fuel],
                    ['Último kilometraje registrado', `${number(vehicle.km)} km`],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || 'Sin registrar'}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            )}
            {tab === 'Documentación' && (
              <Panel title="Documentación del vehículo" icon={FileText}>
                <VehicleDocuments vehicleId={vehicle.id} />
              </Panel>
            )}
            {tab === 'Fotos' && (
              <Panel title="Fotos de los mantenimientos" icon={Camera}>
                <PhotoGallery services={history} />
              </Panel>
            )}
            {tab === 'Recordatorios' && <MaintenanceSchedules vehicle={vehicle} />}
          </div>
        </div>
        <aside className="vehicle-aside">
          <Panel title="Próximo servicio" icon={CalendarDays}>
            {next ? (
              <>
                <div className="next-service-type">
                  <Wrench size={22} />
                  <span>
                    <strong>{next.recommendation}</strong>
                    <small>{next.label}</small>
                  </span>
                </div>
                <div className="next-service-values">
                  <div>
                    <small>Fecha objetivo</small>
                    <strong>{dateLabel(next.nextDate)}</strong>
                  </div>
                  <div>
                    <small>Kilometraje objetivo</small>
                    <strong>{number(next.nextKm)} km</strong>
                  </div>
                </div>
                <Link className="button primary full" to={planServiceURL(vehicle, next)}>
                  Registrar servicio ahora
                </Link>
                <p className="fine-print">
                  Vencimiento prioritario según el kilometraje actual. Cada servicio conserva sus
                  propios límites.
                </p>
              </>
            ) : (
              <p>No hay vencimientos programados. Agregá uno desde Recordatorios.</p>
            )}
            <button
              className="button full"
              onClick={() => {
                if (confirmDiscard()) setTab('Recordatorios');
              }}
            >
              Ver todos los vencimientos
            </button>
          </Panel>
          <Panel
            title="Datos del propietario"
            icon={UserRound}
            action={
              <Link className="text-link" to={`/clientes?cliente=${customer?.id}`}>
                Ver cliente
              </Link>
            }
          >
            <strong>{customer?.name}</strong>
            <div className="contact-list">
              <span>
                <Mail size={16} />
                {customer?.email || 'Sin email'}
              </span>
              <span>
                <Phone size={16} />
                {customer?.phone || 'Sin teléfono'}
              </span>
            </div>
            <span className="private-label">Información privada del taller</span>
          </Panel>
          <Panel title="Fotos de mantenimiento" icon={Camera}>
            <div className="attachment-placeholder">
              <Camera size={24} />
              <span>
                {photoCount
                  ? `${photoCount} ${photoCount === 1 ? 'foto guardada' : 'fotos guardadas'}`
                  : 'Sin fotos guardadas'}
              </span>
            </div>
            <p className="fine-print">
              Registrá fotos junto al mantenimiento. Se conservan localmente y se incluyen en el
              respaldo ZIP completo.
            </p>
            <button
              className="button full"
              onClick={() => {
                if (confirmDiscard()) setTab('Fotos');
              }}
            >
              Ver fotos
            </button>
          </Panel>
        </aside>
      </div>
      {editing && <VehicleEditor vehicle={vehicle} close={() => setEditing(false)} />}
    </>
  );
}
