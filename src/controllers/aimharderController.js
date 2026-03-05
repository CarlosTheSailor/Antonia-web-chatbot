const { reserveGuestClass } = require('../services/bookingService');

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

async function postSmokeBookingGuest(req, res) {
  if (!isEnabled(process.env.AIMHARDER_SMOKE_ENABLED)) {
    return res.status(403).json({
      ok: false,
      error:
        'Smoke test desactivado. Activa AIMHARDER_SMOKE_ENABLED=true en .env para usar este endpoint.'
    });
  }

  const body = req.body || {};
  if (!body.schedule_id && !body.scheduleId) {
    return res.status(400).json({
      ok: false,
      error: 'schedule_id es obligatorio para la prueba.'
    });
  }
  if (!body.booking_date && !body.bookingDate) {
    return res.status(400).json({
      ok: false,
      error: 'booking_date (YYYY-MM-DD) es obligatorio para la prueba.'
    });
  }
  if (!body.person_id && !body.personId && !process.env.AIMHARDER_PERSON_ID) {
    return res.status(400).json({
      ok: false,
      error: 'person_id es obligatorio (en body o en AIMHARDER_PERSON_ID).'
    });
  }
  if (!body.name) {
    return res.status(400).json({
      ok: false,
      error: 'name es obligatorio para la prueba.'
    });
  }
  if (!body.phone && !body.contact) {
    return res.status(400).json({
      ok: false,
      error: 'phone/contact es obligatorio para la prueba.'
    });
  }

  try {
    const result = await reserveGuestClass({
      payload: {
        schedule_id: body.schedule_id || body.scheduleId,
        bookingDate: body.booking_date || body.bookingDate,
        person_id: body.person_id || body.personId,
        name: body.name,
        phone: body.phone || body.contact,
        contact: body.contact || body.phone,
        email: body.email || null,
        booking_notes: body.booking_notes || body.bookingNotes || ''
      }
    });

    return res.status(200).json({
      ok: true,
      result,
      testedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Error no controlado en smoke test',
      testedAt: new Date().toISOString()
    });
  }
}

module.exports = {
  postSmokeBookingGuest
};

