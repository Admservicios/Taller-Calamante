# Taller Calamante

La aplicación se llama **Taller Calamante** desde la versión 0.2.1. Se conservan las claves internas `motortrack-*` y los formatos de respaldo originales para mantener compatibilidad con los datos existentes.

Gestión de clientes, vehículos y mantenimiento para talleres y lubricentros. Interfaz basada en los bocetos acordados: azul, menú lateral grafito, tarjetas claras y adaptación móvil.

## Versión 0.3: modalidad PC del taller

Se incorpora una modalidad instalable con SQLite, acceso con contraseña y la misma interfaz compartida entre dispositivos de la red privada. La PC guarda los registros y adjuntos y genera copias ZIP completas. El workflow Windows prepara una carpeta portable y un instalador con runtime incluido. Ver [instalación, migración y pruebas](docs/INSTALACION-PC.md). El acceso externo y los QR públicos reales siguen pendientes.

La modalidad de GitHub Pages sigue disponible con su persistencia en el navegador. La migración a la PC es explícita mediante un ZIP completo; publicar código no traslada datos personales.

## Versión 0.2: base local

Los datos se guardan en **el navegador del usuario**, usando `localStorage` para los registros e IndexedDB para las fotos y documentos, como ampliación del modelo local del CRM de Aercom. No requiere Supabase, cuentas externas ni un servidor de base de datos.

**GitHub guarda el código. Los datos de tus clientes no se suben a GitHub.** En la modalidad de GitHub Pages, cada perfil de navegador tiene una base independiente. No existe sincronización entre dispositivos ni inicio de sesión.

Disponible:

- Clientes: crear, editar, buscar y desactivar.
- Vehículos: registrar y editar, filtrar por cliente/marca/estado, ordenar, alternar tarjetas/tabla y exportar la flota a CSV con sus vencimientos vigentes.
- Mantenimientos: registrar y editar trabajos, insumos, importe y vencimientos; filtros, anulación recuperable e historial privado de cambios.
- Resumen del historial y descarga CSV para Excel: todas las páginas del resultado filtrado, importes con centavos y anulados identificados.
- Comprobantes PDF: guardar y descargar al registrar un servicio, o descargar desde el historial del vehículo y el listado de mantenimientos. Incluyen importe con centavos y excluyen notas privadas del cliente y del servicio.
- Dashboard, gráficos y vencimientos calculados sobre los registros locales.
- Agenda filtrada por cliente, tipo y estado; días/km restantes y avisos con varios servicios del mismo vehículo, preparados para copiar y contactar manualmente al cliente.
- Datos del taller persistentes.
- Respaldo JSON versionado, validación de relaciones y restauración confirmada.
- Copia previa antes de restaurar cuando ya existe una base.
- Exportación de clientes a CSV.
- Fotos de mantenimiento persistentes y galería por vehículo.
- Documentos PDF e imágenes por vehículo: cédula, seguro, VTV / RTO, facturas y otros.
- Respaldo ZIP completo con registros, fotografías y documentos verificados.
- Modo claro/oscuro y navegación móvil.

La base comienza **vacía**. El botón **Explorar demo** abre datos ficticios separados, mantenidos en memoria. **Volver a mis datos** recupera la base local. Los QR y el historial público actuales son ejemplos ficticios; nunca publican los datos locales.

## Ejecutar el proyecto

Requisitos: Node.js 24.19.0 (`.nvmrc`) y npm.

```sh
cd /workspace/Organizador-Abonados-Aercom
npm ci --cache /workspace/.cache/npm
npm run dev -- --port 5173 --strictPort
```

En tu computadora, ejecutar desde la carpeta del proyecto; omitir la opción de caché de `/workspace` o indicar otra ruta escribible. No se necesitan variables de entorno ni credenciales para esta versión.

```sh
npm run build
npm test
npm run test:e2e
npm run test:publication
npm run format:check
```

Playwright usa Chromium del sistema si existe. Para indicar otra ruta, usar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Si no hay navegador instalado: `npx playwright install chromium`.

