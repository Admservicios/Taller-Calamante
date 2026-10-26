# Plan de Taller Calamante

## Decisión vigente

La prioridad vigente es desarrollar y probar la aplicación web desde GitHub Pages, sin instalar nada en la PC de trabajo. Primero se consolidan los circuitos existentes, la adaptación móvil y las verificaciones automáticas; después se retoman las mejoras visuales y funcionales.

La modalidad PC con SQLite y el empaquetado Windows ya están preparados y se conservan para la instalación futura en la PC del taller. Compartirán las mejoras de la interfaz. No se migra ninguna base ni se instala nada en esta etapa. El acceso externo seguro y el historial público real por QR siguen pendientes.

GitHub Pages guarda los registros en cada navegador. La migración futura a la PC se realizará explícitamente mediante un ZIP completo, sin borrar la base original. Ver [instalación en PC](INSTALACION-PC.md).

## Entregas

| Paso                  | Alcance                                                                               | Validación                                                         |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Base visual           | Dashboard, Clientes, Vehículos, Mantenimientos, Próximos servicios, Backups y Ajustes | Recorridos de escritorio y celular                                 |
| Base local            | Persistencia versionada de clientes, vehículos, mantenimientos y datos del taller     | Guardar, recargar y recuperar los mismos registros                 |
| Recuperación local    | Exportación JSON, estructura validada, confirmación y copia previa                    | Exportar, modificar y restaurar el estado anterior                 |
| Operación ampliada    | Fotografías permanentes, documentos, PDF y varias recomendaciones por vehículo        | Pruebas sobre cada capacidad implementada                          |
| Distribución          | Publicación estática, instalación y uso sin conexión                                  | Comprobación de rutas, recursos, trabajo sin red y actualizaciones |
| Funciones compartidas | Evaluar sincronización, usuarios e historial público real                             | Arquitectura y autorización específicas antes de implementarlas    |

## Estado inicial de la base

La base visual, la persistencia local y la recuperación JSON están implementadas. La operación ampliada avanza con **comprobantes PDF de mantenimiento**: descarga al registrar y desde los historiales, generación local, notas privadas excluidas y textos largos distribuidos entre páginas. También están implementadas las fotografías persistentes por mantenimiento, la galería del vehículo y el respaldo ZIP completo con verificación de archivos. También están implementados los vencimientos independientes por tipo de servicio y su edición en Recordatorios. Está implementada la documentación PDF e imágenes JPG / PNG / WebP por vehículo, con vista previa de imágenes, edición, descarga original, retiro confirmado y respaldo ZIP completo. También están implementados la instalación como aplicación y el uso sin conexión tras la primera preparación. La edición completa de mantenimientos actualiza las fichas, historiales y vencimientos relacionados y conserva los archivos. También están disponibles los ZIP automáticos en una carpeta autorizada del equipo, con intervalo y verificación de escritura, mientras la aplicación permanece abierta. Quedan pendientes otros formatos y las funciones compartidas.

- Formato `motortrack-local`, versión 1.
- Una unidad de `localStorage` contiene clientes, vehículos, mantenimientos, taller y referencias de fotos y documentos. IndexedDB conserva las imágenes optimizadas y los documentos originales, en colecciones locales identificadas.
- Validación de identificadores, relaciones, patentes y kilometraje antes de guardar o restaurar.
- Revisión para detectar escrituras basadas en un estado anterior.
- Modo local vacío y demostración separada.
- La modalidad navegador sigue sin requerir servicios contratados. La modalidad PC utiliza SQLite, contraseña privada, sesiones, guardados con revisión y copias completas.

## Reglas funcionales

- Cliente activo/inactivo es independiente del mantenimiento al día/próximo/vencido.
- Vence al alcanzar fecha o kilometraje, lo que ocurra primero. Se avisa hasta 30 días o 1.000 km antes.
- En modo local se usa la fecha actual de Argentina; la demo conserva 21 de octubre de 2026 como referencia.
- El kilometraje representa el último dato registrado; no una medición en vivo.
- Cada vehículo tiene vencimientos independientes por tipo. Registrar un servicio modifica solo su seguimiento y conserva los demás; actualizar el odómetro puede volver vencido otro servicio sin reiniciarlo. Los registros anteriores conservan su único vencimiento almacenado hasta que el usuario lo revise o lo renueve.
- Los comprobantes de nuevos servicios conservan su vencimiento histórico. En registros anteriores se usa únicamente el vencimiento vigente del mismo tipo, identificado como tal; no se reconstruyen intervalos históricos perdidos.
- Los importes actuales se expresan en pesos. Antes de integrar contabilidad o facturación se revisará su representación monetaria.
- No se publican datos locales mediante las rutas de demostración del QR.

