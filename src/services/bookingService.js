const {
  isAimharderEnabled,
  bookingGuestPath,
  request
} = require('../lib/aimharderClient');

const DAY_MAP = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  domingo: 7
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toDayNumber(dayText) {
  const normalized = normalizeText(dayText);
  return DAY_MAP[normalized] || null;
}

function extractDayAndTime(text) {
  const normalized = normalizeText(text);
  const dayMatch = normalized.match(/lunes|martes|miercoles|jueves|viernes|sabado|domingo/);
  const hourMatch = normalized.match(/\b([01]?\d|2[0-3])(:[0-5]\d)?\b/);
  if (!dayMatch || !hourMatch) return null;
  const day = dayMatch[0];
  const hh = String(hourMatch[1]).padStart(2, '0');
  const mm = hourMatch[2] || ':00';
  return { dayText: day, dayOfWeek: toDayNumber(day), time: `${hh}${mm}` };
}

function splitName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    name: parts[0] || null,
    firstSurname: parts[1] || null,
    secondSurname: parts.slice(2).join(' ') || null
  };
}

function parseScheduleMap() {
  const raw = process.env.AIMHARDER_SCHEDULE_MAP_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function resolveScheduleId({ payload }) {
  const explicit = Number(payload?.schedule_id || payload?.scheduleId || 0);
  if (explicit > 0) return explicit;

  const slot = extractDayAndTime(payload?.availability || '');
  if (!slot) return null;
  const className = normalizeText(payload?.className || payload?.recommendedClass || '');

  const scheduleMap = parseScheduleMap();
  const keyWithClass = `${slot.dayOfWeek}|${slot.time}|${className}`;
  const keyWithoutClass = `${slot.dayOfWeek}|${slot.time}`;
  const value = scheduleMap[keyWithClass] || scheduleMap[keyWithoutClass];
  const parsed = Number(value || 0);
  return parsed > 0 ? parsed : null;
}

function resolveBookingDate(payload) {
  const manual = String(payload?.bookingDate || payload?.booking_date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(manual)) return manual;

  const slot = extractDayAndTime(payload?.availability || '');
  if (!slot?.dayOfWeek) return null;

  const now = new Date();
  const currentJsDay = now.getDay() === 0 ? 7 : now.getDay();
  const target = slot.dayOfWeek;
  let delta = target - currentJsDay;
  if (delta < 0) delta += 7;

  const date = new Date(now);
  date.setDate(now.getDate() + delta);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPersonId(payload) {
  return (
    String(payload?.person_id || payload?.personId || process.env.AIMHARDER_PERSON_ID || '').trim() || null
  );
}

function getBusinessMessage(data) {
  const raw = data?.error?.message || data?.message || '';
  return String(raw || '').trim() || null;
}

async function reserveGuestClass({ payload }) {
  if (!isAimharderEnabled()) {
    return { status: 'pending_manual', provider: 'aimharder', reason: 'aimharder_disabled' };
  }

  const scheduleId = resolveScheduleId({ payload });
  if (!scheduleId) {
    return { status: 'pending_manual', provider: 'aimharder', reason: 'schedule_id_not_resolved' };
  }

  const bookingDate = resolveBookingDate(payload);
  if (!bookingDate) {
    return { status: 'pending_manual', provider: 'aimharder', reason: 'booking_date_not_resolved' };
  }

  const personId = getPersonId(payload);
  if (!personId) {
    return { status: 'pending_manual', provider: 'aimharder', reason: 'person_id_missing' };
  }

  const { name, firstSurname, secondSurname } = splitName(payload?.name);
  const body = {
    schedule_id: scheduleId,
    booking_date: bookingDate,
    person_id: personId,
    name,
    first_surname: firstSurname,
    second_surname: secondSurname,
    email: payload?.email || null,
    phone: payload?.contact || payload?.phone || null,
    booking_notes: payload?.booking_notes || payload?.bookingNotes || ''
  };

  const response = await request({
    path: bookingGuestPath(),
    method: 'POST',
    body
  });

  if (response.ok) {
    const bookingId = response?.data?.data?.id || response?.data?.id || null;
    return {
      status: 'reserved_external',
      provider: 'aimharder',
      bookingId,
      scheduleId,
      bookingDate
    };
  }

  if (response.status === 422) {
    return {
      status: 'pending_manual',
      provider: 'aimharder',
      reason: 'business_rule_422',
      message: getBusinessMessage(response.data)
    };
  }

  if (response.status === 400) {
    return {
      status: 'pending_manual',
      provider: 'aimharder',
      reason: 'validation_400',
      message: getBusinessMessage(response.data)
    };
  }

  return {
    status: 'failed_external',
    provider: 'aimharder',
    reason: response.code || 'unknown_error',
    message: getBusinessMessage(response.data),
    httpStatus: response.status || null
  };
}

module.exports = {
  reserveGuestClass
};