## Guardar y recuperar información

1. Usar el **modo local** para tus registros.
2. En **Backups**, descargar **Respaldo local · JSON** después de cambios importantes.
3. Conservar una copia fuera del navegador, por ejemplo en una unidad externa.
4. Para recuperar o trasladar la información, abrir Taller Calamante en el navegador de destino y seleccionar el JSON en **Restaurar un respaldo**.
5. Revisar los conteos y confirmar el reemplazo. No se combinan bases.
6. Si hay fotos o documentos, usar **Respaldo completo con archivos · ZIP** para recuperarlos en otro navegador. El JSON solo contiene registros y referencias, sin archivos adjuntos.

La restauración rechaza archivos incompatibles, referencias inválidas, identificadores o patentes duplicados. Antes de reemplazar una base existente, conserva una copia local previa; si esa copia o el guardado fallan, no reemplaza los datos originales. Las copias internas válidas también pueden restaurarse desde esa pantalla.

El CSV solo exporta clientes; no sirve para restaurar todo el sistema. Los respaldos de la demo están marcados como ficticios y no se aceptan como respaldos locales.

### Base de práctica importable

En **Backups → Datos de práctica → Descargar datos de práctica** se obtiene un JSON compatible con la restauración local: **12 clientes, 16 vehículos y 48 mantenimientos ficticios**. Incluye alineación y balanceo, frenos, aceite, filtros y neumáticos. Los vencimientos de ejemplo toman como referencia el 22 de octubre de 2026.

Para cargarlo, volver al modo local si se está explorando la demo, seleccionar el archivo en **Restaurar un respaldo**, revisar los conteos y confirmar. **Reemplaza la base actual; no combina registros.** Descargar primero un respaldo propio si ya existen datos. La descarga del ejemplo no modifica la base. El archivo editable está en [src/data/taller-calamante-practica.json](src/data/taller-calamante-practica.json); solo contiene información inventada.

**Borrar los datos del sitio, usar navegación privada o cambiar de navegador/dirección web puede impedir recuperar los registros sin un respaldo.** Trabajar desde una dirección estable y descargar una copia antes de cambiar de servidor o alojamiento. `localStorage` tiene una capacidad limitada y no sustituye un sistema de base de datos con respaldo independiente.

Ver [datos locales y recuperación](docs/DATOS-LOCALES.md).

## Fotos de mantenimiento y respaldo completo

En **Registrar mantenimiento → Fotos del mantenimiento** se pueden seleccionar hasta **6 imágenes JPG, PNG o WebP de 10 MB cada una**. Se convierten a JPEG optimizado, con un máximo de 1.600 píxeles de lado y 350 KB por foto; se guarda la versión optimizada, sin conservar el original. El mantenimiento se confirma solamente después de guardar sus fotos y sus registros. Si falla una escritura, la base anterior permanece intacta y las imágenes seleccionadas siguen en el formulario para reintentar.

La ficha del vehículo tiene una pestaña **Fotos**, con vista ampliada, fecha, servicio y descarga individual. En la demo solo duran durante la sesión y no se escriben en la base local. Las fotos locales no se publican en el QR ni se agregan al PDF.

En **Backups → Descargar ZIP completo** se descargan `backup.json` y las imágenes. El ZIP valida relaciones, cantidades, tamaños, dimensiones y huellas SHA-256; admite hasta 100 MB en total y 1.000 fotos, con hasta 6 por mantenimiento. También se conservan los respaldos JSON anteriores y el ZIP de práctica con un único JSON. La importación se revisa y confirma antes de reemplazar la base. Las fotos importadas se guardan en una colección nueva: si falla el proceso se conserva la base anterior con sus archivos. La copia local previa mantiene acceso a sus fotos mientras existan en ese mismo navegador.

