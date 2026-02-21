/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function load(fileName) {
  const fullPath = path.join(__dirname, '..', 'data', fileName);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function loadServicesFromMasterOrKb() {
  const dataDir = path.join(__dirname, '..', 'data');
  const masterPath = path.join(dataDir, 'pricing_catalog_master.json');

  if (fs.existsSync(masterPath)) {
    const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
    return master
      .filter((item) => item.status !== 'legacy')
      .map((item, index) => ({
        name: item.service_name,
        category: item.category,
        description: [item.includes, item.conditions].filter(Boolean).join(' '),
        price_text:
          item.billing_period === 'monthly'
            ? `${item.price_value} EUR/mes`
            : item.billing_period === '6_months'
              ? `${item.price_value} EUR (duracion 6 meses)`
              : item.billing_period === '1_month'
                ? `${item.price_value} EUR (duracion 1 mes)`
                : item.billing_period === '1_week'
                  ? `${item.price_value} EUR (duracion 1 semana)`
                  : `${item.price_value} EUR`,
        eligibility: item.eligibility,
        priority: index + 1,
        active: item.status === 'active'
      }));
  }

  return load('kb_services.json').map((item) => ({
    name: item.name,
    category: item.category,
    description: item.description,
    price_text: item.price_text,
    eligibility: item.eligibility,
    priority: item.priority,
    active: item.active
  }));
}

async function replaceTable(table, data) {
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (deleteError) throw deleteError;

  if (!data.length) {
    console.log(`[skip] ${table} sin registros`);
    return;
  }

  const { error } = await supabase.from(table).insert(data);
  if (error) throw error;
  console.log(`[ok] ${table}: ${data.length} registros`);
}

async function run() {
  await replaceTable('kb_services', loadServicesFromMasterOrKb());
  await replaceTable('kb_schedule', load('kb_schedule.json'));
  await replaceTable('kb_playbook', load('kb_playbook.json'));
  await replaceTable('kb_tone_examples', load('kb_tone_examples.json'));
  console.log('Carga KB completada.');
}

run().catch((error) => {
  console.error('Error en seed-kb:', error.message || error);
  process.exit(1);
});