## Recuperación pendiente de ampliación

La exportación/restauración JSON abarca registros y datos del taller. El ZIP completo incluye fotos optimizadas y documentos originales PDF / JPG / PNG / WebP, con integridad y límites de tamaño verificados. Las copias automáticas en carpeta están disponibles como opción local en navegadores compatibles; no se ejecutan con la aplicación cerrada. Siguen pendientes otros formatos de adjuntos. Los JSON anteriores siguen siendo compatibles y no contienen archivos adjuntos.

La copia anterior a una restauración permanece en el mismo navegador y puede perderse junto con él. Por eso se requiere una descarga conservada fuera del navegador. Las copias automáticas requieren una carpeta autorizada y la aplicación abierta. Una carpeta en el mismo disco no protege contra la pérdida del dispositivo.

## Autorización

El usuario autorizó implementar la base local y subir la estructura a GitHub para mejorarla progresivamente. Después informó una pantalla en blanco en su sitio de GitHub Pages. Se publican `dist` desde Actions y una copia compilada en la raíz de `main`, manteniendo el mismo origen web. Ambas variantes se prueban en un navegador con un servidor estático sin Vite; antes de subir código se ejecuta `npm run publish:static`. Esto cubre la configuración existente de Pages desde la rama, incluso cuando el token de Actions no puede cambiar su origen. El usuario autorizó la preparación de la modalidad PC, SQLite, acceso privado desde celulares y empaquetado Windows. El despliegue de un acceso por internet y los enlaces públicos reales se harán en una etapa posterior. No se modificarán otros proyectos ni se subirán registros reales al repositorio.

## Modalidad PC incorporada

- Servidor privado con SQLite y archivos incluidos en transacciones, sesiones y habilitación de la red desde la PC.
- Misma interfaz, con confirmación del guardado en el servidor, controles de conflictos y sin sustitución por una base vacía si no hay conexión.
- Importación de ZIP existentes, descarga de copias completas y copia previa. Copias automáticas verificadas en la carpeta de datos.
- Compilación independiente del servidor, carpeta portable y workflow de instalador Windows con runtime incluido. Datos fuera de la carpeta del programa.
- Pendiente: instalación interactiva y verificación del firewall en la PC real; acceso externo HTTPS, QR reales para clientes y cuentas individuales con roles.

## Paso 3: historial y correcciones recuperables

- Historial con búsqueda por patente, vehículo, cliente, trabajo e insumos; filtros combinables por cliente actual del vehículo, categoría de servicio, fechas inclusivas y estado. La categoría agrupa sus nombres equivalentes (por ejemplo, service general y cambio de aceite). Paginación de 10, 25 o 50 registros, orden por fecha descendente y filtros conservados en la dirección al volver de Editar.
- Anulación con motivo obligatorio, sin borrar el servicio ni sus fotos. Vista de anulados y recuperación con motivo. Los anulados no cuentan en estadísticas, actividad reciente, historiales activos, fotos de la ficha ni lecturas mínimas de los formularios. Sus fotos se pueden consultar desde Detalle y cambios y siguen incluidas en todos los respaldos completos.
- Se recalculan los kilómetros derivados de visitas activas y el vencimiento del tipo afectado. Se recupera el vencimiento histórico anterior únicamente si fue guardado. Lecturas independientes y vencimientos ajustados manualmente conservan prioridad. En bases antiguas sin una relación comprobable entre visita y vencimiento, se conserva la información disponible para revisión manual; no se inventa un vencimiento perdido ni una lectura inicial de cero.
- La recuperación verifica las lecturas cronológicas y rechaza contradicciones con otras visitas activas. Los estados obsoletos, conflictos entre pestañas o dispositivos y fallos de almacenamiento no sustituyen la base anterior.
- Detalle privado de trabajos, insumos, observaciones, fotos y cambios del mantenimiento. Desde esta actualización se registran altas, ediciones (valores antes/después y cambios de fotos), anulaciones y recuperaciones, con fecha/hora de Argentina. No se reconstruyen cambios anteriores ni se atribuyen a usuarios inexistentes en la modalidad navegador.
- Los metadatos opcionales conservan la versión 1 y las claves existentes. Se validan al guardar/restaurar y se incluyen en JSON, ZIP y SQLite. No se borra automáticamente el historial (límite validado de 1.000 eventos por mantenimiento, además de los límites existentes del respaldo).
- Un servicio anulado debe recuperarse antes de editar o emitir un nuevo PDF. Los PDF ya descargados no se modifican. Las notas y el historial privado de cambios no se incluyen en los comprobantes.
- Se mantiene el desarrollo web en GitHub; la instalación Windows y el acceso público por internet siguen en la etapa posterior.