**El JSON no incluye imágenes.** Para mover una base con fotos a otro navegador hay que usar el ZIP completo. Se pueden activar copias automáticas en una carpeta local desde Backups, en navegadores de escritorio compatibles. También se puede descargar el ZIP manualmente y conservarlo fuera del navegador. Las colecciones anteriores no se borran automáticamente; las cuotas dependen del navegador y un fallo de espacio no reemplaza la información actual.

## Comprobantes de mantenimiento

En el formulario, **Guardar y generar PDF** primero conserva el servicio y luego descarga el comprobante. En **Mantenimientos** y en el historial de cada vehículo, el botón **PDF** permite descargarlo nuevamente sin duplicar registros. Si falla el guardado no se genera el comprobante; si falla la generación, el servicio guardado sigue disponible para reintentar desde el historial.

El PDF se genera en el navegador, sin subir datos ni abrir servicios externos. Incluye taller, cliente, vehículo, fecha y kilometraje del servicio, tareas, insumos e importe en ARS. Las notas privadas se omiten; los ejemplos de la demo se identifican como ficticios. Los nuevos servicios conservan una copia de **su propio vencimiento al realizarlos**, que se utiliza al volver a descargar el PDF. Para registros anteriores se consulta únicamente el vencimiento vigente del mismo tipo de servicio; si no existe, el comprobante lo indica. Los PDFs descargados no se guardan como adjuntos en la base ni en el respaldo JSON.

## Distribución web y GitHub

El código se prepara para un alojamiento estático: `npm run build` genera `dist`. La compilación usa rutas con `#` y recursos relativos para funcionar también dentro de una carpeta de GitHub Pages. Por ejemplo, la sección Clientes se abre con `#/clientes`.

**El HTML editable está en `app.html`.** `index.html` y `site-assets/` son salidas compiladas versionadas para que también funcione Pages cuando está configurado para servir la raíz de `main`. No editar esos archivos generados a mano.

Antes de subir cambios de interfaz, ejecutar `npm run publish:static`: compila la aplicación, prepara `dist` y actualiza la copia estática de la raíz. Después ejecutar `npm run test:publication`, que abre ambas variantes en un navegador con un servidor estático sin Vite y comprueba rutas, recursos y persistencia. El comando se puede repetir; conserva recursos con hash anteriores para no romper pestañas que tienen HTML en caché.

Para comprobar la compilación: `npm run preview -- --port 5173 --strictPort`. El desarrollo usa rutas normales; la distribución usa rutas con `#` para evitar errores al recargar en servidores estáticos.

El workflow **Verificar y publicar Taller Calamante** ejecuta compilación, pruebas y formato en GitHub Actions. También genera el artefacto descargable `taller-calamante-web`. Después de una verificación exitosa en `main`, consulta el origen configurado de GitHub Pages: si es GitHub Actions, publica **solo `dist`** mediante las acciones oficiales; si es una rama, conserva el despliegue nativo de la compilación incluida en `main`. Las solicitudes de cambios ejecutan verificaciones sin publicar.

La dirección del sitio es `https://admservicios.github.io/Taller-Calamante/`. Se recomienda **GitHub Actions** como origen de publicación. La raíz de `main` también contiene ahora una compilación lista para servir, con `.nojekyll`, de modo que una publicación desde la rama no vuelva a sustituir el sitio por código TypeScript sin compilar. El workflow respeta el origen de publicación existente y no intenta cambiar la configuración del repositorio. Para unificar los despliegues, el propietario puede elegir **Settings → Pages → Build and deployment → Source → GitHub Actions**.

El despliegue mantiene el origen web y conserva el almacenamiento local de los usuarios. No borra datos del navegador ni sube respaldos al repositorio. Los errores y estados del despliegue se consultan en la pestaña Actions.

El repositorio ahora se llama **Admservicios/Taller-Calamante**. La dirección actual conserva las mayúsculas del repositorio: `https://admservicios.github.io/Taller-Calamante/`. El checkout local puede conservar su carpeta original; su remoto debe apuntar a `https://github.com/Admservicios/Taller-Calamante.git`. El cambio de camino mantiene el mismo origen del navegador y, por lo tanto, las claves de almacenamiento locales existentes.

