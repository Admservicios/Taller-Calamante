import { useEffect, useState, type ReactNode } from 'react';

export function MoreOptions({
  label,
  active = 0,
  children,
}: {
  label: string;
  active?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(active > 0);
  useEffect(() => {
    if (active > 0) setOpen(true);
  }, [active]);
  return (
    <details
      className="more-options"
      aria-label={label}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label={label}>
        Más opciones
        {active > 0 && (
          <span className="options-count">
            {active} {active === 1 ? 'opción aplicada' : 'opciones aplicadas'}
          </span>
        )}
      </summary>
      <div className="more-options-content">{children}</div>
    </details>
  );
}
