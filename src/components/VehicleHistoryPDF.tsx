import { useEffect, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { useData } from '../app/store';
import { Modal } from './ui';
import { createVehicleHistoryPDF, historyInPeriod } from '../lib/vehicleHistoryPDF';
import { dateLabel } from '../lib/demo';

function HistoryPDFOptions({ vehicleId, close }: { vehicleId: string; close: () => void }) {
  const { vehicles, customers, services, workshop, referenceDate, mode } = useData();
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const customer = customers.find((c) => c.id === vehicle?.customerId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amounts, setAmounts] = useState(true);
  const [plans, setPlans] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const history = services.filter((service) => service.vehicleId === vehicleId);
  const selected = historyInPeriod(history, from, to);
  const invalid = !!from && !!to && from > to;
  const download = async () => {
    if (!vehicle || !customer || busy || invalid || !selected.length) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await createVehicleHistoryPDF({
        vehicle,
        customer,
        services: history,
        workshop,
        today: referenceDate,
        from: from || undefined,
        to: to || undefined,
        includeAmounts: amounts,
        includePlans: plans,
        demo: mode === 'demo',
      });
      if (!mounted.current) return;
      const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccess('Historial PDF descargado.');
    } catch {
      if (mounted.current)
        setError(
          'No se pudo generar o descargar el historial PDF. Tus registros se conservan; volvé a intentarlo.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Modal title="Descargar historial del vehículo" close={close} protectChanges={false}>
      <div className="form-stack vehicle-history-pdf">
        {!vehicle || !customer ? (
          <p role="alert">El vehículo o su cliente ya no están disponibles.</p>
        ) : (
          <>
            <p>
              <strong>
                {vehicle.brand} {vehicle.model} · {vehicle.plate}
              </strong>
              <br />
              Cliente actual: {customer.name}
            </p>
            <p>Elegí el período y el contenido del informe para guardar o entregar al cliente.</p>
            <div className="form-grid">
              <label>
                Desde
                <input
                  type="date"
                  value={from}
                  disabled={busy}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setSuccess('');
                    setError('');
                  }}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={to}
                  disabled={busy}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setSuccess('');
                    setError('');
                  }}
                />
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={amounts}
                disabled={busy}
                onChange={(e) => {
                  setAmounts(e.target.checked);
                  setSuccess('');
                }}
              />
              Incluir importes de los servicios
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={plans}
                disabled={busy}
                onChange={(e) => {
                  setPlans(e.target.checked);
                  setSuccess('');
                }}
              />
              Incluir próximos servicios vigentes
            </label>
            <p className="info-strip">
              {selected.length}{' '}
              {selected.length === 1 ? 'mantenimiento activo' : 'mantenimientos activos'} en el
              período elegido. Fecha del informe: {dateLabel(referenceDate)}.
            </p>
            <p className="fineprint">
              Incluye trabajos e insumos. Las observaciones privadas, los registros anulados y los
              archivos adjuntos quedan fuera del informe.{' '}
              {mode === 'demo' && 'El PDF se identifica como demostración.'}
            </p>
            {invalid && (
              <p role="alert" className="form-error">
                La fecha Desde debe ser anterior o igual a Hasta.
              </p>
            )}
            {!invalid && !selected.length && <p>No hay mantenimientos activos en este período.</p>}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || invalid || !selected.length}
              onClick={download}
            >
              <FileDown size={17} />
              {busy ? 'Generando historial…' : 'Descargar historial PDF'}
            </button>
            {success && <p role="status">{success}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
export function VehicleHistoryPDFButton({ vehicleId }: { vehicleId: string }) {
  const { activeServices } = useData();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="button small"
        disabled={!activeServices.some((s) => s.vehicleId === vehicleId)}
        onClick={() => setOpen(true)}
      >
        <FileDown size={15} />
        Historial PDF
      </button>
      {open && <HistoryPDFOptions vehicleId={vehicleId} close={() => setOpen(false)} />}
    </>
  );
}
