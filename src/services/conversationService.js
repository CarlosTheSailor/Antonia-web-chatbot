const { openai, isOpenAiEnabled } = require('../lib/openaiClient');
const { getKnowledgeBase, buildKnowledgeSnapshot } = require('./kbService');
const {
  getOrCreateSession,
  getSessionMessages,
  saveMessage,
  updateSession
} = require('./sessionService');
const { createLead } = require('./leadService');
const { runPostBookingIntegrations } = require('./bookingIntegrationService');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ALLOWED_STAGES = new Set(['welcome', 'discover', 'recommend', 'close']);
const ALLOWED_FIELDS = new Set([
  'name',
  'howHeard',
  'experienceLevel',
  'activityLevel',
  'goal',
  'injuryNotes',
  'injuryAsked',
  'availability',
  'contact',
  'trainingBackground',
  'recommendedClass'
]);

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function shouldTriggerLeadCapture({ userMessage, lastAssistantText }) {
  const user = normalizeText(userMessage);
  const lastAssistant = normalizeText(lastAssistantText);

  const directBooking = /(reserv|apunt|anot|clase gratis|quiero probar|quiero venir|me apunto|agend)/.test(
    user
  );
  if (directBooking) return true;

  const affirmativeOnly = /^(si|sí|vale|ok|perfecto|dale|de una|claro|por supuesto)[.! ]*$/.test(
    user.trim()
  );
  const assistantAskedBooking = /(quieres.*reserv|te.*reserv|apuntarte.*clase gratis|te cierro.*clase gratis|quieres que te reserve)/.test(
    lastAssistant
  );

  return affirmativeOnly && assistantAskedBooking;
}

function hasSpecificSlot(text) {
  const value = normalizeText(text);
  const hasDay = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|entre semana|fin de semana)/.test(
    value
  );
  const hasHour = /\b([01]?\d|2[0-3])(:[0-5]\d)?\b/.test(value);
  return hasDay && hasHour;
}

function parseBookingSlot(text) {
  const value = normalizeText(text);
  const dayMatch = value.match(/lunes|martes|miercoles|jueves|viernes|sabado|domingo/);
  const hourMatch = value.match(/\b([01]?\d|2[0-3])(:[0-5]\d)?\b/);
  if (!dayMatch || !hourMatch) return null;
  const day = dayMatch[0];
  const hh = String(hourMatch[1]).padStart(2, '0');
  const mm = hourMatch[2] || ':00';
  return { day, time: `${hh}${mm}` };
}

function buildReservationKey(sessionId, slot, phone) {
  if (!slot?.day || !slot?.time || !phone) return null;
  return `${sessionId}|${slot.day}|${slot.time}|${String(phone).replace(/\s+/g, '')}`;
}

function hasValidPhone(value) {
  return /(\+?\d[\d\s-]{7,})/.test(String(value || ''));
}

function hasFullName(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length >= 2;
}

function getMissingFields(collectedFields) {
  const fields = collectedFields || {};
  const missing = [];
  if (!fields.howHeard) missing.push('howHeard');
  if (!fields.experienceLevel || fields.experienceLevel === 'unknown') missing.push('experienceLevel');
  if (!fields.activityLevel) missing.push('activityLevel');
  if (!fields.goal) missing.push('goal');
  if (!fields.availability) missing.push('availability');
  if (!fields.injuryNotes && fields.injuryAsked !== true) missing.push('injuryNotes');
  return missing;
}

function normalizeStage(stage, fallback) {
  const value = String(stage || '').toLowerCase();
  return ALLOWED_STAGES.has(value) ? value : fallback;
}

