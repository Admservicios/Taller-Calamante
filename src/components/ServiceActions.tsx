import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, History, Ban, RotateCcw } from 'lucide-react';
import type { Service } from '../lib/demo';
import { ServicePDFButton } from './ServicePDFButton';

export function ServiceActions({
  service,
  plate,
  onHistory,
  onStatus,
}: {
  service: Service;
  plate?: string;
  onHistory: () => void;
  onStatus: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const place = () => {
    if (!trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = popup.current.getBoundingClientRect();
    const width = box.width || 240;
    const height = box.height || 180;
    popup.current.style.left = `${Math.max(12, Math.min(anchor.right - width, innerWidth - width - 12))}px`;
    popup.current.style.top = `${Math.max(12, anchor.bottom + height + 8 < innerHeight ? anchor.bottom + 6 : anchor.top - height - 6)}px`;
  };
  const close = () => popup.current?.hidePopover();
  useEffect(() => {
    if (!open) return;
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) close();
    };
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <div className="history-row-actions">
      {service.annulment ? (
        <button
          className="button small"
          aria-label={`Recuperar servicio de ${plate} del ${service.date}`}
          onClick={onStatus}
        >
          <RotateCcw size={14} /> Recuperar
        </button>
      ) : (
        <Link
          className="button small"
          to={`/mantenimientos/${service.id}/editar`}
          aria-label={`Editar servicio de ${plate} del ${service.date}`}
        >
          Editar
        </Link>
      )}
      <button
        ref={trigger}
        type="button"
        className="button small"
        popoverTarget={id}
        aria-controls={id}
        aria-expanded={open}
        aria-label={`Más opciones de ${plate} del ${service.date}`}
        onClick={place}
      >
        Más opciones <ChevronDown size={14} />
      </button>
      <div
        ref={popup}
        id={id}
        popover="auto"
        className="service-actions-popup"
        aria-label={`Acciones de ${plate} del ${service.date}`}
        onToggle={(event) => {
          const visible = event.currentTarget.matches(':popover-open');
          setOpen(visible);
          if (visible) place();
        }}
      >
        {!service.annulment && <ServicePDFButton service={service} label="Descargar PDF" />}
        <button
          type="button"
          className="button small"
          aria-label={`Ver cambios de ${plate} del ${service.date}`}
          onClick={() => {
            close();
            onHistory();
          }}
        >
          <History size={16} /> Ver detalle y cambios
        </button>
        {!service.annulment && (
          <button
            type="button"
            className="button small service-annul-action"
            aria-label={`Anular servicio de ${plate} del ${service.date}`}
            onClick={() => {
              close();
              onStatus();
            }}
          >
            <Ban size={16} /> Anular mantenimiento
          </button>
        )}
      </div>
    </div>
  );
}
