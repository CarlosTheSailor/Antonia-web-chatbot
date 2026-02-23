const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const apiRoutes = require('./routes/apiRoutes');
const { isOpenAiEnabled } = require('./lib/openaiClient');
const { isSupabaseEnabled } = require('./lib/supabaseClient');
const { getMetrics } = require('./services/telemetryService');

const app = express();
const PORT = process.env.PORT || 3000;

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function logIntegrationWarnings() {
  if (isEnabled(process.env.AIMHARDER_ENABLED)) {
    const required = ['AIMHARDER_ACCESS_TOKEN', 'AIMHARDER_BOOKING_GUEST_PATH'];
    const missing = required.filter((key) => !String(process.env[key] || '').trim());
    if (missing.length) {
      console.warn(
        `[WARN] Aimharder activo pero faltan variables: ${missing.join(', ')}`
      );
    }
  }

  if (isEnabled(process.env.WHATSAPP_ENABLED)) {
    if (!String(process.env.WHATSAPP_WEBHOOK_URL || '').trim()) {
      console.warn('[WARN] WhatsApp activo pero falta WHATSAPP_WEBHOOK_URL');
    }
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', apiRoutes);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    openai: isOpenAiEnabled(),
    supabase: isSupabaseEnabled(),
    metrics: getMetrics()
  });
});

app.listen(PORT, () => {
  console.log(`Chatbot server activo en http://localhost:${PORT}`);
  console.log(`OpenAI: ${isOpenAiEnabled() ? 'activo' : 'desactivado (modo demo)'}`);
  console.log(`Supabase: ${isSupabaseEnabled() ? 'activo' : 'desactivado (fallback local)'}`);
  logIntegrationWarnings();
});
