function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

const DAY_NAME = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo'
};

function parseTimeToMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map((x) => Number(x));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function parseAvailability(availability) {
  const text = normalize(availability);
  const days = [];
  if (text.includes('lunes')) days.push(1);
  if (text.includes('martes')) days.push(2);
  if (text.includes('miercoles')) days.push(3);
  if (text.includes('jueves')) days.push(4);
  if (text.includes('viernes')) days.push(5);
  if (text.includes('sabado')) days.push(6);
  if (text.includes('domingo')) days.push(7);

  const windows = [];
  if (text.includes('manana') || text.includes('mañana')) windows.push({ from: 360, to: 720 });
  if (text.includes('mediodia')) windows.push({ from: 720, to: 960 });
  if (text.includes('tarde')) windows.push({ from: 960, to: 1200 });
  if (text.includes('noche')) windows.push({ from: 1200, to: 1440 });
  if (text.includes('+20')) windows.push({ from: 1200, to: 1440 });

  return { days, windows, raw: text };
}

function includesAny(text, keywords) {
  return keywords.some((word) => text.includes(word));
}

function classBenefits(className, goalText, injuryText) {
  const c = normalize(className);
  const goal = normalize(goalText);
  const injury = normalize(injuryText);

  if (c.includes('funcional')) {
    return injury
      ? 'Te permite coger base y mejorar condición física sin forzar, con adaptaciones por molestias.'
      : 'Te da base técnica y cardio para ponerte en forma sin entrar de golpe en lo más duro.';
  }
  if (c.includes('mobilitat')) {
    return 'Te ayuda a moverte mejor, prevenir molestias y ganar rango de movimiento para entrenar con seguridad.';
  }
  if (c.includes('sines3')) {
    return 'Es ideal para empezar suave: control de respiración, ritmo estable y cero agobios.';
  }
  if (c.includes('hibrido')) {
    return 'Combina fuerza y acondicionamiento, muy buena opción para progresar de forma equilibrada.';
  }
  if (c.includes('strong')) {
    return goal.includes('fuerza')
      ? 'Te viene genial para tu objetivo de fuerza: técnica de básicos y progresión real.'
      : 'Refuerza fuerza general y técnica con barra para que mejores en el resto de clases.';
  }
  if (c.includes('cross')) {
    return 'Si ya tienes base o quieres mas intensidad, te da un salto en rendimiento con trabajo completo.';
  }
  return 'Encaja por nivel y horario, y te la podemos adaptar desde el primer dia.';
}

function formatSlot(slot) {
  const time = String(slot.start_time || '').slice(0, 5);
  return `${DAY_NAME[slot.day_of_week] || `Dia ${slot.day_of_week}`} ${time} ${slot.class_name}`;
}

function slotMatchesAvailability(slot, availability) {
  const slotMinutes = parseTimeToMinutes(slot.start_time);
  const dayMatches = !availability.days.length || availability.days.includes(slot.day_of_week);
  const timeMatches =
    !availability.windows.length ||
    availability.windows.some((window) => slotMinutes >= window.from && slotMinutes < window.to);
  return dayMatches && timeMatches;
}

function buildFridayWarning(recommendedSlots, availabilityText) {
  const hasFriday = recommendedSlots.some((slot) => slot.day_of_week === 5);
  if (!hasFriday) return '';
  if (!includesAny(availabilityText, ['viernes', 'solo viernes'])) return '';
  return 'Si vienes en viernes, te avisamos de que suele ser el día más cañero, aunque siempre te adaptamos el entreno.';
}

function scoreClassName({
  className,
  goalText,
  level,
  activityText,
  trainingBackgroundText,
  injuryText
}) {
  const c = normalize(className);
  let score = 0;

  const beginnerLike = level === 'beginner' || level === 'unknown';
  const lowActivity = includesAny(activityText, ['sedent', 'nunca', 'ocasional']);
  const hasInjury = Boolean(injuryText) && !includesAny(injuryText, ['no', 'ninguna', 'ninguno']);
  const crossBg = includesAny(trainingBackgroundText, ['crossfit', 'box', 'haltero']);

  if (includesAny(goalText, ['hyrox', 'ocr', 'obstac', 'cardio'])) {
    if (c.includes('funcional')) score += 4;
    if (c.includes('hibrido')) score += 3;
    if (c.includes('cross')) score += 2;
  }

  if (includesAny(goalText, ['fuerza', 'musculo', 'músculo'])) {
    if (c.includes('strong')) score += 4;
    if (c.includes('cross')) score += 3;
  }

  if (includesAny(goalText, ['movilidad', 'mobilitat', 'dolor', 'salud'])) {
    if (c.includes('mobilitat')) score += 4;
    if (c.includes('funcional')) score += 2;
    if (c.includes('sines3')) score += 2;
  }

  if (beginnerLike || lowActivity) {
    if (c.includes('funcional')) score += 3;
    if (c.includes('sines3')) score += 3;
    if (c.includes('mobilitat')) score += 2;
    if (c.includes('hibrido')) score += 2;
    if (c.includes('cross')) score -= 2;
  }

  if (crossBg || level === 'advanced' || level === 'intermediate') {
    if (c.includes('cross')) score += 3;
    if (c.includes('strong')) score += 2;
  }

  if (hasInjury) {
    if (c.includes('mobilitat')) score += 4;
    if (c.includes('funcional')) score += 2;
    if (c.includes('cross')) score -= 2;
  }

  if (score === 0) {
    if (c.includes('funcional')) score += 2;
    if (c.includes('hibrido')) score += 1;
  }

  return score;
}

