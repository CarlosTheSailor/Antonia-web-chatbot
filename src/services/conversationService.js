const { openai, isOpenAiEnabled } = require('../lib/openaiClient');
const { getKnowledgeBase, buildKnowledgeSnapshot } = require('./kbService');
const {
  getOrCreateSession,
  getSessionMessages,
  saveMessage,
  updateSession
} = require('./sessionService');
const { recommendPlan } = require('./recommendationService');

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const FREE_CLASS_URL = 'https://wods.es/clase-gratis/';
const DAY_NAME = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo'
};

function detectExperienceLevel(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('principiante') || value.includes('nunca') || value.includes('empiezo')) {
    return 'beginner';
  }
  if (value.includes('intermedio')) return 'intermediate';
  if (value.includes('avanzado') || value.includes('compito')) return 'advanced';
  return 'unknown';
}

function inferFields({ session, message }) {
  const collected = { ...(session.collected_fields || {}) };
  const lower = message.toLowerCase();

  if (!collected.goal && /(objetivo|quiero|me gustaria|busco|perder|fuerza|forma)/.test(lower)) {
    collected.goal = message;
  }

  if (
    !collected.goal &&
    /(hyrox|ocr|obstac|jiu|bjj|haltero|calistenia|movilidad|movilitat|salud)/.test(lower)
  ) {
    collected.goal = message;
  }

  if (!collected.availability && /(lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|tarde|noche|horario)/.test(lower)) {
    collected.availability = message;
  }

  if (!collected.experienceLevel) {
    const level = detectExperienceLevel(message);
    if (level !== 'unknown') collected.experienceLevel = level;
  }

  if (!collected.contact && /(\+?\d{8,}|@|whatsapp|telefono|tel\b)/.test(lower)) {
    collected.contact = message;
  }

  if (
    !collected.trainingBackground &&
    /(crossfit|haltero|halterofilia|gym|gimnasio|box|entreno|entrenado|fuerza)/.test(lower)
  ) {
    collected.trainingBackground = message;
  }

  if (!collected.activityLevel && /(sedentari|activo|diario|2-3|ocasional|nunca)/.test(lower)) {
    collected.activityLevel = message;
  }

  if (
    !collected.howHeard &&
    /(os conoci|conoci por|os vi en|instagram|google|recomend|amig|coleg|pasaba por|vi la web|redes)/.test(
      lower
    )
  ) {
    collected.howHeard = message;
  }

  if (
    !collected.injuryNotes &&
    /(lesion|lesión|molestia|dolor|duele|rodilla|espalda|hombro|cadera)/.test(lower)
  ) {
    collected.injuryNotes = message;
  }

  if (
    !collected.injuryAsked &&
    /(lesion|lesión|molestia|dolor|duele|ninguna|ninguno|no tengo|sin molestias)/.test(lower)
  ) {
    collected.injuryAsked = true;
  }

  if (!collected.injuryAsked && collected.injuryNotes) {
    collected.injuryAsked = true;
  }

  if (/ya te lo he dicho|ya lo dije|ya te dije/.test(lower) && collected.injuryNotes) {
    collected.injuryAsked = true;
  }

  return collected;
}

function isFactualQuestion(message) {
  const lower = message.toLowerCase();
  return /(precio|coste|cuanto|horario|hora|clase|servicio)/.test(lower);
}

function nextStage({ collectedFields, currentStage }) {
  const hasMandatory = Boolean(
    collectedFields.howHeard &&
      collectedFields.experienceLevel &&
      collectedFields.activityLevel &&
      collectedFields.goal &&
      collectedFields.availability &&
      collectedFields.injuryAsked
  );

  if (currentStage === 'welcome') return 'discover';
  if (!hasMandatory) return 'discover';
  if (currentStage === 'close') return 'close';
  if (currentStage === 'recommend') return 'close';
  return 'recommend';
}

function selectPlaybookSection(playbook, stage) {
  const section = playbook.find((entry) => entry.section === stage);
  return section?.content || '';
}

function selectToneExamples(toneExamples) {
  return toneExamples.slice(0, 2);
}