## Paso 4: resumen y exportación del historial

- Resumen en Mantenimientos con cantidad de servicios activos, importe registrado, importe promedio por servicio activo y cantidad de anulados. Usa todos los resultados de los filtros, sin limitarse a la página visible. Los anulados no forman parte de los importes; los servicios gratuitos sí cuentan en el promedio. Los importes registrados no representan cobros, ganancias ni facturación fiscal.
- Importes del historial, su detalle y el resumen con dos decimales. El resumen suma centavos por visita para evitar errores binarios acumulados; importes antiguos con más de dos decimales se redondean para el informe, sin modificar la base.
- CSV para Excel con todos los resultados filtrados, en el mismo orden: vehículo, cliente actual, servicio, trabajos, insumos, kilómetros, importe ARS, estado y vencimiento guardado en esa visita. Se exporta el vencimiento histórico disponible; no se sustituye por el vigente ni se reconstruye uno ausente.
- CSV con UTF-8/BOM, separador punto y coma, coma decimal y textos entre comillas. Conserva comillas, acentos y saltos de línea, y trata como texto las entradas que una planilla pudiera interpretar como fórmulas. Excluye notas privadas, motivos de anulación y auditoría. Los anulados se incluyen si el filtro elegido los contiene, con su estado explícito.
- La demostración se identifica en el nombre del archivo y en cada fila. Con resultados vacíos o fechas invertidas la descarga queda deshabilitada. Descargar un informe no modifica registros ni reemplaza un respaldo JSON/ZIP.
- Se conserva la base existente y la preparación futura del instalador; esta entrega continúa en la versión web.

## Paso 5: agenda y avisos preparados para clientes

- Próximos servicios con filtros combinables por búsqueda, cliente, categoría y estado, guardados en la dirección. Los contadores por estado respetan búsqueda, cliente y categoría; el resultado cuenta servicios y vehículos por separado. Paginación de 20 o 50 servicios, orden de urgencia existente y filtros conservados al volver de Registrar.
- Cada vencimiento muestra días hasta su fecha (o días vencidos) y kilómetros restantes (o superados), calculados con la fecha de Argentina y la última lectura registrada. Se mantiene la regla de fecha o kilómetros, lo que ocurra primero. No se estima una lectura en vivo.
- Preparar aviso abre un texto del servicio elegido y permite incluir otros vencimientos del mismo vehículo, cada uno con sus propios objetivos. Muestra cliente, teléfono disponible y enlace a su ficha. Usa los datos actuales si otra pestaña los modifica; no altera los vencimientos ni registra contactos realizados.
- El texto incluye taller, vehículo, trabajo recomendado, fecha/km objetivo, estado según los registros y aclaración para confirmar los kilómetros actuales. Excluye documentos, domicilio, notas y auditoría privada. La demo se identifica en el propio texto.
- Copiar aviso usa el portapapeles del navegador. Si no está disponible se intenta la selección/copia local; si se rechaza, el texto queda seleccionado para copia manual. El aviso es de lectura y se puede modificar después de pegarlo. No se envían mensajes, abren servicios externos ni marcan avisos como enviados automáticamente.
- Preparar y copiar no escribe en la base, no requiere migración ni modifica los respaldos. La interfaz también queda disponible para la futura modalidad PC. El envío automático y el registro de contactos quedan para una etapa específica posterior.

## Paso 6: catálogo de vehículos y exportación de flota