function buildRecommendationText({ topChoices, fridayWarning }) {
  if (!topChoices.length) {
    return 'Por lo que me cuentas, te recomiendo empezar con una clase de prueba para ajustarte bien plan y nivel.';
  }

  const selected = topChoices.slice(0, 2);
  const blocks = ['Con tu perfil, te encajan sobre todo estas dos:'];
  for (const choice of selected) {
    blocks.push(`- **${choice.class_name}**: ${choice.benefit}`);
  }
  if (selected.length >= 2) {
    blocks.push('Horarios para probar:');
    for (const choice of selected) {
      blocks.push(`- ${formatSlot(choice.slot)}`);
    }
    blocks.push('¿Con cuál te quedas y te la reservo?');
  }
  if (fridayWarning) blocks.push(fridayWarning);
  blocks.push('Cuando elijas, te cierro la clase gratis de bienvenida.');
  return blocks.join('\n');
}

function recommendPlan({
  goal,
  experienceLevel,
  availability,
  services,
  schedule,
  trainingBackground,
  activityLevel,
  injuryNotes
}) {
  const goalText = normalize(goal);
  const level = normalize(experienceLevel);
  const availabilityText = normalize(availability);
  const backgroundText = normalize(trainingBackground);
  const activityText = normalize(activityLevel);
  const injuryText = normalize(injuryNotes);
  const availabilityFilter = parseAvailability(availability);

  const hasService = (needle) => services.some((service) => normalize(service.name).includes(needle));
  const scheduleRows = Array.isArray(schedule) ? schedule : [];

  if (includesAny(goalText, ['bjj', 'jiu', 'grappling', 'brasilian'])) {
    return 'Por lo que buscas, te encaja Team BJJ. Te explico condiciones y, si quieres, cerramos clase de prueba en una franja que te vaya bien.';
  }
  if (includesAny(goalText, ['calistenia'])) {
    return 'Para calistenia te puede encajar Team Barras. Si te va, te cuento condiciones y vemos hueco de prueba.';
  }
  if (includesAny(goalText, ['haltero', 'halterofilia'])) {
    return 'Si te interesa barra y técnica olímpica, Team Haltero es buena opción. Te puedo orientar según horario y nivel.';
  }

  let candidateSlots = scheduleRows.filter((slot) => slotMatchesAvailability(slot, availabilityFilter));
  if (!candidateSlots.length) candidateSlots = scheduleRows.slice();

  const avoidFridayForBeginners =
    (level === 'beginner' || level === 'unknown') && !includesAny(backgroundText, ['crossfit', 'haltero']);
  let chosen = candidateSlots;
  if (avoidFridayForBeginners) {
    const nonFriday = chosen.filter((slot) => slot.day_of_week !== 5);
    if (nonFriday.length) chosen = nonFriday;
  }

  const classBestSlot = new Map();
  for (const slot of chosen) {
    const cname = slot.class_name;
    const score = scoreClassName({
      className: cname,
      goalText,
      level,
      activityText,
      trainingBackgroundText: backgroundText,
      injuryText
    });
    const current = classBestSlot.get(cname);
    if (!current || score > current.score) {
      classBestSlot.set(cname, { class_name: cname, slot, score });
    }
  }

  const ranked = Array.from(classBestSlot.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => ({
      ...row,
      benefit: classBenefits(row.class_name, goalText, injuryText)
    }));

  const fridayWarning = buildFridayWarning(
    ranked.map((x) => x.slot),
    availabilityText
  );

  if (ranked.length) {
    return buildRecommendationText({ topChoices: ranked, fridayWarning });
  }

  if (goalText.includes('perder') || goalText.includes('adelgazar')) {
    if (hasService('fundamentals')) {
      return 'Te recomiendo empezar con Fundamentals + 2 clases por semana para progresar con tecnica y constancia.';
    }
    return 'Te recomiendo empezar con funcional/fuerza y ajustar a 2-3 clases semanales para mantener constancia.';
  }

  return 'Te recomiendo una clase de prueba para evaluarte y elegir el plan que mejor te encaje.';
}

module.exports = {
  recommendPlan
};