function buildSystemPrompt({ stage, knowledgeSnapshot, playbookText, toneExamples, sessionSummary }) {
  const toneText = toneExamples
    .map((item, idx) => `Ejemplo ${idx + 1} Usuario: ${item.user_example}\nEjemplo ${idx + 1} Antonia: ${item.assistant_example}`)
    .join('\n\n');

  return [
    'Eres Antonia, recepción de WODS. Tu objetivo es orientar a nuevos clientes y convertirlos en lead.',
    'Debes respirar la identidad de WODS: cercanía, técnica, sostenibilidad, comunidad y cero postureo.',
    'Reglas estrictas:',
    '- Responde en español de calle, natural y directa. Cero tono corporativo.',
    '- Tutea siempre. Frases cortas. Nada de párrafos largos.',
    '- Máximo 4 líneas por respuesta y 1 pregunta por turno.',
    '- Si el usuario pide mucha info (clases/precios/horarios), da un resumen corto (2-3 líneas) y sigue con el flujo.',
    '- Máximo 1 pregunta nueva por turno.',
    '- Explica las clases y servicios usando el contexto del manifiesto y programas, no solo precios.',
    '- Si preguntan por precio/horario, responde primero con datos del contexto y luego retoma el discovery.',
    '- Nunca inventes precios u horarios. Si falta info, di que lo confirma recepcion por WhatsApp.',
    '- No hagas diagnóstico médico.',
    '- Si alguien tiene miedo o inseguridad, refuerza que se adapta por nivel y que la técnica va antes que el ego.',
    '- Orden de discovery prioritario: cómo nos conoció -> experiencia/actividad -> objetivo -> molestias -> disponibilidad.',
    '- Si viene recomendado, recuerda beneficio de 10 EUR para ambas partes al domiciliar primer pack.',
    '- Evita recomendar viernes para primeras pruebas de gente sin experiencia crossfit; si solo puede viernes, avisa que es más duro.',
    '- Si etapa=discover: NO cierres ni pases link de clase gratis todavía.',
    '- En cierre, invita siempre a apuntarse a la clase gratis con este enlace: https://wods.es/clase-gratis/',
    '- Antes de despedirte, pregunta siempre cómo nos ha conocido la persona (salvo que ya lo haya dicho).',
    '- Cierra con CTA cuando tengas suficiente información.',
    `Etapa actual: ${stage}`,
    `Resumen de sesion: ${sessionSummary}`,
    `Programas y servicios entrenables:\n${knowledgeSnapshot.programsText}`,
    `Manifiesto y valores:\n${knowledgeSnapshot.manifestoText}`,
    `Servicios:\n${knowledgeSnapshot.servicesText}`,
    `Horarios:\n${knowledgeSnapshot.scheduleText}`,
    `Guion operativo:\n${playbookText || 'No disponible'}`,
    `Tono esperado:\n${toneText || 'No disponible'}`
  ].join('\n\n');
}

function enforceClosePolicy({ stage, reply, collectedFields }) {
  if (stage !== 'close') return reply;

  const baseReply = String(reply || '').trim();
  const needsFreeClassLink =
    !baseReply.includes(FREE_CLASS_URL) && !/clase gratis/i.test(baseReply);
  const needsHowHeardQuestion =
    !collectedFields?.howHeard && !/como nos (has )?conocid/i.test(baseReply);

  const blocks = [baseReply];
  if (needsFreeClassLink) {
    blocks.push(`Si te cuadra, puedes apuntarte ya a la clase gratis aquí: ${FREE_CLASS_URL}`);
  }
  if (needsHowHeardQuestion) {
    blocks.push('Antes de cerrar, me ayudaría saber: ¿cómo nos has conocido?');
  }

  return blocks.filter(Boolean).join('\n\n');
}

function enforceRecommendationPolicy({ stage, reply, recommendation }) {
  if (stage !== 'recommend') return reply;
  const recText = String(recommendation || '').trim();
  if (!recText) return String(reply || '').trim();
  return recText;
}

function getNextDiscoveryQuestion(collectedFields) {
  if (!collectedFields?.howHeard) {
    return '¿Cómo nos has conocido? (Google, Instagram, recomendación, barrio...)';
  }
  if (!collectedFields?.experienceLevel) {
    return '¿Qué nivel tienes en fuerza funcional/cross? (principiante, intermedio o avanzado)';
  }
  if (!collectedFields?.activityLevel) {
    return '¿Ahora mismo haces ejercicio? (a diario, 2-3 veces/semana, ocasional o casi nada)';
  }
  if (!collectedFields?.goal) {
    return '¿Cuál es tu objetivo principal ahora? (salud, fuerza, cardio, OCR/Hyrox, BJJ...)';
  }
  if (!collectedFields?.injuryAsked && !collectedFields?.injuryNotes) {
    return '¿Tienes alguna molestia o lesión que debamos tener en cuenta para adaptarte el entreno?';
  }
  if (!collectedFields?.availability) {
    return '¿Qué disponibilidad tienes para entrenar? (días y franja horaria)';
  }
  return null;
}

function messageLooksLikeInfoRequest(text) {
  const lower = String(text || '').toLowerCase();
  return /(informacion|información|precio|precios|horario|horarios|clase|clases|tarifa)/.test(lower);
}

