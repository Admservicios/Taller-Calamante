import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { useData } from '../app/store';
import { dateLabel, type Service } from '../lib/demo';
import { downloadServicePDF } from '../lib/servicePDF';

export function ServicePDFButton({ service, label = 'PDF' }: { service: Service; label?: string }) {
  const { vehicles, customers, workshop, mode, notify } = useData();
  const [busy, setBusy] = useState(false);
  const vehicle = vehicles.find((v) => v.id === service.vehicleId);
  const customer = customers.find((c) => c.id === vehicle?.customerId);
  return (
    <button
      type="button"
      className="button small"
      disabled={busy || !!service.annulment || !vehicle || !customer}
      aria-label={`Descargar PDF de ${service.type} del ${dateLabel(service.date)} · ${vehicle?.plate}`}
      onClick={async () => {
        if (busy || service.annulment || !vehicle || !customer) return;
        setBusy(true);
        try {
          await downloadServicePDF({ service, vehicle, customer, workshop, demo: mode === 'demo' });
          notify('Comprobante PDF descargado.');
        } catch {
          notify(
            'No se pudo generar el PDF. Tus registros se conservan; podés volver a intentarlo.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileDown size={15} />
      {busy ? 'Generando…' : label}
    </button>
  );
}