- Filtros combinables por búsqueda, cliente, marca y estado general, con normalización de acentos y búsqueda de patente sin espacios ni guiones. Marcas equivalentes por mayúsculas/acentos se agrupan. Orden por patente, urgencia o mayor kilometraje.
- Tarjetas y tabla representan el mismo resultado, con paginación de 12, 24 o 48 vehículos. La dirección conserva filtros, vista, orden y página al volver de la ficha. Limpiar filtros conserva vista, orden y tamaño de página. Al cambiar página se vuelve al comienzo del listado.
- Las tarjetas agregan el servicio prioritario y sus objetivos. La tabla muestra cliente actual, kilómetros registrados, estado general, cantidad de vencimientos, servicio prioritario y enlaces a la ficha o al registro del mantenimiento correspondiente.
- El estado general y el servicio prioritario usan las reglas existentes de urgencia; no reinician ni sustituyen los demás vencimientos. Un vehículo con colección de planes vacía muestra Sin datos y objetivos vacíos, sin reutilizar un resumen antiguo.
- CSV de todos los vehículos filtrados, en el orden elegido y sin limitarse a la página visible. Una fila por vehículo: datos técnicos, cliente actual, lectura registrada, estado general, cantidad de servicios por estado, objetivos del servicio prioritario y detalle completo de todos los vencimientos vigentes en una celda multilínea. Incluye fecha de referencia y marca la demo en archivo y filas. No incluye teléfono, documentos ni notas privadas del cliente.
- La exportación comparte el formato CSV validado del historial: UTF-8/BOM, punto y coma, comillas escapadas y neutralización de fórmulas. Descarga deshabilitada cuando no hay coincidencias. El CSV es un informe; el JSON/ZIP continúa siendo el respaldo restaurable.
- No se modifica el formato de la base ni se requiere migración. La preparación futura de la aplicación PC se mantiene con la misma interfaz.

## Buscador en los filtros de clientes

- Los filtros de cliente de Vehículos, Mantenimientos y Próximos servicios incorporan un desplegable con búsqueda por nombre, DNI/CUIT o teléfono. Se ignoran mayúsculas y acentos, y los números pueden escribirse sin puntos, espacios o guiones.
- Escribir busca dentro de los clientes disponibles; el filtro del listado cambia únicamente al seleccionar una opción. Todos los clientes permite quitar la selección. El valor seleccionado sigue en la dirección, con los demás filtros y el tamaño de página existentes.
- Navegación con flechas y Enter, cierre con Escape, Tab o clic afuera y retorno de foco al selector. Búsquedas sin coincidencias no cambian el filtro. La lista muestra hasta 80 clientes y permite acotar por texto; la selección actual sigue visible al abrir una lista extensa.
- El desplegable se adapta al espacio disponible, evita recortes dentro de las tarjetas y ofrece detalles de DNI/CUIT y teléfono para distinguir nombres similares. Compatible con móvil y modo oscuro. No modifica registros ni el formato de la base.

## Historial completo del vehículo en PDF

- En la ficha del vehículo, la pestaña Historial incorpora Historial PDF, con rango de fechas inclusivo y opciones para incluir importes y vencimientos vigentes. Se incluyen únicamente mantenimientos activos del vehículo elegido; los anulados y las notas privadas quedan fuera. No se incorporan fotos ni documentos adjuntos.
- El informe identifica taller, vehículo, cliente actual, última lectura registrada, fecha de referencia y período. Cada visita conserva trabajos, insumos y su vencimiento histórico si estaba guardado. Una sección separada presenta los vencimientos actualmente vigentes por tipo de servicio; no se sustituyen los objetivos antiguos por los actuales.
- Los importes son opcionales y se calculan con centavos por visita. Se identifican como valores registrados, sin acreditar cobros ni reemplazar comprobantes. El informe no reconstruye datos históricos ausentes ni atribuye el cliente actual a cada visita pasada.
- Textos extensos e historiales largos se distribuyen entre páginas, con continuación y numeración. La demo se identifica en el archivo, el encabezado y cada página. Fechas inválidas, rangos invertidos o períodos sin servicios activos impiden descargar.
- La generación y descarga se realizan en el navegador, también sin conexión después de preparar la app. Un fallo conserva opciones y registros para reintentar. Cerrar el diálogo mientras se carga el generador evita una descarga tardía. Los controles de exportación no se tratan como modificaciones de la base; la protección de cambios sin guardar sigue activa en los editores.
- No hay migraciones ni cambios de formato de datos. El informe PDF no sustituye el respaldo restaurable JSON/ZIP ni publica información en el QR de demostración.
