const path = require('path');
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_SYSTEM_PROMPT =
  process.env.OPENAI_SYSTEM_PROMPT ||
  'Eres un asistente para una web de negocio. Responde en español de forma clara y breve.';

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function generateDemoReply(message) {
  return `Entendido: "${message}". Configura OPENAI_API_KEY para usar respuestas con IA real.`;
}

async function generateAiReply(message) {
  if (!openai) {
    return generateDemoReply(message);
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.7,
    messages: [
      { role: 'system', content: OPENAI_SYSTEM_PROMPT },
      { role: 'user', content: message }
    ]
  });

  return (
    completion.choices?.[0]?.message?.content?.trim() ||
    'No pude generar una respuesta en este momento.'
  );
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
  }

  try {
    const reply = await generateAiReply(String(message).trim());
    return res.json({
      reply,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al generar respuesta:', error?.message || error);
    return res.status(500).json({
      error: 'No se pudo procesar el mensaje en este momento.'
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Chatbot server activo en http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY no definido: usando modo demo con fallback local.');
  } else {
    console.log(`Modelo OpenAI configurado: ${OPENAI_MODEL}`);
  }
});
