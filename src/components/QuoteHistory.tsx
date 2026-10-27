import { localToday } from '../lib/localDatabase';
import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { useData } from '../app/store';
import type { Service } from '../lib/demo';
import { dateLabel } from '../lib/demo';
import { reportMoney } from '../lib/maintenanceReport';
import { workStages } from '../lib/workOrders';
import { downloadQuotePDF } from '../lib/quotePDF';
export function QuoteHistory({ service }: { service: Service }) {
  const { mode, notify } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <>
      {!!service.quotes?.length && (
        <details className="help-details quote-history">
          <summary>Presupuestos emitidos ({service.quotes.length})</summary>
          <p className="fineprint">Cada versión conserva lo que se presupuestó en ese momento.</p>
          <ul>
            {[...service.quotes].reverse().map((quote) => (
              <li key={quote.id}>
                <span>
                  <strong>
                    Versión {quote.version} · {reportMoney(quote.service.amount)}
                  </strong>
                  <small>
                    {dateLabel(localToday(new Date(quote.issuedAt)))} · {quote.vehicle.plate}
                  </small>
                </span>
                <button
                  type="button"
                  className="button small"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(quote.id);
                    try {
                      await downloadQuotePDF(quote, mode === 'demo');
                      notify('Presupuesto descargado.');
                    } catch {
                      notify(
                        'No se pudo descargar. La versión emitida se conserva; volvé a intentarlo.',
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <FileDown size={15} />
                  {busy === quote.id ? 'Generando…' : `PDF versión ${quote.version}`}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!service.workHistory?.length && (
        <details className="help-details">
          <summary>Seguimiento del trabajo</summary>
          <ol>
            {service.workHistory.map((entry, i) => (
              <li key={i}>
                {workStages[entry.to]} ·{' '}
                {new Date(entry.at).toLocaleString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                })}
                {entry.reason && <p>{entry.reason}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
