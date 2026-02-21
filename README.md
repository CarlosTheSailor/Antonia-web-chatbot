# Web Chatbot Embebible

Proyecto base para integrar un chatbot en una web mediante un script (`widget.js`) + API backend.

## Stack

- Node.js + Express
- OpenAI API (backend)
- Widget JavaScript vanilla (embebible)

## Estructura

- `src/server.js`: servidor API y archivos estáticos
- `public/widget.js`: widget de chat embebible
- `public/demo.html`: página de ejemplo de integración

## Ejecutar en local

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo de entorno:

```bash
cp .env.example .env
```

3. Edita `.env` y coloca tu API key de OpenAI:

```env
OPENAI_API_KEY=sk-...
```

4. Inicia el proyecto:

```bash
npm run dev
```

5. Abre la demo:

- [http://localhost:3000/demo.html](http://localhost:3000/demo.html)

## Integración en tu web

Añade este script en tu HTML:

```html
<script
  src="https://TU-DOMINIO/widget.js"
  data-chatbot-api-base="https://TU-DOMINIO"
  data-chatbot-title="Asistente"
  data-chatbot-primary-color="#0f766e"
></script>
```

## API

### POST `/api/chat`

Body:

```json
{
  "message": "Hola"
}
```

Respuesta:

```json
{
  "reply": "...respuesta del modelo...",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Notas:
- Si `OPENAI_API_KEY` no está configurado, el backend responde en modo demo (fallback).
- Puedes cambiar el modelo con `OPENAI_MODEL` y el comportamiento con `OPENAI_SYSTEM_PROMPT`.

## Variables de entorno

```env
PORT=3000
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_SYSTEM_PROMPT=Eres un asistente para una web de negocio. Responde en español de forma clara y breve.
```

## Subir a GitHub

Dentro de esta carpeta (`web-chatbot-embed`):

```bash
git init
git add .
git commit -m "feat: chatbot embebible con OpenAI"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```
