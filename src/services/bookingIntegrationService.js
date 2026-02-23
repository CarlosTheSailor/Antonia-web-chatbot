const { reserveGuestClass } = require('./bookingService');

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${responseText ? ` - ${responseText}` : ''}`);
  }

  return responseText;
}

function shouldRun(payload) {
  const bookingConfirmed = Boolean(payload?.bookingConfirmed);
  const hasContact = Boolean(clean(payload?.contact));
  return bookingConfirmed && hasContact;
}

async function sendWhatsappCoachNotification(payload, leadId, bookingResult) {
  if (!isEnabled(process.env.WHATSAPP_ENABLED)) {
    return { provider: 'whatsapp', enabled: false, sent: false, reason: 'disabled' };
  }

  const webhookUrl = clean(process.env.WHATSAPP_WEBHOOK_URL);
  if (!webhookUrl) {
    return { provider: 'whatsapp', enabled: true, sent: false, reason: 'missing_webhook_url' };
  }

  const token = clean(process.env.WHATSAPP_API_TOKEN);
  const groupId = clean(process.env.WHATSAPP_COACH_GROUP_ID);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const name = clean(payload.name) || 'Sin nombre';
  const contact = clean(payload.contact) || 'Sin contacto';
  const availability = clean(payload.availability) || 'Sin disponibilidad';
  const goal = clean(payload.goal) || 'Sin objetivo';
  const bookingStatus = clean(bookingResult?.status) || 'unknown';
  const bookingId = clean(bookingResult?.bookingId);
  const actionRequired = bookingStatus === 'pending_manual' || bookingStatus === 'failed_external';

  await postJson(webhookUrl, headers, {
    event: 'new_trial_booking',
    source: 'antonia_chatbot',
    leadId,
    createdAt: new Date().toISOString(),
    groupId,
    message:
      `Nueva reserva desde Antonia.\n` +
      `Nombre: ${name}\n` +
      `Contacto: ${contact}\n` +
      `Objetivo: ${goal}\n` +
      `Disponibilidad: ${availability}\n` +
      `Estado Aimharder: ${bookingStatus}` +
      `${bookingId ? `\nBooking ID: ${bookingId}` : ''}` +
      `${actionRequired ? '\nAcción: revisar y cerrar manualmente en recepción.' : ''}`,
    booking: {
      bookingDay: clean(payload.bookingDay),
      bookingTime: clean(payload.bookingTime),
      bookingStatus,
      bookingId
    },
    raw: {
      sessionId: clean(payload.sessionId),
      recommendedPlan: clean(payload.recommendedPlan),
      aimharderReason: clean(bookingResult?.reason),
      aimharderMessage: clean(bookingResult?.message)
    }
  });

  return { provider: 'whatsapp', enabled: true, sent: true };
}

async function runPostBookingIntegrations({ payload, leadId }) {
  if (!shouldRun(payload)) {
    return {
      skipped: true,
      reason: 'booking_not_confirmed_or_contact_missing',
      booking: {
        status: 'pending_manual',
        reason: 'booking_not_confirmed_or_contact_missing'
      },
      providers: []
    };
  }

  const booking = await reserveGuestClass({ payload });
  const providers = [];

  try {
    providers.push(await sendWhatsappCoachNotification(payload, leadId, booking));
  } catch (error) {
    providers.push({
      provider: 'whatsapp',
      enabled: true,
      sent: false,
      reason: 'request_failed',
      error: error.message
    });
  }

  return {
    skipped: false,
    booking,
    providers
  };
}

module.exports = {
  runPostBookingIntegrations
};