## Límites actuales

- Sin autenticación, roles efectivos ni aislamiento entre personas que usan el mismo perfil del navegador. El panel de roles es una propuesta visual futura.
- Sin sincronización ni historial público de datos reales. El QR de demostración no es un mecanismo de acceso seguro o revocable.
- Fotografías: se conserva la versión optimizada; los originales deben guardarse por separado.
- Documentos: PDF, JPG, PNG y WebP de hasta 5 MB, 20 por vehículo y 200 en total. Imágenes de hasta 20 megapíxeles y 12.000 píxeles por lado. Otros formatos quedan pendientes. Las copias automáticas en carpeta requieren Chrome o Edge de escritorio compatible y la aplicación abierta.
- Vencimientos por tipo de servicio, con fecha, kilometraje y último trabajo independientes. No se reconstruyen intervalos que el sistema anterior ya había sobrescrito.
- Aplicación instalable y uso sin conexión disponibles después de la primera preparación con internet. La instalación depende del navegador; no sincroniza bases entre dispositivos.
- Para editar, usar una pestaña a la vez. Se detectan revisiones desactualizadas al escribir y se reciben avisos de cambios de otras pestañas; no hay edición colaborativa.

Las ilustraciones de vehículos son provisionales y no descargan imágenes externas. Los ejemplos usan información ficticia.

## Estructura

```text
src/app/                Navegación y estado local/demo
src/components/         Componentes visuales compartidos
src/features/           Pantallas por módulo
src/lib/localDatabase.ts Esquemas, persistencia y respaldos versionados
src/lib/demo.ts          Ejemplos y utilidades de presentación
src/styles.css          Diseño y adaptación móvil
tests/unit/             Reglas de negocio y recuperación
tests/e2e/              Recorridos de navegador y persistencia
.github/workflows/      Verificaciones en GitHub
app.html                Entrada HTML editable de Vite
index.html              HTML compilado para Pages desde main
site-assets/            Recursos compilados con hash
scripts/                Preparación y prueba de publicación estática
docs/                   Plan y decisiones de arquitectura
```

Ver [plan actualizado](docs/PLAN.md). No se deben agregar respaldos, bases de datos reales ni secretos al repositorio.

## Vencimientos independientes por servicio

Registrar frenos, alineación, neumáticos u otro trabajo actualiza el odómetro del vehículo y únicamente el vencimiento de ese servicio. **No reinicia el último cambio de aceite ni su fecha o kilometraje objetivo.** El nuevo odómetro sí se usa para evaluar todos los vencimientos: el aceite puede quedar vencido aunque frenos esté al día.

**Service general** y **Cambio de aceite** comparten el seguimiento de aceite y filtros del service. **Filtros** por separado y **Filtro de habitáculo** tienen seguimientos propios. Frenos, alineación/balanceo, neumáticos y revisión general son independientes; en **Otro mantenimiento → Nombre del servicio** se pueden crear seguimientos propios, como refrigerante o correa de distribución.

En **Vehículo → Recordatorios** se muestran los vencimientos, el último servicio de cada tipo, los kilómetros recorridos desde ese trabajo y los kilómetros restantes. **Editar** permite corregir un vencimiento, incluso si ya pasó, y **Agregar vencimiento** añade uno sin duplicar mantenimientos ni modificar el historial. Para registrar un trabajo realizado se usa **Registrar** en el seguimiento correspondiente.

Las bases y respaldos anteriores siguen siendo compatibles. Su único vencimiento se conserva y se identifica como anterior; no se inventan los que ya se habían perdido. Si otro mantenimiento había reiniciado un vencimiento antes de esta corrección, revisarlo y corregirlo con **Editar**. Las fechas y kilómetros del historial original permanecen intactos.

## Documentación del vehículo

