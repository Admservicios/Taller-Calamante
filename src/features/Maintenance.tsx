import { isServerMode } from '../lib/serverClient';
import { randomId } from '../lib/ids';
import { useUnsavedChanges } from '../components/UnsavedChanges';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { editableServicePlan, editServiceData } from '../lib/serviceEditing';
import { serviceSchema, serviceFieldsSchema } from '../lib/serviceValidation';
import { nextServiceDate } from '../lib/localDatabase';
import { downloadServicePDF } from '../lib/servicePDF';
import { PhotoPicker } from '../components/MaintenancePhotos';
import type { PreparedPhoto } from '../lib/photos';
import {
  maintenanceKind,
  maintenanceTypes,
  recordServicePlan,
  servicePlan,
  vehiclePlans,
} from '../lib/maintenancePlans';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  CarFront,
  Clock3,
  FileDown,
  Info,
  NotebookPen,
  Save,
  Settings2,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Empty, PageTitle, Panel, VehicleArt } from '../components/ui';
import { useData } from '../app/store';
import { dateLabel, number, type Service } from '../lib/demo';

export { MaintenanceList } from './MaintenanceHistory';
export function MaintenanceForm() {
  const { id } = useParams();
  return <MaintenanceFormFields key={id ?? 'new'} />;
}
function MaintenanceFormFields() {
  const store = useData();
  const {
    customers,
    vehicles,
    services,
    workshop,
    addService,
    updateService,
    notify,
    mode,
    referenceDate,
  } = store;
  const { id } = useParams();
  const [original] = useState(() => services.find((s) => !s.annulment && s.id === id));
  const [initialPlan] = useState(() =>
    original ? editableServicePlan(original, store) : undefined,
  );
  const [hasNext, setHasNext] = useState(!original || !!initialPlan);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const savedPhotos = (store.photos ?? []).filter((p) => p.serviceId === original?.id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialVehicle =
    vehicles.find((v) => v.id === (original?.vehicleId ?? params.get('vehiculo'))) ?? vehicles[0];
  const [customerId, setCustomerId] = useState(initialVehicle?.customerId ?? '');
  const [vehicleId, setVehicleId] = useState(initialVehicle?.id ?? '');
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const requestedPlan =
    initialVehicle &&
    vehiclePlans(initialVehicle).find((p) => p.category === params.get('servicio'));
  const initialKind = original
    ? maintenanceKind(original.type)
    : requestedPlan
      ? (maintenanceTypes.find((k) => k.key === requestedPlan.category) ??
        maintenanceKind(requestedPlan.label))
      : maintenanceKind('Service general');
  const [serviceType, setServiceType] = useState(
    original
      ? [
          'Service general',
          'Cambio de aceite',
          'Filtros',
          'Filtro de habitáculo',
          'Frenos',
          'Neumáticos',
          'Alineación y balanceo',
          'Revisión general',
        ].includes(original.type)
        ? original.type
        : 'Otro mantenimiento'
      : maintenanceTypes.some((k) => k.type === initialKind.type)
        ? initialKind.type
        : 'Otro mantenimiento',
  );
  const [customType, setCustomType] = useState(original?.type ?? requestedPlan?.label ?? '');
  const actualType = serviceType === 'Otro mantenimiento' ? customType.trim() : serviceType;
  const kind = maintenanceKind(actualType);
  const isAlignment = !original && serviceType === 'Alineación y balanceo';
  const [dirty, setDirty] = useState(false);
  const { markClean, confirmDiscard } = useUnsavedChanges(dirty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [serviceDate, setServiceDate] = useState(original?.date ?? referenceDate);
  const [serviceKm, setServiceKm] = useState(original?.km ?? initialVehicle?.km ?? 0);
  const [nextDate, setNextDate] = useState(initialPlan?.nextDate ?? nextServiceDate(referenceDate));
  const [nextKm, setNextKm] = useState(initialPlan?.nextKm ?? (initialVehicle?.km ?? 0) + 10000);
  const [recommendation, setRecommendation] = useState(
    initialPlan?.recommendation ?? initialKind.recommendations[0],
  );
  const changeVehicle = (id: string) => {
    setVehicleId(id);
    if (!original) {
      const km = vehicles.find((v) => v.id === id)?.km ?? 0;
      setServiceKm(km);
      setNextKm(km + 10000);
    }
    setDirty(true);
  };
  const cancel = () => {
    if (confirmDiscard()) navigate('/mantenimientos');
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vehicle || saving || preparingPhotos) return;
    const wantsPDF = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'pdf';
    const data = new FormData(e.currentTarget);
    const alignment = String(data.get('alignment') ?? '');
    const balancing = String(data.get('balancing') ?? '');
    if (isAlignment && alignment === 'No realizada' && balancing === 'No realizado') {
      setError('Indicá una alineación o un balanceo realizado para guardar este servicio.');
      return;
    }
    const result = (hasNext ? serviceSchema : serviceFieldsSchema).safeParse({
      date: data.get('date'),
      km: Number(data.get('km')),
      type: actualType,
      work: data.get('work'),
      amount: Number(data.get('amount')),
      nextDate,
      nextKm,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    const work = isAlignment
      ? `Alineación: ${alignment}. Balanceo: ${balancing}. ${result.data.work}`
      : result.data.work;
    if (work.length > 2000) {
      setError('El detalle completo del trabajo no puede superar los 2000 caracteres.');
      return;
    }
    if (!original && result.data.km < vehicle.km) {
      setError(`El kilometraje debe ser igual o mayor a ${number(vehicle.km)} km.`);
      return;
    }
    if (result.data.date > referenceDate) {
      setError('La fecha del servicio no puede ser posterior a la fecha actual de referencia.');
      return;
    }
    const supplies = original
      ? String(data.get('supplies') ?? '').trim()
      : ['oil', 'viscosity', 'oilFilter', 'airFilter', 'fuelFilter', 'cabinFilter', 'other']
          .map((key) => {
            const value = String(data.get(key) ?? '').trim();
            return key === 'cabinFilter' && value ? `Filtro de habitáculo: ${value}` : value;
          })
          .filter(Boolean)
          .join(' · ');
    const service: Service = {
      id: original?.id ?? randomId(),
      vehicleId: vehicle.id,
      date: result.data.date,
      km: result.data.km,
      type: result.data.type,
      work,
      supplies: original ? supplies : supplies || 'Sin insumos registrados',
      amount: result.data.amount,
      notes: String(data.get('notes')).trim(),
      public: mode === 'demo' ? data.get('public') === 'on' : (original?.public ?? false),
    };
    const next = { date: nextDate, km: nextKm, recommendation };
    if (hasNext) {
      try {
        service.maintenance = servicePlan(service, next);
      } catch {
        setError('Revisá el vencimiento y completá el trabajo recomendado.');
        return;
      }
    }
    let correctedVehicle = vehicle;
    if (original) {
      try {
        correctedVehicle = editServiceData(store, original, service, referenceDate).vehicles.find(
          (v) => v.id === vehicle.id,
        )!;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Revisá los datos.');
        return;
      }
    }
    setSaving(true);
    const saved = original
      ? await updateService(original, service, photos, removedPhotoIds)
      : await addService(service, next, photos);
    if (!saved) {
      setSaving(false);
      return;
    }
    setDirty(false);
    markClean();
    let message =
      mode === 'demo'
        ? 'Mantenimiento agregado a la sesión de demostración. Las fotos se conservan en esta sesión.'
        : photos.length
          ? 'Mantenimiento y fotos guardados en la base local. Incluí las fotos en tu respaldo ZIP.'
          : 'Mantenimiento guardado en la base local.';
    if (original)
      message =
        'Mantenimiento corregido. Historial, kilómetros y vencimientos relacionados actualizados.';
    if (wantsPDF) {
      setGeneratingPDF(true);
      try {
        const customer = customers.find((c) => c.id === vehicle.customerId);
        if (!customer) throw new Error('Falta el cliente.');
        await downloadServicePDF({
          service,
          customer,
          vehicle: original
            ? correctedVehicle
            : recordServicePlan(
                vehicle,
                service,
                next,
                referenceDate,
                services.filter((s) => !s.annulment),
              ),
          workshop,
          demo: mode === 'demo',
        });
        message =
          mode === 'demo'
            ? 'Mantenimiento agregado a la demo y PDF descargado.'
            : 'Mantenimiento guardado en la base local y PDF descargado.';
      } catch {
        message =
          'El mantenimiento quedó guardado. No se pudo generar el PDF; podés descargarlo desde el historial sin volver a cargar el servicio.';
      } finally {
        setGeneratingPDF(false);
      }
    }
    setSaving(false);
    notify(message);
    navigate(`/vehiculos/${vehicle.id}`);
  };
  const history = services
    .filter((s) => !s.annulment)
    .filter((s) => s.vehicleId === vehicleId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (id && !original)
    return (
      <Empty
        text="No encontramos este mantenimiento"
        action={
          <Link to="/mantenimientos" className="button">
            Volver al historial
          </Link>
        }
      />
    );
  return (
    <>
      <PageTitle
        title={original ? 'Editar mantenimiento' : 'Registrar mantenimiento'}
        subtitle="Completá la información del servicio realizado al vehículo."
        actions={
          <button className="button" onClick={cancel} disabled={saving || preparingPhotos}>
            <ArrowLeft size={16} />
            Volver
          </button>
        }
      />
      <form className="maintenance-layout" onSubmit={submit} onChange={() => setDirty(true)}>
        <div className="maintenance-actions" role="region" aria-label="Guardar mantenimiento">
          <div className="maintenance-action-context">
            <strong>
              {vehicle
                ? `${vehicle.plate} · ${vehicle.brand} ${vehicle.model}`
                : 'Seleccioná un vehículo'}
            </strong>
            <span>{dirty ? 'Cambios sin guardar' : 'Completá los campos obligatorios (*)'}</span>
          </div>
          <div className="maintenance-save-buttons">
            <button
              className="button primary"
              aria-label={
                saving
                  ? 'Guardando…'
                  : mode === 'demo'
                    ? 'Guardar en demo'
                    : original
                      ? 'Guardar cambios'
                      : 'Guardar mantenimiento'
              }
              type="submit"
              disabled={!vehicle || saving || preparingPhotos}
            >
              <Save size={17} />
              <span className="save-label-full">
                {saving
                  ? 'Guardando…'
                  : mode === 'demo'
                    ? 'Guardar en demo'
                    : original
                      ? 'Guardar cambios'
                      : 'Guardar mantenimiento'}
              </span>
              <span className="save-label-short" aria-hidden="true">
                {saving ? 'Guardando…' : mode === 'demo' ? 'Guardar demo' : 'Guardar'}
              </span>
            </button>
            <button
              className="button"
              aria-label={generatingPDF ? 'Generando PDF…' : 'Guardar y generar PDF'}
              type="submit"
              name="intent"
              value="pdf"
              disabled={!vehicle || saving || preparingPhotos}
            >
              <FileDown size={17} />
              <span className="save-label-full">
                {generatingPDF ? 'Generando PDF…' : 'Guardar y generar PDF'}
              </span>
              <span className="save-label-short" aria-hidden="true">
                {generatingPDF ? 'Generando…' : 'Guardar + PDF'}
              </span>
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="form-main" inert={saving}>
          {original && (
            <div className="info-strip">
              <Info size={20} />
              <span>
                Se corrige el registro existente. Los historiales y futuros PDF usarán estos datos.
                Si cambiás vehículo, el servicio y sus fotos pasarán a su ficha y cliente actual.
                Los PDF y respaldos descargados antes conservan su contenido anterior.
              </span>
            </div>
          )}
          <Panel title="Cliente y vehículo" icon={CarFront}>
            <div className="form-grid">
              <label>
                Cliente <span>*</span>
                <select
                  aria-label="Cliente"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    changeVehicle(vehicles.find((v) => v.customerId === e.target.value)?.id ?? '');
                  }}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vehículo <span>*</span>
                <select
                  aria-label="Vehículo"
                  required
                  value={vehicleId}
                  onChange={(e) => changeVehicle(e.target.value)}
                >
                  <option value="" disabled>
                    Seleccionar vehículo
                  </option>
                  {vehicles
                    .filter((v) => v.customerId === customerId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.brand} {v.model} · {v.plate}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {vehicle ? (
              <div className="selected-vehicle">
                <CarFront size={24} />
                <span>
                  <strong>{vehicle.plate}</strong>
                  <small>
                    {vehicle.brand} {vehicle.model} · {vehicle.year} · {vehicle.fuel}
                  </small>
                </span>
                <Link to={`/vehiculos/${vehicle.id}`} className="text-link">
                  Ver ficha
                  <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <p className="form-error">
                Este cliente no tiene vehículos. Registrá uno antes de cargar un mantenimiento.
              </p>
            )}
          </Panel>
          <Panel title="Detalles del mantenimiento" icon={Wrench}>
            <div className="form-grid three">
              <label>
                Fecha del servicio <span>*</span>
                <input
                  type="date"
                  name="date"
                  required
                  value={serviceDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (original && hasNext && value && serviceDate && nextDate) {
                      const shifted = new Date(
                        Date.parse(nextDate + 'T12:00:00Z') +
                          Date.parse(value + 'T12:00:00Z') -
                          Date.parse(serviceDate + 'T12:00:00Z'),
                      );
                      if (Number.isFinite(shifted.getTime()))
                        setNextDate(shifted.toISOString().slice(0, 10));
                    }
                    setServiceDate(value);
                  }}
                  max={referenceDate}
                />
              </label>
              <label>
                Kilometraje actual <span>*</span>
                <div className="input-suffix">
                  <input
                    key={vehicleId}
                    type="number"
                    name="km"
                    inputMode="numeric"
                    required
                    min={original ? 0 : (vehicle?.km ?? 0)}
                    max="9999999"
                    value={serviceKm}
                    onChange={(e) => {
                      const km = Number(e.target.value);
                      if (original && hasNext) setNextKm(nextKm + km - serviceKm);
                      setServiceKm(km);
                    }}
                  />
                  <span>km</span>
                </div>
              </label>
              <label>
                Tipo de servicio <span>*</span>
                <select
                  name="type"
                  required
                  value={serviceType}
                  onChange={(e) => {
                    setServiceType(e.target.value);
                    setRecommendation(maintenanceKind(e.target.value).recommendations[0]);
                  }}
                >
                  <option>Service general</option>
                  <option>Cambio de aceite</option>
                  <option>Filtros</option>
                  <option>Filtro de habitáculo</option>
                  <option>Frenos</option>
                  <option>Neumáticos</option>
                  <option>Alineación y balanceo</option>
                  <option>Revisión general</option>
                  <option>Otro mantenimiento</option>
                </select>
              </label>
            </div>
            {serviceType === 'Otro mantenimiento' && (
              <label>
                Nombre del servicio <span>*</span>
                <input
                  required
                  minLength={3}
                  maxLength={70}
                  value={customType}
                  onChange={(e) => {
                    setCustomType(e.target.value);
                    setRecommendation(e.target.value.trim());
                  }}
                  placeholder="Ej.: refrigerante, correa de distribución…"
                />
              </label>
            )}
            <label>
              Trabajos realizados <span>*</span>
              <textarea
                name="work"
                defaultValue={original?.work}
                required
                minLength={5}
                maxLength={isAlignment ? 1800 : 2000}
                rows={3}
                placeholder="Describí las tareas realizadas en este servicio…"
              />
            </label>
          </Panel>
          {isAlignment && (
            <Panel title="Alineación y balanceo" icon={Settings2}>
              <div className="form-grid">
                <label>
                  Alineación realizada <span>*</span>
                  <select name="alignment" required defaultValue="Eje delantero">
                    <option>Eje delantero</option>
                    <option>Ejes delantero y trasero</option>
                    <option>No realizada</option>
                  </select>
                </label>
                <label>
                  Ruedas balanceadas <span>*</span>
                  <select name="balancing" required defaultValue="Las 4 ruedas">
                    <option>Las 4 ruedas</option>
                    <option>2 ruedas delanteras</option>
                    <option>2 ruedas traseras</option>
                    <option>No realizado</option>
                  </select>
                </label>
              </div>
              <p className="fine-print">
                Detallá ajustes, vibraciones o desgaste de neumáticos en Trabajos realizados. Podés
                registrar ambas tareas o solo la que se realizó.
              </p>
            </Panel>
          )}
          <Panel title="Insumos y repuestos" icon={Settings2}>
            {original ? (
              <label>
                Insumos y repuestos registrados
                <textarea
                  name="supplies"
                  rows={4}
                  maxLength={1000}
                  defaultValue={original.supplies}
                />
              </label>
            ) : (
              <div className="form-grid three">
                <label>
                  Aceite de motor
                  <input name="oil" list="oils" placeholder="Marca y producto" maxLength={100} />
                  <datalist id="oils">
                    <option>Shell Helix HX8</option>
                    <option>Motul 8100</option>
                    <option>Castrol Magnatec</option>
                    <option>YPF Elaion</option>
                  </datalist>
                </label>
                <label>
                  Viscosidad
                  <select name="viscosity">
                    <option value="">Sin especificar</option>
                    <option>0W-20</option>
                    <option>5W-30</option>
                    <option>5W-40</option>
                    <option>10W-40</option>
                    <option>15W-40</option>
                  </select>
                </label>
                <label>
                  Filtro de aceite
                  <input name="oilFilter" placeholder="Marca / código" maxLength={100} />
                </label>
                <label>
                  Filtro de aire
                  <input name="airFilter" placeholder="Marca / código" maxLength={100} />
                </label>
                <label>
                  Filtro de combustible
                  <input name="fuelFilter" placeholder="Marca / código" maxLength={100} />
                </label>
                <label>
                  Filtro de habitáculo
                  <input name="cabinFilter" placeholder="Marca / código" maxLength={100} />
                </label>
                <label>
                  Otros repuestos
                  <input name="other" placeholder="Ej.: bujías, correa…" maxLength={300} />
                </label>
              </div>
            )}
          </Panel>
          <Panel title={`Próximo mantenimiento · ${kind.label}`} icon={CalendarDays}>
            {original && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={hasNext}
                  onChange={(e) => setHasNext(e.target.checked)}
                />
                Este registro tiene un vencimiento propio
              </label>
            )}
            {!hasNext && (
              <p className="fine-print">
                No se registró un vencimiento para esta visita. Podés corregir sus datos sin
                inventar un intervalo.
              </p>
            )}
            {hasNext && (
              <div className="form-grid three">
                <label>
                  Fecha recomendada <span>*</span>
                  <input
                    type="date"
                    required
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                  />
                </label>
                <label>
                  Kilometraje objetivo <span>*</span>
                  <input
                    type="number"
                    required
                    min={serviceKm + 1}
                    max="9999999"
                    value={nextKm}
                    onChange={(e) => setNextKm(Number(e.target.value))}
                  />
                </label>
                <label>
                  Trabajo recomendado
                  {original ? (
                    <input
                      name="nextType"
                      required
                      maxLength={150}
                      value={recommendation}
                      onChange={(e) => setRecommendation(e.target.value)}
                    />
                  ) : (
                    <select
                      name="nextType"
                      value={recommendation}
                      onChange={(e) => setRecommendation(e.target.value)}
                    >
                      {kind.recommendations.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </label>
              </div>
            )}
            <p className="fine-print">
              {original
                ? 'Al corregir fecha o kilómetros se mantiene el intervalo de esta visita; podés ajustar los objetivos. Un servicio posterior del mismo tipo o un vencimiento ajustado manualmente conserva su prioridad. Revisá Recordatorios si cambiás el tipo o vehículo: si no hay otro vencimiento registrado, esa categoría quedará sin programación.'
                : `Solo se actualiza el vencimiento de ${kind.label}. Los demás servicios conservan su fecha y kilometraje objetivo.`}
            </p>
            {vehicle &&
              vehiclePlans(vehicle)
                .filter((p) => p.category !== kind.key)
                .map((plan) => (
                  <p className="fine-print" key={plan.category}>
                    Se conserva {plan.label}: {dateLabel(plan.nextDate)} o {number(plan.nextKm)} km.
                  </p>
                ))}
          </Panel>
          <div className="form-bottom-grid">
            <Panel title="Observaciones privadas" icon={NotebookPen}>
              <label>
                <span className="sr-only">Observaciones privadas</span>
                <textarea
                  name="notes"
                  aria-label="Observaciones privadas"
                  defaultValue={original?.notes}
                  rows={3}
                  maxLength={500}
                  placeholder="Información interna del taller. No se muestra en el QR."
                />
              </label>
            </Panel>
            <Panel title="Importe del servicio" icon={Wallet}>
              <label>
                Importe total (ARS) <span>*</span>
                <div className="input-suffix">
                  <input
                    type="number"
                    name="amount"
                    inputMode="decimal"
                    defaultValue={original?.amount}
                    required
                    min="0"
                    max="999999999"
                    step="0.01"
                    placeholder="0,00"
                  />
                  <span>$</span>
                </div>
              </label>
            </Panel>
          </div>
          <Panel title="Fotos del mantenimiento" icon={Camera}>
            {savedPhotos.map((photo) => (
              <label className="check-label" key={photo.id}>
                <input
                  type="checkbox"
                  checked={!removedPhotoIds.includes(photo.id)}
                  onChange={(e) =>
                    setRemovedPhotoIds((ids) =>
                      e.target.checked ? ids.filter((id) => id !== photo.id) : [...ids, photo.id],
                    )
                  }
                />
                Conservar {photo.name}
              </label>
            ))}
            <PhotoPicker
              photos={photos}
              onChange={(next) => {
                setPhotos(next);
                setDirty(true);
              }}
              onBusy={setPreparingPhotos}
              onError={setError}
            />
          </Panel>
        </div>
        <aside className="form-aside">
          <Panel title="Resumen del vehículo" icon={CarFront}>
            {vehicle ? (
              <>
                <VehicleArt color={vehicle.color} />
                <h3>
                  {vehicle.brand} {vehicle.model}
                </h3>
                <p className="plate-text">{vehicle.plate}</p>
                <p className="muted">
                  {vehicle.year} · {vehicle.engine} · {vehicle.fuel}
                </p>
                <strong className="vehicle-km">
                  <GaugeIcon />
                  {number(vehicle.km)} km registrados
                </strong>
              </>
            ) : (
              <p>Seleccioná un vehículo.</p>
            )}
          </Panel>
          <Panel title="Últimos mantenimientos" icon={Clock3}>
            {history.length ? (
              history.map((s) => (
                <div className="form-history-item" key={s.id}>
                  <i />
                  <span>
                    <small>{dateLabel(s.date)}</small>
                    <strong>{s.type}</strong>
                    <small>{number(s.km)} km</small>
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">Sin servicios registrados.</p>
            )}
          </Panel>
          <Panel className="save-panel">
            {hasNext && (
              <div className="info-strip">
                <Info size={21} />
                <span>
                  Próximo servicio · {kind.label}
                  <strong>{nextDate ? dateLabel(nextDate) : 'Elegí una fecha'}</strong>o a los{' '}
                  {number(nextKm)} km
                </span>
              </div>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                name="public"
                defaultChecked={original?.public}
                disabled={mode !== 'demo'}
              />
              {mode === 'demo'
                ? 'Mostrar este servicio en el historial público de prueba'
                : 'Historial público pendiente de implementar'}
            </label>
            <button
              className="button ghost full"
              type="button"
              onClick={cancel}
              disabled={saving || preparingPhotos}
            >
              Cancelar
            </button>
            <p className="fine-print">
              {mode === 'demo'
                ? 'Registro de demostración: dura hasta recargar.'
                : isServerMode()
                  ? 'El registro se guarda en la PC del taller.'
                  : 'El registro se conserva en este navegador. Descargá respaldos periódicamente.'}
            </p>
          </Panel>
        </aside>
      </form>
    </>
  );
}
function GaugeIcon() {
  return <CarFront size={16} />;
}
export { Reminders } from './Reminders';
