/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const masterPath = path.join(ROOT, 'data', 'pricing_catalog_master.json');
const kbServicesPath = path.join(ROOT, 'data', 'kb_services.json');

function toPriceText(item) {
  if (item.price_value === 0) return item.includes;
  if (item.billing_period === 'monthly') return `${item.price_value} EUR/mes`;
  if (item.billing_period === 'one_time') return `${item.price_value} EUR`;
  if (item.billing_period === '6_months') return `${item.price_value} EUR (duracion 6 meses)`;
  if (item.billing_period === '1_month') return `${item.price_value} EUR (duracion 1 mes)`;
  if (item.billing_period === '1_week') return `${item.price_value} EUR (duracion 1 semana)`;
  if (item.billing_period === 'quarterly') return `${item.price_value} EUR/trimestre`;
  return `${item.price_value} EUR`;
}

function buildDescription(item) {
  const bits = [item.includes, item.conditions].filter(Boolean);
  return bits.join(' ');
}

function sync() {
  const raw = fs.readFileSync(masterPath, 'utf8');
  const master = JSON.parse(raw);

  const publishable = master.filter((item) => item.status !== 'legacy');

  const kbServices = publishable.map((item, index) => ({
    service_id: item.service_id,
    name: item.service_name,
    category: item.category,
    description: buildDescription(item),
    price_text: toPriceText(item),
    eligibility: item.eligibility,
    priority: index + 1,
    active: item.status === 'active',
    status: item.status,
    source_url: item.source_url,
    last_verified_at: item.last_verified_at
  }));

  fs.writeFileSync(kbServicesPath, `${JSON.stringify(kbServices, null, 2)}\n`, 'utf8');
  console.log(`sync-ok: ${kbServices.length} registros en kb_services.json (${publishable.filter((x) => x.status === 'active').length} activos)`);
}

try {
  sync();
} catch (error) {
  console.error('sync-error:', error.message || error);
  process.exit(1);
}
