import { Products } from '../features/Products';
import { isServerMode, api } from '../lib/serverClient';
import { useConfirmDiscard } from '../components/UnsavedChanges';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  CarFront,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  CloudUpload,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  Package,
  Wrench,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Brand } from '../components/ui';
import { DataProvider, useData } from './store';
import { allPlanRows, planStatus } from '../lib/maintenancePlans';
import { Dashboard } from '../features/Dashboard';
import { Customers } from '../features/Customers';
import { VehicleDetail, Vehicles } from '../features/Vehicles';
import { MaintenanceForm, MaintenanceList, Reminders } from '../features/Maintenance';
import { Backups, SettingsPage } from '../features/Settings';
import { PublicHistory } from '../features/PublicHistory';
import { OfflineNotice } from '../components/OfflineApp';
import { AutomaticBackupsProvider, AutomaticBackupNotice } from '../components/AutomaticBackups';

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/vehiculos', label: 'Vehículos', icon: CarFront },
  { to: '/mantenimientos', label: 'Mantenimientos', icon: ClipboardCheck },
  { to: '/proximos-servicios', label: 'Próximos servicios', icon: CalendarDays },
  { to: '/productos', label: 'Productos', icon: Package },
  { to: '/backups', label: 'Backups', icon: CloudUpload },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];
