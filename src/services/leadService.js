const crypto = require('crypto');
const { supabase, isSupabaseEnabled } = require('../lib/supabaseClient');

const memoryLeads = [];

function normalizeExperience(value) {
  const supported = new Set(['beginner', 'intermediate', 'advanced', 'unknown']);
  const normalized = String(value || 'unknown').toLowerCase();
  return supported.has(normalized) ? normalized : 'unknown';
}

async function createLead(payload) {
  const leadPayload = {
    id: crypto.randomUUID(),
    session_id: payload.sessionId,
    name: payload.name || null,
    contact: payload.contact || null,
    goal: payload.goal || null,
    availability: payload.availability || null,
    experience_level: normalizeExperience(payload.experienceLevel),
    recommended_plan: payload.recommendedPlan || null,
    notes: payload.notes || null,
    status: 'new'
  };

  if (!isSupabaseEnabled()) {
    memoryLeads.push({ ...leadPayload, created_at: new Date().toISOString() });
    return { id: leadPayload.id, source: 'memory' };
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(leadPayload)
    .select('id')
    .single();

  if (error) throw error;
  return { id: data.id, source: 'supabase' };
}

module.exports = {
  createLead
};