function detectInfoIntent(text) {
  const lower = String(text || '').toLowerCase();
  return {
    asksClasses: /(que clases|qué clases|tipos de clase|tipos de entrenamiento|clases hay)/.test(lower),
    asksPrices: /(precio|precios|tarifa|tarifas|pack|packs|bono|bonos)/.test(lower),
    asksSchedules: /(horario|horarios|que dias|qué días|a que hora|a qué hora)/.test(lower),
    asksRecommendedSchedules: /(horarios.*mobilitat|horarios.*funcional|horarios.*cross|horarios.*strong|horarios.*hibrid)/.test(lower)
  };
}

function normalizeClassName(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractAskedClasses(text) {
  const normalized = normalizeClassName(text);
  const map = [
    { key: 'mobilitat', name: 'Mobilitat' },
    { key: 'funcional', name: 'Funcional' },
    { key: 'cross', name: 'Cross' },
    { key: 'strong', name: 'Strong' },
    { key: 'hibrido', name: 'Híbrido' },
    { key: 'hibrid', name: 'Híbrido' },
    { key: 'sines3', name: 'SINES3' }
  ];
  const out = [];
  for (const item of map) {
    if (normalized.includes(item.key) && !out.includes(item.name)) out.push(item.name);
  }
  return out;
}

function uniqueSlots(schedule, className) {
  const target = normalizeClassName(className);
  const rows = (schedule || []).filter((row) =>
    normalizeClassName(row.class_name).includes(target)
  );
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const hhmm = String(row.start_time || '').slice(0, 5);
    const key = `${row.day_of_week}-${hhmm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ day_of_week: row.day_of_week, time: hhmm });
  }
  return unique.sort((a, b) => a.day_of_week - b.day_of_week || a.time.localeCompare(b.time));
}

function formatScheduleBlock(schedule, classNames) {
  const lines = [];
  for (const name of classNames) {
    const slots = uniqueSlots(schedule, name);
    if (!slots.length) continue;
    lines.push(`**${name}**`);
    for (const slot of slots) {
      lines.push(`- ${DAY_NAME[slot.day_of_week] || `Día ${slot.day_of_week}`} ${slot.time}`);
    }
  }
  return lines.join('\n');
}

function summarizePrices(services) {
  const wanted = ['Pack 4 clases', 'Pack 9 sesiones', 'Pack 12 sesiones', 'Pack ilimitado'];
  const rows = wanted
    .map((name) => (services || []).find((s) => s.name === name))
    .filter(Boolean)
    .map((s) => `${s.name}: ${s.price_text}`);
  return rows.join(' | ');
}

function buildInfoReply({ message, kb }) {
  const intent = detectInfoIntent(message);
  if (!intent.asksClasses && !intent.asksPrices && !intent.asksSchedules) return null;

  const lines = [];
  const askedClasses = extractAskedClasses(message);

  if (intent.asksClasses) {
    lines.push('Claro, resumen rápido:');
    lines.push('**Tipos de clase**: Cross, Funcional, Híbrido, Strong, Mobilitat y SINES3.');
  }

  if (intent.asksPrices) {
    const priceLine = summarizePrices(kb.services);
    if (priceLine) lines.push(`**Packs principales**: ${priceLine}.`);
  }

  if (intent.asksSchedules) {
    if (askedClasses.length) {
      const block = formatScheduleBlock(kb.schedule, askedClasses);
      if (block) {
        lines.push('**Horarios por clase**:');
        lines.push(block);
      }
    } else {
      lines.push('**Horarios**: tenemos clases desde las 07:00 hasta la noche según el día y el tipo.');
    }
  }

  return lines.join('\n\n');
}

function stripEarlyCta(text) {
  return String(text || '')
    .replace(new RegExp(FREE_CLASS_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    .replace(/clase gratis[^.\n!?]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripReferralReminder(text) {
  return String(text || '')
    .replace(/.*10\s*e(?:ur)?\s+de\s+descuento.*$/gim, '')
    .replace(/.*si vienes recomendado.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripQuestionLines(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !trimmed.includes('?') && !trimmed.startsWith('¿');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shortenDiscoverReply(text, maxChars = 300) {
  const raw = String(text || '').trim();
  if (!raw) return raw;
  const normalized = raw.replace(/\s+/g, ' ');
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const short = sentences.slice(0, 2).join(' ');
  if (short.length <= maxChars) return short;
  return `${short.slice(0, maxChars).trim()}...`;
}

function enforceReceptionPolicy({ stage, reply, collectedFields, userMessage }) {
  if (stage !== 'discover') {
    return { reply, collectedFields };
  }
  const baseReply = stripEarlyCta(reply);
  const updatedFields = { ...(collectedFields || {}) };

  const blocks = [baseReply];

  const heardText = String(collectedFields?.howHeard || '').toLowerCase();
  const isReferral = /recomend|amig|socio|socia/.test(heardText);
  const hasReferralReminder = /10\s*e|10\s*eur|descuento/.test(baseReply);
  const alreadyInformed = Boolean(collectedFields?.referralDiscountExplained);
  if (isReferral && hasReferralReminder) {
    updatedFields.referralDiscountExplained = true;
  }
  if (alreadyInformed && hasReferralReminder) {
    blocks[0] = stripReferralReminder(blocks[0]);
  }
  if (isReferral && !hasReferralReminder && !alreadyInformed && !updatedFields.referralDiscountExplained) {
    blocks.push(
      'Si vienes recomendado por un socio/a y finalmente te apuntas, recordad decirnos su nombre: tenéis 10 EUR de descuento ambos al mes siguiente al domiciliar el primer pack.'
    );
    updatedFields.referralDiscountExplained = true;
  }

  const nextQuestion = getNextDiscoveryQuestion(updatedFields);
  if (nextQuestion) {
    blocks[0] = shortenDiscoverReply(stripQuestionLines(blocks[0]));
    if (!updatedFields.howHeard && messageLooksLikeInfoRequest(userMessage)) {
      blocks.push('Te hago primero un resumen rápido y ahora te amplío todo con detalle.');
    }
    blocks.push(nextQuestion);
  }

  return {
    reply: blocks.filter(Boolean).join('\n\n'),
    collectedFields: updatedFields
  };
}

async function generateAssistantReply({ stage, message, history, systemPrompt }) {
  if (!isOpenAiEnabled()) {
    return 'Estoy en modo demo. Ya te puedo orientar, pero para respuestas inteligentes activa OPENAI_API_KEY.';
  }

  const historyMessages = history.map((item) => ({
    role: item.role,
    content: item.content
  }));

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: message }
    ]
  });

  return (
    response.choices?.[0]?.message?.content?.trim() ||
    'Ahora mismo no pude responder bien. Si quieres, te dejo en contacto con recepcion.'
  );
}

async function processChatTurn({ sessionId, message }) {
  const session = await getOrCreateSession(sessionId);
  const kb = await getKnowledgeBase();
  const collectedFields = inferFields({ session, message });
  const draftStage = nextStage({ collectedFields, currentStage: session.last_stage || 'welcome' });

  const recommendation =
    draftStage === 'recommend' || session.last_stage === 'recommend'
      ? recommendPlan({
          goal: collectedFields.goal,
          experienceLevel: collectedFields.experienceLevel || 'unknown',
          availability: collectedFields.availability,
          services: kb.services,
          schedule: kb.schedule,
          trainingBackground: collectedFields.trainingBackground || '',
          activityLevel: collectedFields.activityLevel || '',
          injuryNotes: collectedFields.injuryNotes || ''
        })
      : session.last_recommendation || null;

  const stage = draftStage;
  const leadCaptureRequested = stage === 'close';

  const knowledgeSnapshot = buildKnowledgeSnapshot(kb);
  const playbookText = selectPlaybookSection(kb.playbook, stage);
  const toneExamples = selectToneExamples(kb.toneExamples);
  const history = await getSessionMessages(session.id, 10);
  const factualHint = isFactualQuestion(message) ? 'Pregunta factual detectada.' : 'Pregunta de discovery.';
  const systemPrompt = buildSystemPrompt({
    stage,
    knowledgeSnapshot,
    playbookText,
    toneExamples,
    sessionSummary: JSON.stringify({ ...collectedFields, recommendation, factualHint })
  });

  const rawReply = await generateAssistantReply({
    stage,
    message,
    history,
    systemPrompt
  });
  const deterministicInfoReply = buildInfoReply({ message, kb });
  const stageSanitizedReply = stage === 'close' ? rawReply : stripEarlyCta(rawReply);
  const receptionAligned = enforceReceptionPolicy({
    stage,
    reply: deterministicInfoReply || stageSanitizedReply,
    collectedFields,
    userMessage: message
  });
  const reply = enforceClosePolicy({
    stage,
    reply: receptionAligned.reply,
    collectedFields: receptionAligned.collectedFields
  });
  const finalReply = enforceRecommendationPolicy({
    stage,
    reply,
    recommendation
  });

  await saveMessage({ sessionId: session.id, role: 'user', content: message });
  await saveMessage({ sessionId: session.id, role: 'assistant', content: finalReply });
  await updateSession({
    sessionId: session.id,
    stage,
    collectedFields: receptionAligned.collectedFields,
    recommendation
  });

  return {
    reply: finalReply,
    sessionId: session.id,
    stage,
    leadCaptureRequested,
    collectedFields: receptionAligned.collectedFields,
    recommendation,
    kbSource: kb.source
  };
}

module.exports = {
  processChatTurn
};