function Layout() {
  const confirmDiscard = useConfirmDiscard();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('motortrack-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const {
    customers,
    vehicles,
    toast,
    clearToast,
    mode,
    switchMode,
    workshop,
    storageError,
    referenceDate,
  } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('motortrack-theme', dark ? 'dark' : 'light');
    } catch {
      /* La preferencia visual no impide usar la interfaz. */
    }
  }, [dark]);
  useEffect(() => {
    setMenu(false);
    setSearch('');
    setNotifications(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(clearToast, 5500);
    return () => clearTimeout(timeout);
  }, [toast, clearToast]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false);
        setSearch('');
        setNotifications(false);
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const normalized = search.toLocaleLowerCase('es');
  const results = [
    ...customers
      .filter((c) => `${c.name} ${c.document}`.toLocaleLowerCase('es').includes(normalized))
      .map((c) => ({ title: c.name, detail: 'Cliente', to: `/clientes?cliente=${c.id}` })),
    ...vehicles
      .filter((v) =>
        `${v.brand} ${v.model} ${v.plate}`.toLocaleLowerCase('es').includes(normalized),
      )
      .map((v) => ({ title: `${v.brand} ${v.model}`, detail: v.plate, to: `/vehiculos/${v.id}` })),
  ].slice(0, 6);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#contenido"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('contenido')?.focus();
        }}
      >
        Saltar al contenido
      </a>
      {menu && (
        <button
          className="sidebar-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Navegación principal">
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setMenu(false)}
            aria-label="Cerrar menú"
          >
            <X />
          </button>
        </div>
        <span className="nav-caption">TU ESPACIO DE TRABAJO</span>
        <nav aria-label="Navegación principal">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink end={to === '/'} key={to} to={to}>
              <Icon size={20} />
              <span>{label}</span>
              {to === '/proximos-servicios' && (
                <span className="nav-count">
                  {
                    allPlanRows(vehicles, referenceDate).filter(
                      ({ vehicle, plan }) =>
                        planStatus(plan, vehicle.km, referenceDate) !== 'Al día',
                    ).length
                  }
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-promo">
          <div className="promo-car">
            <CarFront size={120} strokeWidth={0.8} />
          </div>
          <span className="eyebrow">CADA KILÓMETRO CUENTA</span>
          <h2>
            Vehículos en
            <br />
            buenas manos.
          </h2>
          <p>
            Control, confianza y más
            <br />
            kilómetros juntos.
          </p>
          <div className="promo-line" />
        </div>
        <div className="sidebar-footer">
          <span className="online-dot" />{' '}
          {mode === 'demo'
            ? 'Entorno de demostración'
            : isServerMode()
              ? 'Conectado a la PC del taller'
              : 'Datos en este navegador'}{' '}
          <span>v0.3</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            aria-label="Abrir menú"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="global-search">
            <Search size={19} />
            <input
              aria-label="Búsqueda global"
              placeholder="Buscar clientes, vehículos o patentes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearch('')}
              >
                <X size={15} />
              </button>
            )}
            {search && (
              <div className="search-results">
                {results.length ? (
                  results.map((r) => (
                    <Link key={r.to} to={r.to}>
                      <Search size={16} />
                      <span>
                        {r.title}
                        <small>{r.detail}</small>
                      </span>
                    </Link>
                  ))
                ) : (
                  <p>Sin resultados para “{search}”.</p>
                )}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className="notification-wrap">
              <button
                className="icon-button notification-button"
                aria-label="Ver notificaciones"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={21} />
                <i />
              </button>
              {notifications && (
                <div className="notification-popover">
                  <h3>Tu taller, al día</h3>
                  <p>Consultá los vencimientos registrados. No se envían avisos automáticos.</p>
                  <Link to="/proximos-servicios">Ver próximos servicios →</Link>
                </div>
              )}
            </div>
            <button className="profile-button" onClick={() => navigate('/ajustes')}>
              <span className="profile-avatar">{mode === 'demo' ? 'ML' : 'TC'}</span>
              <span>
                <strong>{mode === 'demo' ? 'Matías López' : workshop.name}</strong>
                <small>
                  {mode === 'demo'
                    ? 'Taller Calamante · Demo'
                    : isServerMode()
                      ? 'PC del taller · Compartida'
                      : 'Este navegador · Local'}
                </small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>
        <OfflineNotice />
        {isServerMode() && (
          <div className="local-mode-bar">
            <span>Conectado a la PC del taller</span>
            <button
              className="button small"
              onClick={async () => {
                if (!confirmDiscard()) return;
                await api('/logout', { method: 'POST' });
                window.location.reload();
              }}
            >
              Cerrar sesión
            </button>
          </div>
        )}
        <AutomaticBackupNotice />
        <div className="demo-banner">
          <span>
            <span className="online-dot" />{' '}
            {mode === 'demo'
              ? 'Vista de demostración'
              : isServerMode()
                ? 'PC del taller'
                : 'Base local'}
          </span>
          <p>
            {mode === 'demo'
              ? 'Datos ficticios. Los cambios duran hasta recargar la página.'
              : isServerMode()
                ? 'Los datos se guardan en la PC del taller.'
                : 'Los datos quedan en este navegador. Descargá respaldos periódicamente.'}
          </p>
          <button
            className="mode-switch"
            onClick={() => {
              if (!confirmDiscard()) return;
              switchMode();
              navigate('/');
            }}
          >
            {mode === 'demo' ? 'Volver a mis datos' : 'Explorar demo'}
          </button>
        </div>
        <main id="contenido" tabIndex={-1}>
          {storageError && (
            <div className="storage-error" role="alert">
              <strong>No se puede usar la base local.</strong>
              <p>{storageError}</p>
              <Link className="button" to="/backups">
                Recuperar respaldo
              </Link>
            </div>
          )}
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>
            Taller Calamante <span>·</span> Gestión hoy. Kilómetros mañana.
          </span>
          <span>
            <CircleHelp size={14} />{' '}
            {isServerMode()
              ? 'Base en la PC del taller · Dispositivos autorizados'
              : 'Almacenamiento local · Sin sincronización entre equipos'}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={21} />
          <span>{toast}</span>
          <button className="icon-button" aria-label="Cerrar aviso" onClick={clearToast}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
function NotFound() {
  return (
    <div className="empty">
      <Wrench size={40} />
      <h1>No encontramos esta página</h1>
      <Link className="button primary" to="/">
        Volver al Dashboard
      </Link>
    </div>
  );
}
export default function App() {
  return (
    <DataProvider>
      <AutomaticBackupsProvider>
        <Routes>
          <Route path="/publico/demo-hilux" element={<PublicHistory />} />
          <Route path="/publico/demo/:id" element={<PublicHistory />} />
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="clientes" element={<Customers />} />
            <Route path="vehiculos" element={<Vehicles />} />
            <Route path="vehiculos/:id" element={<VehicleDetail />} />
            <Route path="mantenimientos" element={<MaintenanceList />} />
            <Route path="mantenimientos/nuevo" element={<MaintenanceForm key="new" />} />
            <Route path="mantenimientos/:id/editar" element={<MaintenanceForm />} />
            <Route path="proximos-servicios" element={<Reminders />} />
            <Route path="productos" element={<Products />} />
            <Route path="backups" element={<Backups />} />
            <Route path="ajustes" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AutomaticBackupsProvider>
    </DataProvider>
  );
}
