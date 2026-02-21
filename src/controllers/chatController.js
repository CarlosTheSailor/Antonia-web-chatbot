const { processChatTurn } = require('../services/conversationService');
const { trackChat } = require('../services/telemetryService');

async function postChat(req, res) {
  const started = Date.now();
  const { sessionId, message } = req.body || {};

  if (!message || !String(message).trim()) {
    trackChat({ ok: false, latencyMs: Date.now() - started });
    return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
  }

  try {
    const result = await processChatTurn({
      sessionId: sessionId || null,
      message: String(message).trim()
    });

    trackChat({ ok: true, latencyMs: Date.now() - started });
    return res.json({
      reply: result.reply,
      sessionId: result.sessionId,
      stage: result.stage,
      leadCaptureRequested: result.leadCaptureRequested,
      recommendation: result.recommendation,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error en /api/chat:', error?.message || error);
    trackChat({ ok: false, latencyMs: Date.now() - started });
    return res.status(500).json({
      error: 'No se pudo procesar el mensaje en este momento.'
    });
  }
}

module.exports = {
  postChat
};
