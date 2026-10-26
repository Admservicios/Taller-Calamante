import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import type { Customer } from '../lib/demo';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
const LIMIT = 80;
export function CustomerFilter({
  customers,
  value,
  onChange,
  label,
}: {
  customers: Customer[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({
    left: 12,
    top: 60,
    width: 280,
    maxHeight: 320,
  });
  const selected = customers.find((c) => c.id === value);
  const text = normalize(query);
  const digits = /^[\d\s()+.\-]+$/.test(text) ? text.replace(/\D/g, '') : '';
  const sorted = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [customers],
  );
  const matches = useMemo(
    () =>
      sorted.filter(
        (c) =>
          normalize(`${c.name} ${c.document} ${c.phone}`).includes(text) ||
          (!!digits &&
            `${c.document.replace(/\D/g, '')} ${c.phone.replace(/\D/g, '')}`.includes(digits)),
      ),
    [sorted, text, digits],
  );
  const visible = matches.slice(0, LIMIT);
  // Al abrir se conserva visible la selección aunque esté lejos en una lista extensa.
  if (!text && selected && !visible.some((c) => c.id === selected.id)) {
    visible.unshift(selected);
    visible.length = Math.min(visible.length, LIMIT);
  }
  const options = [
    { value: '', name: 'Todos los clientes', detail: '' },
    ...visible.map((c) => ({
      value: c.id,
      name: c.name,
      detail: [c.document ? `DNI / CUIT ${c.document}` : '', c.phone].filter(Boolean).join(' · '),
    })),
  ];
  const activeIndex = Math.min(active, options.length - 1);
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const choose = (selectedValue: string) => {
    onChange(selectedValue);
    close(true);
  };
  const show = () => {
    setQuery('');
    const index = options.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };
  useLayoutEffect(() => {
    if (!open) return;
    input.current?.focus();
    const locate = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const view = window.visualViewport;
      const viewTop = view?.offsetTop ?? 0;
      const viewBottom = viewTop + (view?.height ?? innerHeight);
      const below = viewBottom - box.bottom - 12;
      const above = box.top - viewTop - 12;
      const upwards = below < 220 && above > below;
      const maxHeight = Math.max(100, Math.min(360, upwards ? above - 6 : below - 6));
      const width = Math.min(Math.max(box.width, 280), innerWidth - 24);
      setPosition({
        left: Math.max(12, Math.min(box.left, innerWidth - width - 12)),
        top: upwards ? undefined : box.bottom + 6,
        bottom: upwards ? innerHeight - box.top + 6 : undefined,
        width,
        maxHeight,
      });
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) close();
    };
    locate();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', locate);
    window.addEventListener('scroll', locate, true);
    window.visualViewport?.addEventListener('resize', locate);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', locate);
      window.removeEventListener('scroll', locate, true);
      window.visualViewport?.removeEventListener('resize', locate);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open)
      setActive(
        query
          ? matches.length
            ? 1
            : -1
          : Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
      );
  }, [open, query, matches.length]);
  useLayoutEffect(() => {
    if (open && activeIndex >= 0)
      document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, id]);
  return (
    <div className="customer-filter">
      <button
        type="button"
        className="customer-filter-trigger"
        ref={trigger}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>{selected?.name ?? (value ? 'Cliente no disponible' : 'Todos los clientes')}</span>
        <ChevronDown size={16} />
      </button>
      {open &&
        createPortal(
          <div className="customer-filter-popup" ref={popup} style={position}>
            <div className="customer-filter-search">
              <Search size={17} aria-hidden="true" />
              <input
                ref={input}
                type="search"
                role="combobox"
                aria-label="Buscar cliente"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
                autoComplete="off"
                placeholder="Nombre, DNI o teléfono…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setActive((index) => Math.min(options.length - 1, index + 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setActive((index) => Math.max(0, index - 1));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    if (activeIndex >= 0) choose(options[activeIndex].value);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close(true);
                  } else if (event.key === 'Tab') close(true);
                }}
              />
            </div>
            <div
              id={`${id}-list`}
              role="listbox"
              aria-label="Clientes disponibles"
              className="customer-filter-options"
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-label={option.name}
                  aria-selected={option.value === value}
                  aria-describedby={option.detail ? `${id}-detail-${index}` : undefined}
                  className={`customer-filter-option ${index === activeIndex ? 'highlighted' : ''}`}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.value)}
                >
                  <strong>{option.name}</strong>
                  {option.detail && <small id={`${id}-detail-${index}`}>{option.detail}</small>}
                </div>
              ))}
            </div>
            <p className="customer-filter-count" role="status">
              {matches.length
                ? `${matches.length} ${matches.length === 1 ? 'cliente' : 'clientes'}${matches.length > LIMIT ? `. Mostrando ${LIMIT}; escribí para acotar la búsqueda.` : ''}`
                : 'No encontramos clientes con esa búsqueda.'}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