En **Vehículos → ficha → Documentación** se puede seleccionar el tipo (Cédula, Seguro, VTV / RTO, Factura u Otro), elegir un PDF, JPG / JPEG, PNG o WebP y pulsar **Guardar documento**. Se conserva el archivo original: hasta 5 MB por archivo, 20 documentos por vehículo y 200 en toda la base. Las imágenes tienen un límite de 20 megapíxeles y 12.000 píxeles por lado. Cada documento muestra nombre, formato, categoría, fecha de carga y tamaño; se puede editar, descargar o quitar de la ficha con confirmación. **Ver imagen** abre una vista previa local; la descarga conserva sus bytes originales, sin comprimir ni convertir. Al renombrar un adjunto se debe conservar su formato.

Son archivos locales privados del taller: no se incluyen en el historial público de demostración. La demo guarda sus documentos solo en memoria y los pierde al recargar. No se evalúa la vigencia de los documentos ni se genera una alerta de vencimiento de seguro o VTV.

El **ZIP completo**, incluidas las copias automáticas, incluye `documents/<id>.pdf`, `.jpg`, `.png` o `.webp` junto con las fotos y los registros. Al restaurarlo se verifican tamaños, formato básico e integridad antes de confirmar la base. Los JSON contienen referencias, **no los archivos adjuntos**; para trasladar archivos a otro navegador hay que usar el ZIP. Las copias anteriores siguen siendo compatibles. Quitar un documento retira su referencia de la ficha, sin borrar archivos que todavía podría necesitar una copia previa; no es una eliminación física garantizada del dispositivo.

## Instalar y trabajar sin conexión

1. Abrir la dirección habitual de Taller Calamante con internet.
2. Entrar en **Ajustes → Aplicación** y esperar **Lista para usar sin conexión**.
3. En Chrome o Edge, usar **Instalar Taller Calamante** cuando aparezca o la opción de instalar del navegador. En iPhone/iPad: Safari → Compartir → Agregar a inicio. También se puede seguir usando desde el navegador.
4. Después de la preparación se puede cerrar y volver a abrir la aplicación sin internet. Siguen funcionando los registros, PDF, fotos, documentos y respaldos ZIP en ese dispositivo.

Usar el navegador y perfil donde está la base. Si una instalación o un navegador distinto abre una base vacía, restaurar allí el ZIP completo: la instalación no traslada ni sincroniza datos automáticamente. El respaldo independiente sigue siendo necesario.

Las nuevas versiones muestran un aviso para **Actualizar aplicación**; se recarga solo al confirmar. Guardar los formularios de todas las pestañas antes de aplicar la actualización. Si una descarga falla, la versión preparada sigue disponible. La primera apertura, una nueva preparación si el navegador retiró su caché y las actualizaciones necesitan internet. No hay datos en un servidor ni historial QR real publicado por instalar la aplicación.

Ver [instalación y funcionamiento sin conexión](docs/USO-SIN-CONEXION.md). `npm run test:offline` comprueba ambas variantes estáticas con un navegador y red desactivada, además de actualizaciones con varias pestañas y descargas fallidas.

## Respaldos automáticos en una carpeta local

En **Backups → Respaldo automático en carpeta → Elegir carpeta de respaldo** se puede autorizar una carpeta del equipo. Se crea la primera copia completa al elegirla. Los intervalos disponibles son **Diario** (inicial), **Cada hora** y **Cada 15 minutos**. Se comprueban cambios al abrir, al volver a la aplicación, después de guardar y una vez por minuto mientras está abierta. Se crea una copia solo si hay cambios y se cumplió el intervalo; **Crear copia ahora** permite forzarla.

Se guardan ZIP completos con registros, fotos y documentos, con nombre nuevo por copia y fecha de Argentina. Se verifica la escritura leyendo nuevamente el archivo. No se reemplazan ni se borran copias anteriores. **Pausar copias** detiene las escrituras; **Desvincular carpeta** retira la configuración sin borrar archivos. Los ZIP se recuperan con **Restaurar un respaldo**.

