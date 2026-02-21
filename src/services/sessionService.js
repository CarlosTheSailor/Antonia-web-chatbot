const crypto = require('crypto');
const { supabase, isSupabaseEnabled } = require('../lib/supabaseClient');

const memorySessions = new Map();

function buildSessionDefaults(sessionId) {
  return {
    id: sessionId,
    created_at: new Date().toISOString(),
    last_stage: 'welcome',
    collected_fields: {},
    last_recommendation: null
  };
}

async function getOrCreateSession(sessionId) {
  const resolvedSessionId = sessionId || crypto.randomUUID();

  if (!isSupabaseEnabled()) {
    if (!memorySessions.has(resolvedSessionId)) {
      memorySessions.set(resolvedSessionId, {
        session: buildSessionDefaults(resolvedSessionId),
        messages: []
      });
    }
    return memorySessions.get(resolvedSessionId).session;
  }

  const { data: existing, error: fetchError } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', resolvedSessionId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const payload = buildSessionDefaults(resolvedSessionId);
  const { data: created, error: insertError } = await supabase
    .from('chat_sessions')
    .insert(payload)
    .select('*')
    .single();

  if (insertError) throw insertError;
  return created;
}

async function getSessionMessages(sessionId, limit = 12) {
  if (!isSupabaseEnabled()) {
    return (memorySessions.get(sessionId)?.messages || []).slice(-limit);
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function saveMessage({ sessionId, role, content }) {
  if (!isSupabaseEnabled()) {
    const sessionBag = memorySessions.get(sessionId);
    if (!sessionBag) return;
    sessionBag.messages.push({ role, content, created_at: new Date().toISOString() });
    return;
  }

  const { error } = await supabase.from('chat_messages').insert({
    session_id: sessionId,
    role,
    content
  });

  if (error) throw error;
}

async function updateSession({ sessionId, stage, collectedFields, recommendation }) {
  if (!isSupabaseEnabled()) {
    const sessionBag = memorySessions.get(sessionId);
    if (!sessionBag) return;
    sessionBag.session.last_stage = stage;
    sessionBag.session.collected_fields = collectedFields;
    sessionBag.session.last_recommendation = recommendation;
    return;
  }

  const { error } = await supabase
    .from('chat_sessions')
    .update({
      last_stage: stage,
      collected_fields: collectedFields,
      last_recommendation: recommendation
    })
    .eq('id', sessionId);

  if (error) throw error;
}

module.exports = {
  getOrCreateSession,
  getSessionMessages,
  saveMessage,
  updateSession
};
