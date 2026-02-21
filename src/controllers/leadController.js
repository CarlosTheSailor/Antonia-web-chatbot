const { createLead } = require('../services/leadService');
const { trackLead } = require('../services/telemetryService');

async function postLead(req, res) {
  const payload = req.body || {};

  if (!payload.sessionId) {
    trackLead({ ok: false, created: false });
    return res.status(400).json({ error: 'El campo "sessionId" es obligatorio.' });
  }

  if (!payload.contact || !String(payload.contact).trim()) {
    trackLead({ ok: false, created: false });
    return res.status(400).json({ error: 'El campo "contact" es obligatorio para captar lead.' });
  }

  try {
    const lead = await createLead(payload);
    trackLead({ ok: true, created: true });
    return res.status(201).json({ ok: true, leadId: lead.id });
  } catch (error) {
    console.error('Error en /api/lead:', error?.message || error);
    trackLead({ ok: false, created: false });
    return res.status(500).json({ error: 'No se pudo guardar el lead en este momento.' });
  }
}

module.exports = {
  postLead
};
