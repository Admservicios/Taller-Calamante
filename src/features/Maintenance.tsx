import { workStages, type WorkStage } from '../lib/workOrders';
import { downloadQuotePDF } from '../lib/quotePDF';
import { QuoteHistory } from '../components/QuoteHistory';
import {
  laborAmountSchema,
  suggestedServiceCents,
  serviceAdjustmentCents,
} from '../lib/serviceCosts';
import { itemMoney, totalItemCents } from '../lib/supplyItems';
import { applyServiceStock } from '../lib/inventory';
import { isServerMode } from '../lib/serverClient';
import { randomId } from '../lib/ids';
import { useUnsavedChanges } from '../components/UnsavedChanges';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  alignmentEntry,
  alignmentSummary,
  alignmentOptions,
  balancingOptions,
} from '../lib/maintenanceEntry';
import { SupplyItemsEditor, draftItem, parsedDraft } from '../components/SupplyItemsEditor';
import { legacySupplyText, saveSupplyItems } from '../lib/supplyItems';
import { editableServicePlan, editServiceData } from '../lib/serviceEditing';
import { serviceSchema, serviceFieldsSchema } from '../lib/serviceValidation';
import { nextServiceDate } from '../lib/localDatabase';
import { downloadServicePDF } from '../lib/servicePDF';
import { PhotoPicker } from '../components/MaintenancePhotos';
import type { PreparedPhoto } from '../lib/photos';
import {
  maintenanceKind,
  maintenanceTypes,
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
    saveWorkOrder,
    updateService,
    notify,
    mode,
    referenceDate,
  } = store;
  const { id } = useParams();
  const [params] = useSearchParams();
  const [originalJob] = useState(() => store.jobs?.find((job) => job.id === id));
  const [original] = useState(
    () => services.find((s) => !s.annulment && s.id === id) ?? originalJob,
  );
  const [stage, setStage] = useState<WorkStage>(
    originalJob?.stage ??
      (original
        ? 'completado'
        : params.get('estado') === 'presupuesto'
          ? 'presupuesto'
          : 'completado'),
  );
  const [cancelReason, setCancelReason] = useState(originalJob?.cancellationReason ?? '');
  const [initialPlan] = useState(() =>
    original && !originalJob ? editableServicePlan(original, store) : undefined,
  );
  const [hasNext, setHasNext] = useState(!original || !!initialPlan);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const savedPhotos = (store.photos ?? []).filter((p) => p.serviceId === original?.id);
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
  const isAlignment = serviceType === 'Alineación y balanceo';
  const [initialAlignment] = useState(() =>
    original?.type === 'Alineación y balanceo'
      ? alignmentEntry(original.work)
      : { work: original?.work ?? '', alignment: '', balancing: '' },
  );
  const [work, setWork] = useState(initialAlignment.work);
  const [alignment, setAlignment] = useState(
    original ? initialAlignment.alignment : 'Eje delantero',
  );
  const [balancing, setBalancing] = useState(
    original ? initialAlignment.balancing : 'Las 4 ruedas',
  );
  const [laborAmount, setLaborAmount] = useState(original?.laborAmount?.toString() ?? '');
  const [amount, setAmount] = useState(original?.amount?.toString() ?? '');
  const [supplyRows, setSupplyRows] = useState(() => (original?.supplyItems ?? []).map(draftItem));
  const [legacyText, setLegacyText] = useState(() => legacySupplyText(original));
  const draftItems = supplyRows.map(parsedDraft);
  const validItems = draftItems.every((item) => item.success);
  const pricedItems = draftItems.flatMap((item) => (item.success ? [item.data] : []));
  const laborValid = laborAmount !== '' && laborAmountSchema.safeParse(Number(laborAmount)).success;
  const suggested =
    validItems && laborValid ? suggestedServiceCents(pricedItems, Number(laborAmount)) : undefined;
  const adjustment =
    amount !== '' && Number.isFinite(Number(amount))
      ? serviceAdjustmentCents({
          supplyItems: validItems ? pricedItems : undefined,
          suppliesLegacy: legacyText,
          laborAmount: laborValid ? Number(laborAmount) : undefined,
          amount: Number(amount),
        })
      : undefined;
  const chooseType = (value: string) => {
    if (isAlignment && value !== 'Alineación y balanceo') {
      setWork(alignmentSummary(work, alignment, balancing));
      setAlignment('');
      setBalancing('');
    } else if (!isAlignment && value === 'Alineación y balanceo') {
      const parsed = alignmentEntry(work);
      setWork(parsed.work);
      setAlignment(parsed.alignment || (original ? '' : 'Eje delantero'));
      setBalancing(parsed.balancing || (original ? '' : 'Las 4 ruedas'));
    }
    setServiceType(value);
    setCustomRecommendation(false);
    setRecommendation(maintenanceKind(value).recommendations[0]);
  };
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
  const [customRecommendation, setCustomRecommendation] = useState(
    !!initialPlan && !initialKind.recommendations.includes(initialPlan.recommendation),
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
    if (confirmDiscard())
      navigate(
        originalJob || stage !== 'completado'
          ? '/mantenimientos?vista=pendientes'
          : '/mantenimientos',
      );
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vehicle || saving || preparingPhotos) return;
    setError('');
    const wantsPDF = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'pdf';
    const data = new FormData(e.currentTarget);
    if (
      stage === 'completado' &&
      isAlignment &&
      alignment === 'No realizada' &&
      balancing === 'No realizado'
    ) {
      setError('Indicá una alineación o un balanceo realizado para guardar este servicio.');
      return;
    }
    const result = (
      hasNext && stage === 'completado' ? serviceSchema : serviceFieldsSchema
    ).safeParse({
      date: data.get('date'),
      km: Number(data.get('km')),
      type: actualType,
      work,
      amount: Number(data.get('amount')),
      ...(laborAmount !== '' ? { laborAmount: Number(laborAmount) } : {}),
      nextDate,
      nextKm,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    const savedWork = isAlignment
      ? alignmentSummary(result.data.work, alignment, balancing)
      : result.data.work;
    if (savedWork.length > 2000) {
      setError('El detalle completo del trabajo no puede superar los 2000 caracteres.');
      return;
    }
    if (stage === 'completado' && !original && result.data.km < vehicle.km) {
      setError(`El kilometraje debe ser igual o mayor a ${number(vehicle.km)} km.`);
      return;
    }
    if (result.data.date > referenceDate) {
      setError('La fecha del servicio no puede ser posterior a la fecha actual de referencia.');
      return;
    }
    const parsedItems = supplyRows.map(parsedDraft);
    if (parsedItems.some((result) => !result.success)) {
      setError('Revisá descripción, cantidad y precio de los artículos.');
      return;
    }
    const supplyData = saveSupplyItems(
      parsedItems.map((result) => result.data!),
      legacyText,
      original,
    );
    const service: Service = {
      ...(original?.quotes ? { quotes: original.quotes } : {}),
      ...(original?.workHistory ? { workHistory: original.workHistory } : {}),
      ...(!original || original.stockManaged ? { stockManaged: true as const } : {}),
      id: original?.id ?? randomId(),
      vehicleId: vehicle.id,
      date: result.data.date,
      km: result.data.km,
      type: result.data.type,
      work: savedWork,
      ...supplyData,
      amount: result.data.amount,
      ...(result.data.laborAmount !== undefined ? { laborAmount: result.data.laborAmount } : {}),
      notes: String(data.get('notes')).trim(),
      public: mode === 'demo' ? data.get('public') === 'on' : (original?.public ?? false),
    };
    const next = { date: nextDate, km: nextKm, recommendation };
    if (hasNext && stage === 'completado') {
      try {
        service.maintenance = servicePlan(service, next);
      } catch {
        setError('Revisá el vencimiento y completá el trabajo recomendado.');
        return;
      }
    }
    if (!original && stage === 'completado') {
      try {
        applyServiceStock(store, store, service);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Revisá las existencias.');
        return;
      }
    }
    let correctedVehicle = vehicle;
    if (original && !originalJob) {
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
    const workResult =
      original && !originalJob
        ? null
        : await saveWorkOrder(
            originalJob,
            service,
            stage,
            photos,
            removedPhotoIds,
            wantsPDF && stage !== 'completado',
            cancelReason,
          );
    if (workResult && 'error' in workResult) {
      setError(workResult.error);
      setSaving(false);
      return;
    }
    const savedRecord = workResult?.saved;
    const saved =
      original && !originalJob
        ? await updateService(original, service, photos, removedPhotoIds)
        : !!savedRecord;
    if (!saved) {
      setSaving(false);
      return;
    }
    setDirty(false);
    markClean();
    if (stage !== 'completado') {
      let message = 'Trabajo guardado. No se modificaron existencias, kilómetros ni vencimientos.';
      if (wantsPDF && savedRecord?.quotes?.length) {
        setGeneratingPDF(true);
        try {
          await downloadQuotePDF(savedRecord.quotes.at(-1)!, mode === 'demo');
          message = 'Presupuesto guardado y PDF descargado.';
        } catch {
          message =
            'El presupuesto quedó emitido y guardado. Podés volver a descargarlo desde sus versiones.';
        } finally {
          setGeneratingPDF(false);
        }
      }
      setSaving(false);
      notify(message);
      navigate('/mantenimientos?vista=pendientes');
      return;
    }
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
          service: savedRecord ?? service,
          customer,
          vehicle: original && !originalJob ? correctedVehicle : { ...vehicle, km: service.km },
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
  const saveLabel =
    stage !== 'completado'
      ? stage === 'presupuesto'
        ? 'Guardar presupuesto'
        : stage === 'en-trabajo'
          ? 'Guardar trabajo'
          : 'Guardar cancelación'
      : originalJob
        ? 'Completar mantenimiento'
        : mode === 'demo'
          ? 'Guardar en demo'
          : original
            ? 'Guardar cambios'
            : 'Guardar mantenimiento';
  const pdfLabel =
    stage === 'completado' ? 'Guardar y generar PDF' : 'Guardar y emitir presupuesto PDF';
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
        title={
          originalJob
            ? stage === 'completado'
              ? 'Completar mantenimiento'
              : 'Editar trabajo'
            : original
              ? 'Editar mantenimiento'
              : stage === 'completado'
                ? 'Registrar mantenimiento'
                : 'Nuevo presupuesto'
        }
        subtitle={
          stage === 'completado'
            ? 'Elegí el vehículo, agregá las tareas realizadas y revisá el próximo vencimiento.'
            : 'Prepará el trabajo y sus importes. Solo al completarlo pasará al historial.'
        }
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
              aria-label={saving ? 'Guardando…' : saveLabel}
              type="submit"
              disabled={!vehicle || saving || preparingPhotos}
            >
              <Save size={17} />
              <span className="save-label-full">{saving ? 'Guardando…' : saveLabel}</span>
              <span className="save-label-short" aria-hidden="true">
                {saving
                  ? 'Guardando…'
                  : originalJob && stage === 'completado'
                    ? 'Completar'
                    : mode === 'demo'
                      ? 'Guardar demo'
                      : 'Guardar'}
              </span>
            </button>
            <button
              className="button"
              aria-label={generatingPDF ? 'Generando PDF…' : pdfLabel}
              type="submit"
              name="intent"
              value="pdf"
              disabled={!vehicle || saving || preparingPhotos || stage === 'cancelado'}
            >
              <FileDown size={17} />
              <span className="save-label-full">{generatingPDF ? 'Generando PDF…' : pdfLabel}</span>
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
          {(!original || originalJob) && (
            <Panel title="Estado del trabajo" icon={Wrench}>
              <label>
                Estado
                <select
                  value={stage}
                  onChange={(e) => {
                    const value = e.target.value as WorkStage;
                    setStage(value);
                    if (value === 'completado' && originalJob) {
                      setServiceDate(referenceDate);
                      setServiceKm(vehicle?.km ?? 0);
                      setNextDate(nextServiceDate(referenceDate));
                      setNextKm((vehicle?.km ?? 0) + 10000);
                      setHasNext(true);
                    }
                  }}
                >
                  {Object.entries(workStages).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="fineprint">
                {stage === 'completado'
                  ? 'Al guardar se registran el trabajo realizado, los kilómetros, el stock y sus vencimientos.'
                  : 'Este trabajo no descuenta stock ni modifica kilómetros o vencimientos.'}
              </p>
              {stage === 'cancelado' && (
                <label>
                  Motivo de cancelación
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </label>
              )}
            </Panel>
          )}
          {original && (
            <details className="help-details">
              <summary>Información sobre esta corrección</summary>
              <p>
                Se modifica el registro existente. Si cambiás el vehículo, el servicio y sus fotos
                pasan a su ficha. Los PDF y respaldos que ya descargaste conservan los datos
                anteriores.
              </p>
            </details>
          )}
          <Panel title="Cliente y vehículo" icon={CarFront}>
            <div className="form-grid maintenance-vehicle-grid">
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
                {stage === 'completado' ? 'Fecha del servicio' : 'Fecha del presupuesto / trabajo'}{' '}
                <span>*</span>
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
                {stage === 'completado' ? 'Kilometraje actual' : 'Kilometraje informado'}{' '}
                <span>*</span>
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
                  onChange={(e) => chooseType(e.target.value)}
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
              Detalle del Servicio <span>*</span>
              <textarea
                name="work"
                value={work}
                onChange={(e) => setWork(e.target.value)}
                required
                minLength={5}
                maxLength={isAlignment ? 1800 : 2000}
                rows={4}
                placeholder={
                  stage === 'completado'
                    ? 'Describí el servicio y los trabajos realizados…'
                    : 'Describí el trabajo que se presupuesta…'
                }
              />
            </label>
          </Panel>
          {isAlignment && (
            <Panel title="Alineación y balanceo" icon={Settings2}>
              <div className="form-grid">
                <label>
                  {stage === 'completado' ? 'Alineación realizada' : 'Alineación a realizar'}{' '}
                  <span>*</span>
                  <select
                    name="alignment"
                    required={!original}
                    value={alignment}
                    onChange={(e) => setAlignment(e.target.value)}
                  >
                    <option value="">Sin especificar</option>
                    {alignmentOptions.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {stage === 'completado' ? 'Ruedas balanceadas' : 'Ruedas a balancear'}{' '}
                  <span>*</span>
                  <select
                    name="balancing"
                    required={!original}
                    value={balancing}
                    onChange={(e) => setBalancing(e.target.value)}
                  >
                    <option value="">Sin especificar</option>
                    {balancingOptions.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="fine-print">
                Detallá ajustes, vibraciones o desgaste de neumáticos en Detalle del Servicio. Podés
                registrar ambas tareas o solo la que se realizó.
              </p>
            </Panel>
          )}
          <Panel title="Insumos y repuestos" icon={Settings2}>
            <p className="fine-print">
              {stage !== 'completado'
                ? 'El stock se verifica y descuenta al completar el mantenimiento. Presupuestar no reserva cantidades.'
                : original && !originalJob && !original.stockManaged
                  ? 'Servicio anterior al control de stock: sus correcciones no descuentan existencias. Si corresponde, registrá un ajuste con motivo en Productos.'
                  : 'Los artículos del catálogo descuentan stock al guardar. Los artículos manuales no modifican existencias. No se reservan cantidades mientras completás el formulario.'}
            </p>
            <SupplyItemsEditor
              rows={supplyRows}
              legacy={legacyText}
              onChange={(rows) => {
                setSupplyRows(rows);
                setDirty(true);
              }}
              onLegacyChange={(value) => {
                setLegacyText(value);
                setDirty(true);
              }}
            />
          </Panel>
          {stage === 'completado' && (
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
                    <select
                      name="nextType"
                      value={customRecommendation ? '__custom__' : recommendation}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') setCustomRecommendation(true);
                        else {
                          setCustomRecommendation(false);
                          setRecommendation(e.target.value);
                        }
                      }}
                    >
                      {kind.recommendations.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                      <option value="__custom__">Otro trabajo recomendado…</option>
                    </select>
                  </label>
                  {customRecommendation && (
                    <label className="entry-other-supplies">
                      Trabajo recomendado personalizado
                      <input
                        required
                        maxLength={150}
                        value={recommendation}
                        onChange={(e) => setRecommendation(e.target.value)}
                        placeholder="Escribí la recomendación"
                      />
                    </label>
                  )}
                </div>
              )}
              <p className="fine-print">
                Este aviso corresponde a {kind.label}. Los otros servicios conservan sus
                vencimientos.
              </p>
              <details className="help-details">
                <summary>Ver otros vencimientos y cómo se actualizan</summary>{' '}
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
                        Se conserva {plan.label}: {dateLabel(plan.nextDate)} o {number(plan.nextKm)}{' '}
                        km.
                      </p>
                    ))}
              </details>
            </Panel>
          )}
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
              <div className="service-price-fields">
                <label>
                  Mano de obra (ARS)
                  <div className="input-suffix">
                    <input
                      type="number"
                      name="laborAmount"
                      inputMode="decimal"
                      min="0"
                      max="999999999"
                      step="0.01"
                      value={laborAmount}
                      onChange={(e) => setLaborAmount(e.target.value)}
                      placeholder="Sin registrar"
                    />
                    <span>$</span>
                  </div>
                </label>
                <div className="service-price-suggestion">
                  <span>Insumos valorizados</span>
                  <strong>
                    {validItems ? itemMoney(totalItemCents(pricedItems)) : 'Revisá los artículos'}
                  </strong>
                  {suggested !== undefined && (
                    <>
                      <span>Total sugerido con mano de obra</span>
                      <strong>{itemMoney(suggested)}</strong>
                    </>
                  )}
                  {adjustment !== undefined && adjustment !== 0 && (
                    <>
                      <span>Ajuste / descuento</span>
                      <strong>{itemMoney(adjustment)}</strong>
                    </>
                  )}
                  <button
                    type="button"
                    className="button small"
                    disabled={suggested === undefined || suggested > 99999999900}
                    onClick={() => {
                      setAmount(((suggested ?? 0) / 100).toFixed(2));
                      setDirty(true);
                    }}
                  >
                    Usar total sugerido
                  </button>
                  {legacyText.trim() && (
                    <small>No incluye el detalle anterior de insumos sin valorizar.</small>
                  )}
                </div>
                <label>
                  Importe total (ARS) <span>*</span>
                  <div className="input-suffix">
                    <input
                      type="number"
                      name="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      min="0"
                      max="999999999"
                      step="0.01"
                      placeholder="0,00"
                    />
                    <span>$</span>
                  </div>
                </label>
                <small className="muted">
                  El total es editable para aplicar descuentos o ajustes. La mano de obra está
                  incluida en ese total.
                </small>
              </div>
            </Panel>
          </div>
          <Panel
            title={stage === 'completado' ? 'Fotos del mantenimiento' : 'Fotos del trabajo'}
            icon={Camera}
          >
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
          {original && <QuoteHistory service={original} />}
          <Panel className="save-panel">
            {hasNext && stage === 'completado' && (
              <div className="info-strip">
                <Info size={21} />
                <span>
                  Próximo servicio · {kind.label}
                  <strong>{nextDate ? dateLabel(nextDate) : 'Elegí una fecha'}</strong>o a los{' '}
                  {number(nextKm)} km
                </span>
              </div>
            )}
            {mode === 'demo' && stage === 'completado' && (
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
            )}
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