function sanitizeCollectedFields(nextFields, previousFields) {
  const safe = { ...(previousFields || {}) };
  if (!nextFields || typeof nextFields !== 'object') return safe;

  for (const [key, value] of Object.entries(nextFields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    safe[key] = value;
  }

  return safe;
}

function selectPlaybookSection(playbook, stage) {
  const section = (playbook || []).find((entry) => entry.section === stage);
  return section?.content || '';
}

function selectToneExamples(toneExamples) {
  return (toneExamples || []).slice(0, 2);
}

function buildSystemPrompt({
  stageHint,
  knowledgeSnapshot,
  playbookText,
  toneExamples,
  sessionSummary,
  collectedFieldsSummary,
  missingFieldsSummary,
  lastAssistantQuestion
}) {
  const toneText = toneExamples
    .map(
      (item, idx) =>
        `Ejemplo ${idx + 1} Usuario: ${item.user_example}\nEjemplo ${idx + 1} Antonia: ${item.assistant_example}`
    )
    .join('\n\n');

  return [
    'Eres Antonia, recepción de WODS.',
    'Objetivo: orientar a nuevos clientes, recomendar clase adecuada y cerrar con clase gratis de bienvenida.',
    'Tono: cercano, canalla, directo, cero corporativo, español natural con tildes.',
    'Reglas:',
    '- Haz respuestas cortas (2-4 líneas).',
    '- Haz solo 1 pregunta nueva por turno.',
    '- No repitas una pregunta ya respondida.',
    '- Si el usuario responde con "sí/no/vale/ok" o una frase muy corta, interprétalo como respuesta a la última pregunta del asistente.',
    '- Si un campo ya está recogido en "Campos ya recogidos", NO lo vuelvas a preguntar.',
    '- En cada turno, si haces pregunta, que sea sobre 1 campo pendiente concreto.',
    '- Si el usuario dice algo genérico como "clases", "horarios" o "clases y horarios", NO sueltes la agenda completa por días.',
    '- En ese caso, da solo un resumen de tipos de clase (Cross, Funcional, Híbrido, Strong, Mobilitat, SINES3) y enlaza a discovery: "para recomendarte bien, te hago unas preguntas rápidas".',
    '- Solo da horarios detallados por día/hora cuando el usuario lo pida explícitamente o cuando ya haya 1-2 clases recomendadas.',
    '- Si preguntan clases/precios/horarios, responde primero y luego sigue el discovery.',
    '- Nunca inventes horarios ni precios.',
    '- No hagas diagnóstico médico.',
    '- Si etapa=close, incluye CTA a https://wods.es/clase-gratis/.',
    '- Flujo de cierre obligatorio: 1) preguntar si quiere reservar clase gratis, 2) si dice que sí, pedir día y hora concretos, 3) después pedir nombre completo y número de teléfono en el propio chat.',
    '- No pidas nombre/teléfono ni actives cierre final si todavía no hay día y hora concretos de prueba.',
    '- Cuando ya tengas nombre completo y teléfono, confirma la reserva de forma clara en el chat y no vuelvas a pedir esos datos.',
    '- No menciones ni uses formularios; todo se cierra por chat.',
    '- Si ya tenemos cómo nos conoció, NO vuelvas a preguntar eso en cierre.',
    '- Antes de despedirte, asegúrate de haber preguntado cómo nos conoció.',
    '- Si viene recomendado, explica una sola vez el beneficio de 10 EUR.',
    '- Ejemplo correcto si el usuario dice "clases horarios": "Tenemos varios tipos de clase: Cross, Funcional, Híbrido, Strong, Mobilitat y SINES3. Si quieres, te recomiendo las que mejor te encajan y luego te paso horarios concretos. Para afinarlo, ¿cuál es tu objetivo principal ahora mismo?".',
    '',
    'Devuelve SIEMPRE JSON válido con esta forma exacta:',
    '{',
    '  "reply": "string",',
    '  "stage": "welcome|discover|recommend|close",',
    '  "leadCaptureRequested": true|false,',
    '  "collectedFields": {',
    '    "name": "string opcional",',
    '    "howHeard": "string opcional",',
    '    "experienceLevel": "beginner|intermediate|advanced|unknown opcional",',
    '    "activityLevel": "string opcional",',
    '    "goal": "string opcional",',
    '    "injuryNotes": "string opcional",',
    '    "injuryAsked": true|false opcional,',
    '    "availability": "string opcional",',
    '    "contact": "string opcional",',
    '    "trainingBackground": "string opcional",',
    '    "recommendedClass": "string opcional"',
    '  },',
    '  "recommendation": "string opcional"',
    '}',
    '',
    `Etapa sugerida actual: ${stageHint}`,
    `Resumen de sesión: ${sessionSummary}`,
    `Última pregunta del asistente: ${lastAssistantQuestion || 'No disponible'}`,
    `Campos ya recogidos: ${collectedFieldsSummary}`,
    `Campos pendientes prioritarios: ${missingFieldsSummary}`,
    `Programas y servicios:\n${knowledgeSnapshot.programsText}`,
    `Manifiesto y valores:\n${knowledgeSnapshot.manifestoText}`,
    `Servicios:\n${knowledgeSnapshot.servicesText}`,
    `Horarios:\n${knowledgeSnapshot.scheduleText}`,
    `Guion operativo:\n${playbookText || 'No disponible'}`,
    `Tono esperado:\n${toneText || 'No disponible'}`
  ].join('\n');
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {}

  const match = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const candidate = match[1] || match[0];
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

async function generateAssistantTurn({ message, history, systemPrompt }) {
  if (!isOpenAiEnabled()) {
    return {
      reply: 'Estoy en modo demo. Activa OPENAI_API_KEY para respuestas inteligentes.',
      stage: 'discover',
      leadCaptureRequested: false,
      collectedFields: {},
      recommendation: null
    };
  }

  const historyMessages = history.map((item) => ({
    role: item.role,
    content: item.content
  }));

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.5,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'antonia_turn',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            stage: { type: 'string', enum: ['welcome', 'discover', 'recommend', 'close'] },
            leadCaptureRequested: { type: 'boolean' },
            collectedFields: {
              type: 'object',
              properties: {
                name: { type: ['string', 'null'] },
                howHeard: { type: ['string', 'null'] },
                experienceLevel: {
                  anyOf: [
                    { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'unknown'] },
                    { type: 'null' }
                  ]
                },
                activityLevel: { type: ['string', 'null'] },
                goal: { type: ['string', 'null'] },
                injuryNotes: { type: ['string', 'null'] },
                injuryAsked: { type: ['boolean', 'null'] },
                availability: { type: ['string', 'null'] },
                contact: { type: ['string', 'null'] },
                trainingBackground: { type: ['string', 'null'] },
                recommendedClass: { type: ['string', 'null'] }
              },
              required: [
                'name',
                'howHeard',
                'experienceLevel',
                'activityLevel',
                'goal',
                'injuryNotes',
                'injuryAsked',
                'availability',
                'contact',
                'trainingBackground',
                'recommendedClass'
              ],
              additionalProperties: false
            },
            recommendation: { type: ['string', 'null'] }
          },
          required: ['reply', 'stage', 'leadCaptureRequested', 'collectedFields', 'recommendation'],
          additionalProperties: false
        }
      }
    },
    messages: [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message }
    ]
  });

  const content = response.choices?.[0]?.message?.content || '';
  const parsed = extractJsonObject(content);
  if (parsed) return parsed;

  return {
    reply: String(content || '').trim() || 'Ahora mismo no pude responder bien. ¿Me repites en una frase qué necesitas?',
    stage: 'discover',
    leadCaptureRequested: false,
    collectedFields: {},
    recommendation: null
  };
}

