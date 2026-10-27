import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { zipSync, strToU8 } from 'fflate';
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { parseBackup } = await vite.ssrLoadModule('/src/lib/localDatabase.ts');
  const { productServiceItem } = await vite.ssrLoadModule('/src/lib/products.ts');
  const { saveSupplyItems, totalItemCents } = await vite.ssrLoadModule('/src/lib/supplyItems.ts');
  const { stockBalance } = await vite.ssrLoadModule('/src/lib/inventory.ts');
  const { maintenanceKind, servicePlan, withPlanSummary } = await vite.ssrLoadModule(
    '/src/lib/maintenancePlans.ts',
  );
  const backup = JSON.parse(
    await readFile(new URL('../src/data/taller-calamante-practica.json', import.meta.url), 'utf8'),
  );
  const data = backup.data;
  backup.exportedAt = '2026-10-27T12:00:00.000Z';
  data.workshop = {
    ...data.workshop,
    name: 'Taller Calamante · PRÁCTICA FICTICIA',
    email: 'practica-stock@example.com',
  };
  const specs = [
    ['ACE-001', 'Helix HX8 5W-30', 'Shell', 'Litro', 10000],
    ['ACE-002', '8100 X-clean 5W-40', 'Motul', 'Litro', 14500],
    ['ACE-003', 'Elaion 10W-40', 'YPF', 'Litro', 8500],
    ['ACE-004', 'Magnatec 0W-20', 'Castrol', 'Litro', 13000],
    ['FIL-001', 'Filtro de aceite W712/95', 'MANN', 'Unidad', 12000],
    ['FIL-002', 'Filtro de aceite PH3614', 'Fram', 'Unidad', 10500],
    ['FIL-003', 'Filtro de aire C2287', 'MANN', 'Unidad', 16500],
    ['FIL-004', 'Filtro de combustible WK69', 'MANN', 'Unidad', 21000],
    ['HAB-001', 'Filtro de habitáculo CUK2939', 'MANN', 'Unidad', 18500],
    ['HAB-002', 'Filtro de habitáculo con carbón', 'Bosch', 'Unidad', 22500],
    ['FRE-001', 'Juego de pastillas delanteras', 'Bosch', 'Juego', 45000],
    ['FRE-002', 'Disco de freno delantero', 'Brembo', 'Unidad', 68000],
    ['FRE-003', 'Líquido de frenos DOT4', 'Bosch', 'Litro', 16500],
    ['NEU-001', 'Neumático 185/65 R15', 'Fate', 'Unidad', 115000],
    ['NEU-002', 'Neumático 215/65 R16', 'Pirelli', 'Unidad', 180000],
    ['ALI-001', 'Contrapesos de balanceo', 'Genérico', 'Kilogramo', 18000],
    ['ALI-002', 'Válvula para neumático', 'Genérico', 'Unidad', 1500],
    ['REF-001', 'Refrigerante concentrado', 'Total', 'Litro', 12500],
    ['COR-001', 'Correa de accesorios', 'Gates', 'Unidad', 38000],
    ['BUJ-001', 'Bujía convencional', 'NGK', 'Unidad', 9500],
    ['ARR-001', 'Arandela de tapón de cárter', 'Genérico', 'Unidad', 850.5],
    ['LIM-001', 'Limpiador de contactos', 'Würth', 'Unidad', 8200],
    ['REP-099', 'Tensor de correa · ejemplo sin stock', 'SKF', 'Unidad', 54000],
    ['ACE-099', 'Aceite discontinuado · ejemplo inactivo', 'Prueba', 'Litro', 7000],
  ];
  data.products = specs.map(([code, description, brand, unit, unitPrice], index) => ({
    id: `practica-p${String(index + 1).padStart(2, '0')}`,
    code,
    description,
    brand,
    unit,
    unitPrice,
    active: code !== 'ACE-099',
  }));
  const byCode = new Map(data.products.map((product) => [product.code, product]));
  data.stockMovements = data.products
    .filter((product) => product.code !== 'REP-099')
    .map((product) => ({
      id: `practica-inicial-${product.code}`,
      productId: product.id,
      unit: product.unit,
      at: '2025-01-02T12:00:00.000Z',
      kind: 'opening',
      deltaMilli:
        (product.unit === 'Litro'
          ? 180
          : product.unit === 'Kilogramo'
            ? 6
            : product.unit === 'Juego'
              ? 25
              : 60) * 1000,
      reason: 'Saldo inicial ficticio para practicar el inventario',
    }));
  const serviceMovements = [];
  const appendMove = (service, item, deltaMilli, suffix, at, reason) =>
    serviceMovements.push({
      id: `practica-stock-${service.id}-${suffix}`,
      productId: item.productId,
      unit: item.unit,
      at,
      deltaMilli,
      kind: 'service',
      serviceId: service.id,
      reason,
    });
  const oldIds = new Set(['practica-s001', 'practica-s004', 'practica-s007']);
  const cancelledId = data.services.find(
    (service, index) => index > 30 && service.type === 'Frenos',
  ).id;
  for (let index = 0; index < data.services.length; index++) {
    const service = data.services[index];
    service.public = false;
    service.notes =
      'DATOS FICTICIOS. Ejemplo para practicar; no corresponde a un cliente ni a un trabajo real.';
    if (oldIds.has(service.id)) continue;
    if (service.type === 'Filtros' && index % 2 === 0) service.type = 'Filtro de habitáculo';
    const kind = maintenanceKind(service.type);
    let selected;
    if (kind.key === 'aceite-filtros')
      selected = [
        [index % 2 ? 'ACE-001' : 'ACE-002', index % 2 ? 4.5 : 5.5],
        ['FIL-001', 1],
        ['ARR-001', 1],
      ];
    else if (kind.key === 'filtros')
      selected = [
        ['FIL-003', 1],
        ['FIL-004', 1],
      ];
    else if (kind.key === 'otro-filtro-de-habitaculo') selected = [['HAB-001', 1]];
    else if (kind.key === 'frenos')
      selected = [
        ['FRE-001', 1],
        ['FRE-003', 0.5],
      ];
    else if (kind.key === 'neumaticos')
      selected = [
        ['NEU-001', 2],
        ['ALI-002', 2],
      ];
    else
      selected = [
        ['ALI-001', 0.075],
        ['ALI-002', 4],
      ];
    let items = selected.map(([code, quantity], n) => ({
      ...productServiceItem(byCode.get(code), `practica-art-${index + 1}-${n + 1}`),
      quantity,
      unitPrice:
        Math.round(byCode.get(code).unitPrice * (service.date < '2026-05-01' ? 0.85 : 1) * 100) /
        100,
    }));
    if (service.id === 'practica-s003')
      items = [
        {
          id: 'practica-manual-externo',
          code: 'EXTERNO',
          description: 'Limpiador aportado por el cliente · artículo manual',
          quantity: 1,
          unit: 'Unidad',
          unitPrice: 0,
        },
      ];
    Object.assign(service, saveSupplyItems(items, ''));
    service.stockManaged = true;
    service.laborAmount = kind.key === 'alineacion-balanceo' ? 35000 : 28000;
    service.amount = Math.round(totalItemCents(items) / 100 + service.laborAmount);
    const nextDate = new Date(`${service.date}T12:00:00Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + (kind.key === 'alineacion-balanceo' ? 90 : 180));
    service.maintenance = servicePlan(service, {
      date: nextDate.toISOString().slice(0, 10),
      km: service.km + (kind.key === 'frenos' ? 30000 : 10000),
      recommendation: kind.recommendations[0],
    });
    service.changes = [{ at: `${service.date}T15:00:00.000Z`, action: 'created', changes: [] }];
    for (const [n, item] of items.entries())
      if (item.productId)
        appendMove(
          service,
          item,
          -Math.round(item.quantity * 1000),
          `${n + 1}-consumo`,
          `${service.date}T15:00:00.000Z`,
          'Consumo ficticio de mantenimiento',
        );
    if (service.id === 'practica-s005') {
      const movement = serviceMovements.find(
        (row) => row.serviceId === service.id && row.productId === items[0].productId,
      );
      movement.deltaMilli += 500;
      appendMove(
        service,
        items[0],
        -500,
        'correccion-aceite',
        `${service.date}T16:00:00.000Z`,
        'Corrección ficticia: se registran 0,5 litros adicionales de aceite',
      );
      service.changes.push({
        at: `${service.date}T16:00:00.000Z`,
        action: 'edited',
        changes: [
          {
            field: 'Cantidad de aceite (Litro)',
            before: String(items[0].quantity - 0.5),
            after: String(items[0].quantity),
          },
        ],
      });
    }
    if (service.id === cancelledId) {
      service.annulment = {
        at: '2026-10-26T16:00:00.000Z',
        reason: 'Anulación ficticia: se canceló el trabajo; los artículos se devolvieron al stock.',
      };
      service.changes.push({
        at: service.annulment.at,
        action: 'annulled',
        reason: service.annulment.reason,
        changes: [],
      });
      for (const [n, item] of items.entries())
        if (item.productId)
          appendMove(
            service,
            item,
            Math.round(item.quantity * 1000),
            `${n + 1}-devolucion`,
            service.annulment.at,
            'Devolución ficticia por anulación del servicio',
          );
    }
  }
  data.stockMovements.push(...serviceMovements);
  for (const [code, deltaMilli, reason, kind] of [
    ['ACE-001', 20000, 'Ingreso ficticio de compra: 20 litros de aceite', 'receipt'],
    ['ALI-002', -2000, 'Ajuste ficticio por diferencia de conteo: dos válvulas', 'adjustment'],
  ]) {
    const product = byCode.get(code);
    data.stockMovements.push({
      id: `practica-extra-${code}`,
      productId: product.id,
      unit: product.unit,
      at: '2026-10-27T10:00:00.000Z',
      deltaMilli,
      reason,
      kind,
    });
  }
  data.stockMovements.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const low = byCode.get('HAB-001');
  const delta = 2000 - stockBalance(data, low.id);
  if (delta)
    data.stockMovements.push({
      id: 'practica-ajuste-stock-bajo',
      productId: low.id,
      unit: low.unit,
      at: '2026-10-27T11:00:00.000Z',
      deltaMilli: delta,
      kind: 'adjustment',
      reason: 'Ajuste ficticio de conteo para practicar con stock bajo: quedan dos unidades',
    });
  data.vehicles = data.vehicles.map((vehicle) => {
    const latest = new Map();
    for (const service of data.services
      .filter(
        (service) => !service.annulment && service.vehicleId === vehicle.id && service.maintenance,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km))
      latest.set(service.maintenance.category, service.maintenance);
    return withPlanSummary(
      { ...vehicle, manualKm: vehicle.km, maintenancePlans: [...latest.values()] },
      '2026-10-27',
    );
  });
  const validated = parseBackup(JSON.stringify(backup));
  const json = JSON.stringify(validated, null, 2) + '\n';
  await writeFile(
    new URL('../src/data/taller-calamante-practica-stock.json', import.meta.url),
    json,
  );
  await mkdir(new URL('../examples/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../examples/taller-calamante-practica-stock.zip', import.meta.url),
    zipSync({ 'backup.json': [strToU8(json), { level: 6, mtime: new Date(backup.exportedAt) }] }),
  );
  console.log(
    JSON.stringify({
      clientes: data.customers.length,
      vehiculos: data.vehicles.length,
      mantenimientos: data.services.length,
      productos: data.products.length,
      movimientos: data.stockMovements.length,
      anulados: data.services.filter((service) => service.annulment).length,
      archivo: 'examples/taller-calamante-practica-stock.zip',
    }),
  );
} finally {
  await vite.close();
}
