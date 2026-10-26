import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import { useUnsavedChanges } from './UnsavedChanges';
import { CarFront, ChevronRight, Inbox, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? 'brand-compact' : ''}`} to="/">
      <CarFront aria-hidden="true" />
      <span>
        <small className="brand-kicker">TALLER</small>
        <strong>Calamante</strong>
        <small>Gestión y mantenimiento vehicular</small>
      </span>
    </Link>
  );
}
export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = '',
}: {
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>
            {Icon && <Icon size={19} aria-hidden="true" />}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  const tone =
    children === 'Vencido' || children === 'Inactivo'
      ? 'red'
      : children === 'Sin datos'
        ? 'neutral'
        : children === 'Próximo'
          ? 'amber'
          : 'green';
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({ name, size = '' }: { name: string; size?: string }) {
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {name
        .split(' ')
        .slice(0, 2)
        .map((p) => p[0])
        .join('')}
    </span>
  );
}
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{text}</h3>
      <p>Probá con otra búsqueda o agregá un registro de demostración.</p>
      {action}
    </div>
  );
}
const DiscardModal = createContext<() => boolean>(() => true);
export function ModalCancelButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const confirmDiscard = useContext(DiscardModal);
  return (
    <button
      {...props}
      type="button"
      onClick={(event) => {
        if (confirmDiscard()) props.onClick?.(event);
      }}
    />
  );
}
export function Modal({
  title,
  children,
  close,
  protectChanges = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  protectChanges?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [dirty, setDirty] = useState(false);
  const { confirmDiscard } = useUnsavedChanges(dirty);
  const guardedClose = () => {
    if (confirmDiscard()) close();
  };
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <DiscardModal.Provider value={confirmDiscard}>
      <dialog
        ref={ref}
        className="modal"
        aria-label={title}
        onChangeCapture={protectChanges ? () => setDirty(true) : undefined}
        onCancel={(e) => {
          e.preventDefault();
          guardedClose();
        }}
      >
        <div className="panel-heading">
          <h2>{title}</h2>
          <button
            type="button"
            autoFocus
            className="icon-button"
            onClick={guardedClose}
            aria-label="Cerrar diálogo"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </dialog>
    </DiscardModal.Provider>
  );
}
export function VehicleArt({
  color = 'silver',
  large = false,
}: {
  color?: string;
  large?: boolean;
}) {
  return (
    <div className={`vehicle-art ${color} ${large ? 'large' : ''}`}>
      <div className="vehicle-art-grid" />
      <CarFront aria-hidden="true" strokeWidth={1} />
      <span>TALLER CALAMANTE / GARAGE</span>
    </div>
  );
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ChevronRight size={14} />
    </Link>
  );
}