Requiere HTTPS y un navegador de escritorio con selector de carpeta y bloqueo entre pestañas, como Chrome o Edge compatibles. Si el navegador vuelve a pedir acceso, se usa **Autorizar carpeta**; no se abren permisos automáticamente. En navegadores sin esta capacidad sigue disponible la descarga manual. La demostración no genera estas copias. Funciona sin internet después de preparar la aplicación, pero **no se ejecuta con la aplicación cerrada o suspendida**: al volver se revisa lo pendiente.

La carpeta elegida está fuera del almacenamiento del navegador, pero no protege por sí sola de perder el mismo disco o dispositivo. Elegir una ubicación independiente si se necesita esa protección. Se conservan todas las copias: revisar el espacio de esa carpeta. Un fallo pausa los intentos automáticos de esa sesión hasta reintentar; no reemplaza la base ni las copias ya verificadas. Los permisos y la configuración de carpeta pertenecen a cada navegador y no se incluyen en los respaldos.

## Corregir datos cargados

La carga de mantenimientos tiene una barra de guardado que permanece visible al desplazarse, con **Guardar** y **Guardar + PDF**. Conserva una sola acción de cada tipo y los mismos datos del formulario. Los avisos de validación del sistema se muestran junto a la barra; el navegador enfoca los campos obligatorios y mantiene espacio para verlos debajo de ella. En celular se usan campos de 16 px y controles de al menos 44 px en las acciones principales.

Las tablas, fichas y ayudas tienen tamaños de lectura mayores y estados con más contraste. En pantallas pequeñas, seleccionar un cliente desplaza la vista a su ficha y lleva allí el foco; cerrarla devuelve al cliente del listado o al buscador.

Los formularios de mantenimiento, ajustes y los diálogos de edición advierten antes de descartar cambios al navegar, usar Atrás, cancelar o cerrar. Rechazar la salida conserva lo escrito. Guardar correctamente libera esa protección. Un documento seleccionado también se protege al cambiar de pestaña o ficha; no se guarda automáticamente. El aviso al cerrar o recargar la página depende del navegador.

En **Mantenimientos → Historial del taller → Editar**, en el historial del vehículo y en el del cliente se puede corregir una visita completa: vehículo, fecha, kilómetros, tipo, trabajos, insumos, importe, notas, vencimiento y fotos. Se conserva el ID del registro. Los historiales, estadísticas, próximos servicios y nuevos PDF usan los datos corregidos; los comprobantes y respaldos ya descargados no cambian.

Al corregir fecha o kilómetros se conserva el intervalo de esa visita y se muestran los nuevos objetivos, que también pueden ajustarse. Solo el último servicio de una categoría gobierna su vencimiento vigente; los ajustes manuales de Recordatorios se conservan. Si se cambia de vehículo o categoría, se recalculan ambas fichas a partir del historial restante. Sin otro vencimiento registrado, la categoría queda sin programación: revisarla en **Recordatorios**. Las visitas antiguas sin vencimiento propio no reciben uno inventado.

El odómetro se calcula con los servicios restantes y las lecturas independientes de la ficha o de los recordatorios manuales. Se pueden corregir kilómetros hacia abajo, pero no por debajo de registros que todavía afirmen una lectura mayor: el mensaje indica qué dato revisar primero. Las fechas y kilómetros corregidos no pueden contradecir visitas de fechas anteriores o posteriores.

**Editar cliente** actualiza los datos donde aparece ese cliente. **Editar vehículo** permite corregir también propietario y color. El historial de clientes corresponde al propietario actual del vehículo; no se conservan propietarios por visita. En **Recordatorios → Editar** se puede corregir también la categoría, sin duplicar una que ya exista. En **Documentación → Editar** se corrigen nombre, categoría y vehículo asociado conservando el archivo original. Para cambiar su contenido se carga el archivo correcto y se quita el anterior.

Las fotos desmarcadas se quitan de la referencia actual; sus archivos anteriores se conservan para recuperar copias previas. Si falla el guardado, no se reemplaza la base anterior. Un mantenimiento o documento modificado en otra pestaña obliga a reabrir su edición para evitar sobrescribir esa corrección.
