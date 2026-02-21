const fs = require('fs');
const path = require('path');
const { supabase, isSupabaseEnabled } = require('../lib/supabaseClient');

const dataPath = path.join(__dirname, '..', '..', 'data');

function readJson(fileName, fallback = []) {
  try {
    const fullPath = path.join(dataPath, fileName);
    if (!fs.existsSync(fullPath)) return fallback;
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

const localKb = {
  services: readJson('kb_services.json', []),
  schedule: readJson('kb_schedule.json', []),
  playbook: readJson('kb_playbook.json', []),
  toneExamples: readJson('kb_tone_examples.json', []),
  programs: readJson('kb_programs.json', []),
  manifesto: readJson('kb_manifesto.json', [])
};

async function fetchTable(table, orderBy) {
  if (!isSupabaseEnabled()) return null;

  let query = supabase.from(table).select('*').eq('active', true);
  if (orderBy) query = query.order(orderBy, { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getKnowledgeBase() {
  try {
    const [services, schedule, playbook, toneExamples] = await Promise.all([
      fetchTable('kb_services', 'priority'),
      fetchTable('kb_schedule', 'day_of_week'),
      fetchTable('kb_playbook'),
      fetchTable('kb_tone_examples')
    ]);

    if (services && schedule && playbook && toneExamples) {
      return { services, schedule, playbook, toneExamples, source: 'supabase' };
    }
  } catch (error) {
    console.error('KB fallback local por error Supabase:', error.message);
  }

  return {
    services: localKb.services,
    schedule: localKb.schedule,
    playbook: localKb.playbook,
    toneExamples: localKb.toneExamples,
    programs: localKb.programs,
    manifesto: localKb.manifesto,
    source: 'local'
  };
}

function buildKnowledgeSnapshot(kb) {
  const servicesText = kb.services
    .slice(0, 8)
    .map((service) => `- ${service.name}: ${service.description} | Precio: ${service.price_text}`)
    .join('\n');

  const scheduleText = kb.schedule
    .slice(0, 16)
    .map(
      (slot) =>
        `- Dia ${slot.day_of_week}: ${slot.class_name} ${slot.start_time}-${slot.end_time} (${slot.level || 'todos niveles'})`
    )
    .join('\n');

  const programsText = (kb.programs || [])
    .slice(0, 20)
    .map((program) => `- ${program.name}: ${program.description} (${program.audience || 'todos'})`)
    .join('\n');

  const manifestoText = (kb.manifesto || [])
    .slice(0, 10)
    .map((entry) => `- ${entry.section}: ${entry.content}`)
    .join('\n');

  return {
    servicesText: servicesText || 'No hay datos de servicios cargados.',
    scheduleText: scheduleText || 'No hay horarios cargados.',
    programsText: programsText || 'No hay descripciones de clases cargadas.',
    manifestoText: manifestoText || 'No hay manifiesto cargado.'
  };
}

module.exports = {
  getKnowledgeBase,
  buildKnowledgeSnapshot
};
