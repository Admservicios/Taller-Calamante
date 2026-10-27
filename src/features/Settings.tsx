import { isServerMode } from '../lib/serverClient';
import { randomId } from '../lib/ids';
import { useUnsavedChanges } from '../components/UnsavedChanges';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArchiveRestore,
  Building2,
  Check,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderArchive,
  HardDriveDownload,
  Info,
  Save,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Avatar, Modal, PageTitle, Panel } from '../components/ui';
import { useData } from '../app/store';
import { OfflineSettings } from '../components/OfflineApp';
import { AutomaticBackupPanel, useAutomaticBackups } from '../components/AutomaticBackups';
import { customerCSV, download } from '../lib/demo';
import practiceBackup from '../data/taller-calamante-practica-stock.json';
import {
  createPhotoBackup,
  downloadBlob,
  MAX_PHOTO_ARCHIVE_BYTES,
  parsePhotoBackup,
  type ArchivePhoto,
} from '../lib/photoBackup';
import { discardPhotos, storePhotos, validatePhoto, type StoredPhoto } from '../lib/photos';
import {
  discardDocuments,
  storeDocuments,
  type PreparedDocument,
  type StoredDocument,
} from '../lib/documents';
import {
  DATABASE_KEY,
  MAX_BACKUP_BYTES,
  SAFETY_COPY_KEY,
  makeBackup,
  parseBackup,
  type LocalBackup,
} from '../lib/localDatabase';