async function processChatTurn({ sessionId, message }) {
  const session = await getOrCreateSession(sessionId);
  const kb = await getKnowledgeBase();
  const history = await getSessionMessages(session.id, 12);

  const previousFields = session.collected_fields || {};
  const missingFields = getMissingFields(previousFields);
  const stageHint = normalizeStage(session.last_stage || 'welcome', 'welcome');
  const knowledgeSnapshot = buildKnowledgeSnapshot(kb);
  const playbookText = selectPlaybookSection(kb.playbook, stageHint);
  const toneExamples = selectToneExamples(kb.toneExamples);
  const sessionSummary = JSON.stringify({
    stage: stageHint,
    collectedFields: previousFields,
    previousRecommendation: session.last_recommendation || null
  });
  const lastAssistantQuestion =
    [...history]
      .reverse()
      .find((msg) => msg.role === 'assistant' && /\?/.test(String(msg.content || '')))
      ?.content || '';

  const systemPrompt = buildSystemPrompt({
    stageHint,
    knowledgeSnapshot,
    playbookText,
    toneExamples,
    sessionSummary,
    collectedFieldsSummary: JSON.stringify(previousFields),
    missingFieldsSummary: missingFields.length ? missingFields.join(', ') : 'ninguno',
    lastAssistantQuestion
  });

  const modelTurn = await generateAssistantTurn({
    message,
    history,
    systemPrompt
  });

  const stage = normalizeStage(modelTurn.stage, stageHint === 'welcome' ? 'discover' : stageHint);
  const collectedFields = sanitizeCollectedFields(modelTurn.collectedFields, previousFields);
  const bookingConsentThisTurn = shouldTriggerLeadCapture({
    userMessage: message,
    lastAssistantText: history?.[history.length - 1]?.content || ''
  });
  const bookingConsentGiven = Boolean(previousFields.bookingConsentGiven || bookingConsentThisTurn);
  collectedFields.bookingConsentGiven = bookingConsentGiven;
  const hasSlotSelected = hasSpecificSlot(collectedFields.availability || '') || hasSpecificSlot(message);
  collectedFields.slotSelected = hasSlotSelected;
  const slot = parseBookingSlot(collectedFields.availability || message);
  const recommendation =
    typeof modelTurn.recommendation === 'string' && modelTurn.recommendation.trim()
      ? modelTurn.recommendation.trim()
      : session.last_recommendation || null;
  const reply =
    (typeof modelTurn.reply === 'string' && modelTurn.reply.trim()) ||
    'Te leo. ¿Quieres que empecemos por clases, horarios o precios?';
  let finalReply = reply;
  let leadCaptureRequested = false;

  const alreadyCreatedLead = Boolean(previousFields.leadCreated || collectedFields.leadCreated);
  const reservationKey = buildReservationKey(session.id, slot, collectedFields.contact);
  const sameReservationAlreadyProcessed =
    reservationKey && reservationKey === previousFields.lastReservationKey && alreadyCreatedLead;

  const canCreateLead =
    bookingConsentGiven &&
    hasSlotSelected &&
    hasFullName(collectedFields.name) &&
    hasValidPhone(collectedFields.contact) &&
    !sameReservationAlreadyProcessed &&
    !alreadyCreatedLead;

  let booking = previousFields.booking || null;

  if (canCreateLead) {
    try {
      const lead = await createLead({
        sessionId: session.id,
        name: collectedFields.name,
        contact: collectedFields.contact,
        goal: collectedFields.goal || null,
        availability: collectedFields.availability || null,
        experienceLevel: collectedFields.experienceLevel || 'unknown',
        notes: `Reserva chat Antonia. Slot: ${slot ? `${slot.day} ${slot.time}` : 'no detectado'}`,
        recommendedPlan: recommendation || null
      });

      const integrations = await runPostBookingIntegrations({
        payload: {
          sessionId: session.id,
          name: collectedFields.name,
          contact: collectedFields.contact,
          goal: collectedFields.goal || null,
          availability: collectedFields.availability || null,
          className: collectedFields.recommendedClass || null,
          bookingDate: null,
          recommendedPlan: recommendation || null,
          bookingConfirmed: true,
          bookingDay: slot?.day || null,
          bookingTime: slot?.time || null
        },
        leadId: lead.id
      });
      booking = integrations?.booking || null;

      collectedFields.leadCreated = true;
      collectedFields.leadId = lead.id;
      collectedFields.leadCreatedAt = new Date().toISOString();
      collectedFields.lastReservationKey = reservationKey;
      collectedFields.booking = booking;
      collectedFields.bookingStatus = booking?.status || 'pending_manual';

      if (!/reserv|confirmad|nos vemos|clase gratis|recepcion/i.test(finalReply)) {
        const dayText = slot?.day ? slot.day.charAt(0).toUpperCase() + slot.day.slice(1) : 'el día acordado';
        const timeText = slot?.time || 'la hora acordada';
        if (booking?.status === 'reserved_external') {
          finalReply = `${finalReply}\n\nPerfecto, ${collectedFields.name}. Te dejo reservada la clase de bienvenida para ${dayText} a las ${timeText}. Avisamos también a coaches por WhatsApp.`;
        } else if (booking?.status === 'pending_manual') {
          finalReply = `${finalReply}\n\nPerfecto, ${collectedFields.name}. Ya tengo tus datos para ${dayText} a las ${timeText}. Lo pasamos a recepción/coaches para cierre manual en Aimharder y te confirman por WhatsApp.`;
        } else {
          finalReply = `${finalReply}\n\nTengo tu reserva en proceso para ${dayText} a las ${timeText}. Si hay cualquier incidencia técnica, recepción te confirma por WhatsApp.`;
        }
      }
    } catch (error) {
      console.error('Error creando lead automático desde chat:', error?.message || error);
      booking = {
        status: 'failed_external',
        reason: 'conversation_flow_exception'
      };
      collectedFields.booking = booking;
      collectedFields.bookingStatus = 'failed_external';
      if (!/no pude|error|fallo/i.test(finalReply)) {
        finalReply = `${finalReply}\n\nMe falló el cierre automático de la reserva. Si quieres, te lo vuelvo a intentar ahora mismo.`;
      }
    }
  }

  await saveMessage({ sessionId: session.id, role: 'user', content: message });
  await saveMessage({ sessionId: session.id, role: 'assistant', content: finalReply });
  await updateSession({
    sessionId: session.id,
    stage,
    collectedFields,
    recommendation
  });

  return {
    reply: finalReply,
    sessionId: session.id,
    stage,
    leadCaptureRequested,
    collectedFields,
    booking,
    recommendation,
    kbSource: kb.source
  };
}

module.exports = {
  processChatTurn
};
