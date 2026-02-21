# Antonia Web Chatbot (WODS)

Chatbot embebible para captar y orientar nuevos clientes de WODS.

## Que incluye (Fase 1)

- Flujo comercial por etapas: `welcome -> discover -> recommend -> close`
- Respuestas con OpenAI usando contexto de conocimiento estructurado
- Persistencia de sesiones, mensajes y leads en Supabase
- Fallback local en memoria/JSON si Supabase no esta configurado
- Widget embebible con estilo WODS y launcher personalizable (cara de Antonia)

## Estructura

- `/Users/carlos/Documents/Codex/web-chatbot-embed/src/server.js`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/src/routes/apiRoutes.js`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/src/controllers/*`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/src/services/*`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/public/widget.js`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/public/chatbot.config.js`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/*.json`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/pricing_catalog_master.json`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/kb_programs.json`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/kb_manifesto.json`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/docs/pricing_discrepancies_2025-01_vs_web.md`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/scripts/sync-pricing-catalog.js`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/scripts/seed-kb.js`
- `/Users/carlos/Documents/Codex/web-chatbot-embed/supabase/schema.sql`

## Variables de entorno

```env
PORT=3000
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

## Setup

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` desde plantilla:

```bash
cp .env.example .env
```

3. Arranca local:

```bash
npm run dev
```

4. Demo:

- [http://localhost:3000/demo.html](http://localhost:3000/demo.html)

## Supabase (Fase 1)

1. Ejecuta el SQL de `/Users/carlos/Documents/Codex/web-chatbot-embed/supabase/schema.sql` en tu proyecto Supabase.
2. Mantiene precios/servicios en `/Users/carlos/Documents/Codex/web-chatbot-embed/data/pricing_catalog_master.json`.
3. Sincroniza a KB del chatbot:

```bash
npm run sync:pricing
```

4. Carga KB:

```bash
npm run seed:kb
```

## Tabla unica de verdad

- Fuente oficial: `https://wods.es/precios/`
- Catalogo maestro: `/Users/carlos/Documents/Codex/web-chatbot-embed/data/pricing_catalog_master.json`
- Matriz de diferencias historicas: `/Users/carlos/Documents/Codex/web-chatbot-embed/docs/pricing_discrepancies_2025-01_vs_web.md`

Reglas operativas:
- `status=active`: se publica en chatbot.
- `status=pending_review`: no se publica como definitivo.
- `status=legacy`: historico, no se usa para venta actual.

## Identidad y filosofia del bot

Para que Antonia respire la cultura WODS, edita estos archivos:

- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/kb_programs.json`
  - Tipos de clase y servicios (CrossWODS, PaleoWODS, Strong, Open Box, extras, etc.).
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/kb_manifesto.json`
  - Valores, principios y filosofia (tecnica, sostenibilidad, comunidad, tono).
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/kb_playbook.json`
  - Guion conversacional por etapas.
- `/Users/carlos/Documents/Codex/web-chatbot-embed/data/kb_tone_examples.json`
  - Ejemplos de tono para modelar respuestas.

## API

### `POST /api/chat`

Request:

```json
{
  "sessionId": "uuid-o-id-estable",
  "message": "texto usuario"
}
```

Response:

```json
{
  "reply": "texto",
  "sessionId": "id",
  "stage": "discover|recommend|close",
  "leadCaptureRequested": false,
  "recommendation": "texto o null",
  "timestamp": "ISO-8601"
}
```

### `POST /api/lead`

Request:

```json
{
  "sessionId": "id",
  "name": "string|null",
  "contact": "string|null",
  "goal": "string|null",
  "availability": "string|null",
  "experienceLevel": "beginner|intermediate|advanced|unknown",
  "notes": "string|null",
  "recommendedPlan": "string|null"
}
```

Response:

```json
{
  "ok": true,
  "leadId": "uuid"
}
```

### `GET /api/config/public`

Devuelve configuracion publica del funnel (sin secretos).

### `GET /health`

Incluye estado OpenAI/Supabase y telemetria basica (`avgChatLatencyMs`, `leadCaptureRate`, etc.).

## Integracion en web

```html
<script src="https://TU-DOMINIO/chatbot.config.js"></script>
<script src="https://TU-DOMINIO/widget.js"></script>
```

## Personalizacion visual

Edita `/Users/carlos/Documents/Codex/web-chatbot-embed/public/chatbot.config.js`:

- `colors`: paleta negro/rojo
- `fonts`: tipografias
- `launcher.imageUrl`: imagen del boton flotante
- `labels`: copies del chat y CTA lead

Para la imagen del launcher usa:

- `/Users/carlos/Documents/Codex/web-chatbot-embed/public/assets/antonia-face.png`

## Fase 2 (RAG)

Pendiente de activar cuando haya suficiente volumen de conversaciones reales. La base actual ya separa KB/servicios para acoplar retrieval vectorial despues.