export function Backups() {
  const auto = useAutomaticBackups();
  const {
    jobs,
    stockMovements,
    products,
    customers,
    vehicles,
    services,
    photos,
    photoSet,
    documents,
    documentSet,
    workshop,
    mode,
    storageError,
    updatedAt,
    restoreBackup,
    notify,
  } = useData();
  const [candidate, setCandidate] = useState<LocalBackup | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [lastExport, setLastExport] = useState('');
  const [candidatePhotos, setCandidatePhotos] = useState<ArchivePhoto[] | null>(null);
  const [candidateDocuments, setCandidateDocuments] = useState<PreparedDocument[] | null>(null);
  const [working, setWorking] = useState(false);
  const [reading, setReading] = useState(false);
  const localData = {
    ...(jobs ? { jobs } : {}),
    ...(stockMovements ? { stockMovements } : {}),
    ...(products ? { products } : {}),
    customers,
    vehicles,
    services,
    workshop,
    ...(photoSet ? { photoSet, photos } : {}),
    ...(documentSet ? { documentSet, documents } : {}),
  };
  const exportZIP = async () => {
    if (working || storageError) return;
    setWorking(true);
    setError('');
    try {
      if (mode === 'demo')
        throw new Error('Volvé a tus datos para descargar un respaldo completo.');
      const blob = await createPhotoBackup(localData);
      downloadBlob(blob, `taller-calamante-completo-${new Date().toISOString().slice(0, 10)}.zip`);
      setLastExport(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
      notify('Respaldo completo descargado: registros, fotos y documentos en un ZIP.');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No se pudo descargar el respaldo completo.',
      );
    } finally {
      setWorking(false);
    }
  };
  const exportJSON = () => {
    if (storageError) {
      setError('Primero recuperá la base local o descargá la copia sin modificar.');
      return;
    }
    const data =
      mode === 'demo'
        ? {
            format: 'motortrack-interface-demo',
            version: 1,
            demo: true,
            restorable: false,
            exportedAt: new Date().toISOString(),
            jobs: jobs ?? [],
            products: products ?? [],
            stockMovements: stockMovements ?? [],
            customers,
            vehicles,
            services,
          }
        : makeBackup(localData);
    download(
      mode === 'demo'
        ? 'taller-calamante-datos-demo.json'
        : `taller-calamante-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    );
    setLastExport(new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
    notify(
      mode === 'demo'
        ? 'Datos ficticios exportados. Este archivo no es un respaldo restaurable.'
        : 'Respaldo local descargado. Guardalo en una ubicación independiente.',
    );
  };
  const downloadRaw = (key: string) => {
    if (isServerMode()) {
      window.location.href = '/api/backup?previous=1';
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        notify('No hay una copia disponible en este navegador.');
        return;
      }
      download('taller-calamante-copia-local-sin-modificar.json', raw, 'application/json');
    } catch {
      notify('El navegador no permite leer esa copia.');
    }
  };
  const readFile = async (e: ChangeEvent<HTMLInputElement>) => {
    setCandidate(null);
    setCandidatePhotos(null);
    setCandidateDocuments(null);
    setError('');
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || reading || working) return;
    const zip = file.name.toLowerCase().endsWith('.zip');
    if (file.size > (zip ? MAX_PHOTO_ARCHIVE_BYTES : MAX_BACKUP_BYTES)) {
      setError(
        zip ? 'El respaldo ZIP supera los 100 MB.' : 'El respaldo supera el límite de 5 MB.',
      );
      return;
    }
    setReading(true);
    try {
      if (zip) {
        const parsed = await parsePhotoBackup(new Uint8Array(await file.arrayBuffer()));
        for (const photo of parsed.photos) await validatePhoto(photo);
        setCandidate(parsed.backup);
        setCandidatePhotos(parsed.photos);
        setCandidateDocuments(parsed.documents);
      } else setCandidate(parseBackup(await file.text()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo leer el archivo.');
    } finally {
      setReading(false);
    }
  };
  const restore = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!candidate || working) return;
    setWorking(true);
    setError('');
    let staged: StoredPhoto[] = [];
    let stagedDocuments: StoredDocument[] = [];
    try {
      const data = { ...candidate.data };
      if (candidatePhotos !== null) {
        if (candidatePhotos.length) {
          const setId = randomId();
          staged = candidatePhotos.map((photo) => ({ ...photo, id: randomId(), setId }));
          await storePhotos(staged);
          data.photoSet = setId;
          data.photos = staged.map(({ data: _blob, setId: _set, ...ref }) => ref);
        } else {
          delete data.photoSet;
          delete data.photos;
        }
      }
      if (candidateDocuments !== null) {
        if (candidateDocuments.length) {
          const setId = randomId();
          stagedDocuments = candidateDocuments.map((document) => ({
            ...document,
            id: randomId(),
            setId,
          }));
          await storeDocuments(stagedDocuments);
          data.documentSet = setId;
          data.documents = stagedDocuments.map(({ data: _blob, setId: _set, ...ref }) => ref);
        } else {
          delete data.documentSet;
          delete data.documents;
        }
      }
      if (!(await restoreBackup({ ...candidate, data })))
        throw new Error('No se pudo restaurar. La base actual se conserva.');
      staged = [];
      stagedDocuments = [];
      setCandidate(null);
      setCandidatePhotos(null);
      setCandidateDocuments(null);
      setConfirming(false);
      setError('');
      notify('Respaldo restaurado. Se conservó una copia previa cuando existían datos.');
    } catch {
      await discardPhotos(staged.map((p) => p.id)).catch(() => {});
      await discardDocuments(stagedDocuments.map((d) => d.id)).catch(() => {});
      setError(
        'No se pudo restaurar la base con sus archivos. Revisá el espacio disponible. La base actual se conserva.',
      );
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Backups y recuperación"
        subtitle="La información de tu taller tiene que seguir siendo tuya."
      />
      <div className="backup-hero">
        <div className="backup-hero-icon">
          <ShieldCheck size={42} strokeWidth={1.5} />
        </div>
        <div>
          <span className="eyebrow">TU INFORMACIÓN, BAJO CONTROL</span>
          <h2>Trabajá con tranquilidad.</h2>
          <p>Descargá una copia y recuperá tus registros en este u otro navegador.</p>
        </div>
        <span className="subtle-chip">Formato versionado · v1</span>
      </div>
      <div className="info-strip">
        <Info size={19} />
        <span>
          {mode === 'demo'
            ? 'Estás en la demostración. Las exportaciones son ficticias y no son restaurables. Volvé a tus datos para usar respaldos locales.'
            : isServerMode()
              ? 'Los datos y archivos se guardan en la PC del taller. El ZIP completo permite trasladarlos o recuperarlos.'
              : 'Los datos están solo en este navegador. Borrar los datos del sitio o cambiar de dirección web puede dejarte sin acceso a ellos: descargá respaldos periódicamente. GitHub no guarda tu base local.'}
        </span>
      </div>
      <div className="backup-layout">
        <div>
          <Panel title="Datos de práctica" icon={Database}>
            <p className="panel-description">
              Probá el sistema con {practiceBackup.data.customers.length} clientes,{' '}
              {practiceBackup.data.vehicles.length} vehículos y{' '}
              {practiceBackup.data.services.length} mantenimientos ficticios,{' '}
              {practiceBackup.data.products.length} productos y{' '}
              {practiceBackup.data.stockMovements.length} movimientos de stock. Incluye consumos,
              una corrección, una anulación con devolución y próximos servicios.
            </p>
            <button
              className="button"
              onClick={() => {
                download(
                  'taller-calamante-practica-stock.json',
                  JSON.stringify(practiceBackup, null, 2),
                  'application/json',
                );
                notify('Archivo de práctica descargado. Seleccionalo en Restaurar un respaldo.');
              }}
            >
              <Download size={16} />
              Descargar datos de práctica
            </button>
            <button
              className="button practice-stock-download"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                setError('');
                try {
                  const validated = parseBackup(JSON.stringify(practiceBackup));
                  const blob = await createPhotoBackup(validated.data, [], []);
                  downloadBlob(blob, 'taller-calamante-practica-stock.zip');
                  notify(
                    'ZIP de práctica descargado. Seleccionalo en Restaurar un respaldo; reemplaza la base actual.',
                  );
                } catch {
                  setError(
                    'No se pudo preparar el ZIP de práctica. Volvé a intentarlo o descargá el JSON.',
                  );
                } finally {
                  setWorking(false);
                }
              }}
            >
              <Download size={16} />
              Descargar práctica con stock · ZIP
            </button>
            <p className="fine-print">
              Descargá el archivo y seleccionalo en Restaurar un respaldo, en modo local. La
              importación reemplaza la base actual: guardá antes un respaldo de tus datos propios.
              La descarga por sí sola no cambia tus registros.
            </p>
          </Panel>
          <AutomaticBackupPanel />
          <Panel title="Exportar información" icon={HardDriveDownload}>
            <p className="panel-description">
              Clientes, vehículos, mantenimientos, catálogo de productos y datos del taller. Si
              cargaste fotos o documentos, usá el ZIP completo.
            </p>
            <div className="export-options">
              <div>
                <span className="export-icon blue">
                  <FileJson size={27} />
                </span>
                <span>
                  <h3>{mode === 'demo' ? 'Datos de la sesión · JSON' : 'Respaldo local · JSON'}</h3>
                  <p>
                    {customers.length} clientes, {vehicles.length} vehículos y {services.length}{' '}
                    mantenimientos · {jobs?.length ?? 0} presupuestos y trabajos.
                  </p>
                  <small>
                    {mode === 'demo'
                      ? 'Datos ficticios. No restaurable.'
                      : 'Solo registros. Las fotos y documentos se recuperan con el ZIP completo.'}
                  </small>
                </span>
                <button
                  className="button primary"
                  onClick={exportJSON}
                  disabled={!!storageError || working}
                >
                  <Download size={16} />
                  Descargar
                </button>
              </div>
              <div>
                <span className="export-icon green">
                  <FileSpreadsheet size={27} />
                </span>
                <span>
                  <h3>Listado de clientes · CSV</h3>
                  <p>Archivo compatible con hojas de cálculo.</p>
                  <small>
                    Solo clientes. Usá el ZIP completo para recuperar registros, fotos y documentos.
                  </small>
                </span>
                <button
                  className="button"
                  disabled={!!storageError}
                  onClick={() =>
                    download(
                      mode === 'demo'
                        ? 'taller-calamante-clientes-demo.csv'
                        : 'taller-calamante-clientes.csv',
                      customerCSV(customers),
                      'text/csv;charset=utf-8',
                    )
                  }
                >
                  <Download size={16} />
                  Descargar
                </button>
              </div>
              <div>
                <span className="export-icon amber">
                  <FolderArchive size={27} />
                </span>
                <span>
                  <h3>Respaldo completo con archivos · ZIP</h3>
                  <p>Clientes, vehículos, mantenimientos, fotos y documentos guardados.</p>
                  <small>
                    Usá esta opción para recuperar también los archivos en otro navegador.
                  </small>
                </span>
                <button
                  className="button"
                  disabled={mode === 'demo' || !!storageError || working}
                  onClick={exportZIP}
                >
                  <Download size={16} />
                  {working ? 'Preparando…' : 'Descargar ZIP completo'}
                </button>
              </div>
            </div>
          </Panel>
          <Panel title="Restaurar un respaldo" icon={ArchiveRestore}>
            <div className="restore-placeholder">
              <ArchiveRestore size={34} />
              <h3>Recuperación con validación previa</h3>
              <p>
                Elegí un respaldo JSON o ZIP de Taller Calamante. Se comprobarán su versión,
                patentes y relaciones antes de permitir un reemplazo.
              </p>
              <label className="button">
                <span className="sr-only">Seleccionar respaldo JSON o ZIP</span>
                <input
                  aria-label="Seleccionar respaldo JSON o ZIP"
                  className="backup-file-input"
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  onChange={readFile}
                  disabled={mode === 'demo' || working || reading}
                />
                {mode === 'demo'
                  ? 'Restauración disponible en modo local'
                  : 'Seleccionar respaldo JSON o ZIP'}
              </label>
              <small>
                JSON: hasta 5 MB. ZIP completo: hasta 100 MB. El archivo se procesa en este
                navegador.
              </small>
              {reading && <p role="status">Verificando el respaldo y sus archivos…</p>}
            </div>
            {error && !confirming && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {candidate && (
              <div className="backup-candidate">
                <h3>Respaldo válido · {candidate.data.workshop.name}</h3>
                <p>
                  {candidate.data.customers.length} clientes · {candidate.data.vehicles.length}{' '}
                  vehículos · {candidate.data.services.length} mantenimientos ·{' '}
                  {candidate.data.jobs?.length ?? 0} presupuestos y trabajos
                </p>
                <p>
                  {candidate.data.products?.length ?? 0} productos ·{' '}
                  {candidate.data.stockMovements?.length ?? 0} movimientos de stock
                </p>
                <p>
                  {candidatePhotos !== null
                    ? `${candidatePhotos.length} fotos y ${candidateDocuments?.length ?? 0} documentos incluidos en el ZIP.`
                    : 'JSON de registros: no incluye fotos ni documentos. Para recuperarlos en otro navegador necesitás el ZIP completo.'}
                </p>
                <p className="muted">
                  Exportado: {new Date(candidate.exportedAt).toLocaleString('es-AR')}
                </p>
                <button
                  className="button primary"
                  disabled={working}
                  onClick={() => setConfirming(true)}
                >
                  Revisar y restaurar
                </button>
                <button
                  className="button"
                  disabled={working}
                  onClick={() => {
                    setCandidate(null);
                    setCandidatePhotos(null);
                    setCandidateDocuments(null);
                  }}
                >
                  Descartar archivo
                </button>
              </div>
            )}
            <div className="panel-note">
              <Info size={15} />
              La base actual permanece intacta hasta confirmar y completar el guardado.
            </div>
          </Panel>
          {mode === 'local' && (
            <Panel title="Copias de recuperación" icon={ArchiveRestore}>
              <p className="panel-description">
                La copia previa se conserva{' '}
                {isServerMode() ? 'en la PC del taller' : 'en este navegador'} antes de una
                restauración. No reemplaza un respaldo descargado.
              </p>
              <div className="recovery-buttons">
                <button className="button" onClick={() => downloadRaw(SAFETY_COPY_KEY)}>
                  Descargar copia previa
                </button>
                {storageError && (
                  <button className="button" onClick={() => downloadRaw(DATABASE_KEY)}>
                    Descargar base sin modificar
                  </button>
                )}
              </div>
              <p className="fine-print">
                Las copias previas válidas también se pueden seleccionar para restaurar. Si el
                archivo está dañado, conservá la descarga para una recuperación asistida.
              </p>
            </Panel>
          )}
        </div>
        <aside>
          <Panel title="Estado de los datos" icon={Database}>
            <dl className="technical-list">
              <div>
                <dt>Almacenamiento</dt>
                <dd>{mode === 'demo' ? 'Demostración en memoria' : 'Este navegador'}</dd>
              </div>
              <div>
                <dt>Último guardado</dt>
                <dd>
                  {mode === 'demo'
                    ? 'No aplica'
                    : updatedAt
                      ? new Date(updatedAt).toLocaleString('es-AR')
                      : 'Sin guardados'}
                </dd>
              </div>
              <div>
                <dt>Sincronización</dt>
                <dd>No disponible</dd>
              </div>
              <div>
                <dt>Backup automático</dt>
                <dd>
                  {mode === 'demo'
                    ? 'No aplica en demo'
                    : auto.settings
                      ? auto.settings.enabled
                        ? 'Activado'
                        : 'Pausado'
                      : 'No configurado'}
                </dd>
              </div>
              <div>
                <dt>Última descarga en esta vista</dt>
                <dd>{lastExport || 'Sin exportaciones'}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Cuidá tus respaldos" icon={ShieldCheck}>
            <ul className="check-list">
              <li>
                <CheckCircle2 />
                Descargalos después de cambios importantes
              </li>
              <li>
                <CheckCircle2 />
                Conservá una copia fuera del navegador
              </li>
              <li>
                <CheckCircle2 />
                Validá la recuperación en otro perfil
              </li>
              <li>
                <CheckCircle2 />
                No subas datos de clientes a GitHub
              </li>
            </ul>
            <p className="fine-print">
              No hay cuentas ni permisos de administrador: quien accede a este perfil del navegador
              puede consultar y exportar la información.
            </p>
          </Panel>
        </aside>
      </div>
      {confirming && candidate && (
        <Modal
          title="Confirmar restauración"
          close={() => {
            if (!working) setConfirming(false);
          }}
        >
          <form className="form-stack" onSubmit={restore}>
            <p>
              Se reemplazarán <strong>todos los datos locales de Taller Calamante</strong> por los
              del respaldo de <strong>{candidate.data.workshop.name}</strong>. No se combinan
              registros.
            </p>
            <p>
              Actuales: {customers.length} clientes, {vehicles.length} vehículos y {services.length}{' '}
              mantenimientos, {jobs?.length ?? 0} presupuestos y trabajos, y {products?.length ?? 0}{' '}
              productos.
            </p>
            <p>
              El respaldo contiene {candidate.data.products?.length ?? 0} productos y{' '}
              {candidate.data.stockMovements?.length ?? 0} movimientos de stock. Se reemplaza
              también el catálogo actual y sus movimientos de stock.
            </p>
            <button
              className="button"
              type="button"
              disabled={!!storageError || working}
              onClick={exportZIP}
            >
              Descargar respaldo actual antes de continuar
            </button>
            <label className="check-label">
              <input type="checkbox" required disabled={working} />
              Entiendo que se reemplazará la información actual.
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                disabled={working}
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </button>
              <button className="button primary" type="submit" disabled={working}>
                {working ? 'Restaurando…' : 'Confirmar y restaurar'}
              </button>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
export function SettingsPage() {
  const { workshop, mode, saveWorkshop, notify } = useData();
  const [tab, setTab] = useState('Taller');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { markClean, confirmDiscard } = useUnsavedChanges(dirty);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const ok = await saveWorkshop({
      name: String(data.get('workshop')).trim(),
      phone: String(data.get('phone')).trim(),
      email: String(data.get('email')).trim(),
      address: String(data.get('address')).trim(),
      currency: 'ARS',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    if (ok) {
      setDirty(false);
      markClean();
      setSaved(true);
      notify(
        mode === 'demo'
          ? 'Datos de taller actualizados en la demo.'
          : 'Datos del taller guardados en este navegador.',
      );
    }
  };
  return (
    <>
      <PageTitle title="Ajustes" subtitle="Tu taller, tu equipo y tu forma de trabajar." />
      <div className="settings-layout">
        <div className="panel settings-navigation">
          {[
            { title: 'Taller', icon: Building2 },
            { title: 'Aplicación', icon: Download },
            { title: 'Equipo y permisos', icon: Users },
            { title: 'Estado del proyecto', icon: ShieldCheck },
          ].map(({ title, icon: Icon }) => (
            <button
              key={title}
              className={tab === title ? 'active' : ''}
              onClick={() => {
                if (title === tab) return;
                if (confirmDiscard()) {
                  setDirty(false);
                  setTab(title);
                }
              }}
            >
              <Icon size={18} />
              {title}
            </button>
          ))}
        </div>
        <div>
          {tab === 'Taller' && (
            <Panel title="Información del taller" icon={Building2}>
              <p className="panel-description">
                {mode === 'demo'
                  ? 'Información de ejemplo, separada de tus datos locales.'
                  : 'Estos datos se guardan en tu base local y se incluyen en el respaldo JSON.'}
              </p>
              <form
                className="form-stack"
                onSubmit={save}
                onChange={() => {
                  setSaved(false);
                  setDirty(true);
                }}
              >
                <div className="workshop-logo">
                  <span>
                    <Building2 size={36} />
                  </span>
                  <div>
                    <h3>{workshop.name}</h3>
                    <p>Tu espacio de trabajo en Taller Calamante</p>
                  </div>
                  <span className="subtle-chip">
                    {mode === 'demo' ? 'DEMOSTRACIÓN' : 'MODO LOCAL'}
                  </span>
                </div>
                <div className="form-grid">
                  <label>
                    Nombre del taller <span>*</span>
                    <input name="workshop" required maxLength={100} defaultValue={workshop.name} />
                  </label>
                  <label>
                    Teléfono
                    <input name="phone" type="tel" defaultValue={workshop.phone} maxLength={30} />
                  </label>
                  <label>
                    Correo de contacto
                    <input
                      name="email"
                      type="email"
                      defaultValue={workshop.email}
                      maxLength={150}
                    />
                  </label>
                  <label>
                    Dirección
                    <input name="address" defaultValue={workshop.address} maxLength={200} />
                  </label>
                  <label>
                    Moneda
                    <select defaultValue="ARS">
                      <option value="ARS">Peso argentino · ARS</option>
                    </select>
                  </label>
                  <label>
                    Zona horaria
                    <select defaultValue="America/Argentina/Buenos_Aires">
                      <option value="America/Argentina/Buenos_Aires">
                        Argentina · Buenos Aires
                      </option>
                    </select>
                  </label>
                </div>
                <div className="modal-actions">
                  {saved && (
                    <span className="save-confirmation">
                      <Check size={16} />
                      Guardado{mode === 'demo' ? ' en demo' : ' localmente'}
                    </span>
                  )}
                  <button className="button primary">
                    <Save size={16} />
                    Guardar taller
                  </button>
                </div>
              </form>
            </Panel>
          )}
          {tab === 'Aplicación' && <OfflineSettings />}
          {tab === 'Equipo y permisos' && (
            <Panel title="Equipo y permisos" icon={Users}>
              <div className="info-strip">
                <Info size={18} />
                La versión local no tiene inicio de sesión ni permisos de acceso. Los roles
                siguientes son solo una propuesta para una versión futura con servidor.
              </div>
              <div className="team-member">
                <Avatar name="Administrador" />
                <span>
                  <strong>Administrador</strong>
                  <small>Rol previsto, sin usuario creado</small>
                </span>
                <span className="subtle-chip">Futuro</span>
              </div>
              <div className="team-member">
                <Avatar name="Empleado" />
                <span>
                  <strong>Empleado</strong>
                  <small>Rol previsto, sin usuario creado</small>
                </span>
                <span className="subtle-chip">Futuro</span>
              </div>
              <p className="fine-print">
                {isServerMode()
                  ? 'La PC comparte una base privada con contraseña para el personal autorizado. Las cuentas individuales y los permisos por rol se incorporarán en una etapa posterior.'
                  : 'Cada navegador tiene una base independiente. No existe separación segura entre usuarios que comparten el mismo perfil del navegador.'}
              </p>
            </Panel>
          )}
          {tab === 'Estado del proyecto' && (
            <Panel title="Desarrollo por etapas" icon={ShieldCheck}>
              <div className="project-stages">
                {[
                  [
                    '01',
                    'Interfaz y navegación',
                    'Pantallas de referencia, temas y adaptación móvil.',
                  ],
                  [
                    '02',
                    'Base local',
                    isServerMode()
                      ? 'Clientes, vehículos, mantenimientos y archivos guardados en la PC del taller.'
                      : 'Clientes, vehículos, mantenimientos y taller persistentes en este navegador.',
                  ],
                  [
                    '03',
                    'Recuperación de datos',
                    'Exportación JSON, validación y restauración con copia previa.',
                  ],
                  [
                    '04',
                    'Operación y archivos',
                    'PDF, fotos, documentos PDF e imágenes del vehículo y respaldo ZIP completo disponibles. Vencimientos independientes por servicio e instalación con uso sin conexión disponibles.',
                  ],
                  [
                    '05',
                    'Intercambio entre dispositivos',
                    'Evaluar sincronización y QR público sin exponer información privada.',
                  ],
                  ['06', 'Calidad y publicación', 'Pruebas, distribución y evolución incremental.'],
                ].map(([step, title, description]) => (
                  <div key={step}>
                    <span className={step === '04' ? 'current' : ''}>{step}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="info-strip">
                <Info size={18} />
                No se necesita Supabase. GitHub conserva el código; los datos quedan en el navegador
                de cada usuario.
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
