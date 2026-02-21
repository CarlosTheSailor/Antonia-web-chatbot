(function () {
  const scriptTag = document.currentScript;
  const globalConfig = window.AntoniaChatbotConfig || {};

  function pickConfig(datasetKey, configPath, fallback) {
    if (scriptTag?.dataset?.[datasetKey]) return scriptTag.dataset[datasetKey];
    return configPath ?? fallback;
  }

  const apiBase = pickConfig('chatbotApiBase', globalConfig.apiBase, 'http://localhost:3000');
  const title = pickConfig('chatbotTitle', globalConfig.title, 'Pregúntale a Antonia');

  const colors = {
    accent: pickConfig('chatbotPrimaryColor', globalConfig.colors?.accent, '#d72323'),
    background: globalConfig.colors?.background || '#0b0b0b',
    surface: globalConfig.colors?.surface || '#151515',
    text: globalConfig.colors?.text || '#f5f5f5',
    mutedText: globalConfig.colors?.mutedText || '#bdbdbd',
    border: globalConfig.colors?.border || '#262626'
  };

  const fonts = {
    heading: globalConfig.fonts?.heading || "'Bebas Neue', 'Arial Narrow', sans-serif",
    body: globalConfig.fonts?.body || "'Montserrat', Arial, sans-serif",
    googleFontUrl:
      globalConfig.fonts?.googleFontUrl ||
      'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;700&display=swap'
  };

  const launcher = {
    imageUrl: pickConfig('chatbotLauncherImage', globalConfig.launcher?.imageUrl, ''),
    fallbackEmoji: globalConfig.launcher?.fallbackEmoji || '🐶',
    size: Number(globalConfig.launcher?.size) || 64,
    borderColor: globalConfig.launcher?.borderColor || colors.accent
  };

  const labels = {
    inputPlaceholder: globalConfig.labels?.inputPlaceholder || 'Escribe tu mensaje',
    sendButton: globalConfig.labels?.sendButton || 'Enviar',
    welcomeMessage:
      globalConfig.labels?.welcomeMessage || 'Hola, soy Antonia. Te ayudo con todo lo del box.',
    leadTitle: globalConfig.labels?.leadTitle || 'Te dejo tu plaza preparada',
    leadCta: globalConfig.labels?.leadCta || 'Dejar contacto'
  };
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const showReset =
    typeof globalConfig.debug?.showReset === 'boolean' ? globalConfig.debug.showReset : isLocalhost;

  const storageKey = 'antonia_chat_session_id';
  let sessionId = localStorage.getItem(storageKey) || null;
  let latestStage = 'welcome';
  let latestUserMessage = '';
  let latestRecommendation = '';
  let leadSent = false;
  let leadSubmitting = false;

  if (fonts.googleFontUrl) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fonts.googleFontUrl;
    document.head.appendChild(link);
  }

  const style = document.createElement('style');
  style.textContent = `
    .cbt-toggle {
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: ${launcher.size}px;
      height: ${launcher.size}px;
      border-radius: 9999px;
      border: 3px solid ${launcher.borderColor};
      background: radial-gradient(circle at 30% 30%, #202020, #050505);
      color: #fff;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.45);
      z-index: 9998;
      overflow: hidden;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }

    .cbt-toggle:hover {
      transform: translateY(-2px) scale(1.02);
      box-shadow: 0 18px 38px rgba(0, 0, 0, 0.52);
    }

    .cbt-toggle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .cbt-window {
      position: fixed;
      right: 20px;
      bottom: ${launcher.size + 30}px;
      width: min(390px, calc(100vw - 24px));
      height: min(610px, calc(100vh - 110px));
      display: none;
      flex-direction: column;
      border-radius: 20px;
      overflow: hidden;
      background: ${colors.background};
      border: 1px solid ${colors.border};
      box-shadow: 0 28px 60px rgba(0, 0, 0, 0.58);
      z-index: 9999;
      font-family: ${fonts.body};
    }

    .cbt-window.open {
      display: flex;
      animation: cbt-pop 140ms ease;
    }

    .cbt-header {
      padding: 12px 14px;
      background: linear-gradient(120deg, ${colors.accent}, #9a1010);
      color: #fff;
      font-family: ${fonts.heading};
      font-size: 28px;
      letter-spacing: 0.3px;
      line-height: 1;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .cbt-header-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cbt-reset {
      border: 1px solid rgba(255, 255, 255, 0.45);
      background: rgba(0, 0, 0, 0.2);
      color: #fff;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0;
      cursor: pointer;
      text-transform: none;
    }

    .cbt-reset.hidden {
      display: none;
    }

    .cbt-messages {
      flex: 1;
      padding: 14px;
      overflow-y: auto;
      background: ${colors.background};
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cbt-msg {
      max-width: 86%;
      padding: 10px 12px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.35;
      border: 1px solid ${colors.border};
      white-space: pre-wrap;
    }

    .cbt-msg.user {
      align-self: flex-end;
      background: ${colors.accent};
      border-color: transparent;
      color: #fff;
      border-bottom-right-radius: 5px;
    }

    .cbt-msg.bot {
      align-self: flex-start;
      background: ${colors.surface};
      color: ${colors.text};
      border-bottom-left-radius: 5px;
    }

    .cbt-typing {
      align-self: flex-start;
      background: ${colors.surface};
      color: ${colors.mutedText};
      border: 1px solid ${colors.border};
      border-radius: 14px;
      border-bottom-left-radius: 5px;
      padding: 10px 12px;
      font-size: 13px;
      display: none;
    }

    .cbt-typing.open {
      display: block;
    }

    .cbt-lead {
      display: none;
      padding: 10px;
      gap: 8px;
      border-top: 1px solid ${colors.border};
      background: #111;
    }

    .cbt-lead.open {
      display: grid;
    }

    .cbt-lead-title {
      color: ${colors.text};
      font-weight: 700;
      font-size: 13px;
    }

    .cbt-field {
      border: 1px solid ${colors.border};
      border-radius: 10px;
      padding: 9px;
      font-size: 13px;
      color: ${colors.text};
      background: #1a1a1a;
      outline: none;
    }

    .cbt-field::placeholder {
      color: ${colors.mutedText};
    }

    .cbt-lead-btn {
      border: none;
      border-radius: 10px;
      background: ${colors.accent};
      color: #fff;
      font-weight: 700;
      padding: 10px;
      cursor: pointer;
    }

    .cbt-form {
      display: flex;
      gap: 8px;
      padding: 10px;
      border-top: 1px solid ${colors.border};
      background: #101010;
    }

    .cbt-input {
      flex: 1;
      border: 1px solid ${colors.border};
      border-radius: 10px;
      padding: 10px;
      font-size: 14px;
      color: ${colors.text};
      background: #1a1a1a;
      outline: none;
    }

    .cbt-input::placeholder {
      color: ${colors.mutedText};
    }

    .cbt-input:focus {
      border-color: ${colors.accent};
    }

    .cbt-send {
      border: none;
      border-radius: 10px;
      background: ${colors.accent};
      color: #fff;
      padding: 0 14px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
    }

    @keyframes cbt-pop {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'cbt-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Abrir chat');
  if (launcher.imageUrl) {
    toggleBtn.innerHTML = `<img src="${launcher.imageUrl}" alt="Abrir chat de Antonia" />`;
  } else {
    toggleBtn.textContent = launcher.fallbackEmoji;
  }

  const container = document.createElement('div');
  container.className = 'cbt-window';
  container.innerHTML = `
    <div class="cbt-header">
      <span class="cbt-header-title">${title}</span>
      <button class="cbt-reset ${showReset ? '' : 'hidden'}" id="cbt-reset" type="button">Reiniciar</button>
    </div>
    <div class="cbt-messages" id="cbt-messages"></div>
    <div class="cbt-typing" id="cbt-typing">Antonia está pensando...</div>
    <div class="cbt-lead" id="cbt-lead">
      <div class="cbt-lead-title">${labels.leadTitle}</div>
      <input class="cbt-field" id="cbt-lead-name" placeholder="Tu nombre (opcional)" />
      <input class="cbt-field" id="cbt-lead-contact" placeholder="WhatsApp o telefono" />
      <button class="cbt-lead-btn" id="cbt-lead-submit" type="button">${labels.leadCta}</button>
    </div>
    <form class="cbt-form" id="cbt-form">
      <input class="cbt-input" id="cbt-input" placeholder="${labels.inputPlaceholder}" autocomplete="off" />
      <button class="cbt-send" type="submit">${labels.sendButton}</button>
    </form>
  `;

  document.head.appendChild(style);
  document.body.appendChild(toggleBtn);
  document.body.appendChild(container);

  const messagesEl = container.querySelector('#cbt-messages');
  const typingEl = container.querySelector('#cbt-typing');
  const formEl = container.querySelector('#cbt-form');
  const inputEl = container.querySelector('#cbt-input');
  const leadEl = container.querySelector('#cbt-lead');
  const leadNameEl = container.querySelector('#cbt-lead-name');
  const leadContactEl = container.querySelector('#cbt-lead-contact');
  const leadSubmitEl = container.querySelector('#cbt-lead-submit');
  const resetEl = container.querySelector('#cbt-reset');

  function appendMessage(sender, text) {
    function escapeHtml(input) {
      return String(input || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatMessage(input) {
      const escaped = escapeHtml(input);
      return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br />');
    }

    const msg = document.createElement('div');
    msg.className = `cbt-msg ${sender}`;
    msg.innerHTML = formatMessage(text);
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setTyping(isTyping) {
    if (isTyping) {
      typingEl.classList.add('open');
    } else {
      typingEl.classList.remove('open');
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function toggleLeadForm(shouldOpen) {
    if (shouldOpen && latestStage === 'close' && !leadSent) {
      leadEl.classList.add('open');
    } else {
      leadEl.classList.remove('open');
    }
  }

  async function sendMessage(message) {
    setTyping(true);
    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId })
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);

      const data = await response.json();
      if (data.sessionId) {
        sessionId = data.sessionId;
        localStorage.setItem(storageKey, sessionId);
      }

      latestStage = data.stage || latestStage;
      latestRecommendation = data.recommendation || latestRecommendation;
      appendMessage('bot', data.reply || 'No pude responder en este momento.');
      toggleLeadForm(Boolean(data.leadCaptureRequested));
    } catch (error) {
      appendMessage('bot', 'Error de conexion con el servidor del chatbot.');
      console.error(error);
    } finally {
      setTyping(false);
    }
  }

  async function submitLead() {
    if (leadSubmitting || leadSent) return;

    const name = leadNameEl.value.trim();
    const contact = leadContactEl.value.trim();

    if (!sessionId) {
      appendMessage('bot', 'Primero necesitamos que me cuentes un poco y luego te pido el contacto.');
      return;
    }

    if (!contact) {
      appendMessage('bot', 'Para avisarte desde recepción necesito tu WhatsApp o teléfono.');
      return;
    }

    try {
      leadSubmitting = true;
      leadSubmitEl.disabled = true;
      leadSubmitEl.textContent = 'Enviando...';

      const response = await fetch(`${apiBase}/api/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          name: name || null,
          contact,
          notes: latestUserMessage || null,
          recommendedPlan: latestRecommendation || null
        })
      });

      if (!response.ok) throw new Error(`Error ${response.status}`);
      leadSent = true;
      toggleLeadForm(false);
      leadNameEl.value = '';
      leadContactEl.value = '';
      appendMessage(
        'bot',
        'Perfecto. Recepción te escribe por WhatsApp para cerrar tu prueba y recomendarte el mejor plan.'
      );
    } catch (error) {
      appendMessage('bot', 'No pude guardar el contacto ahora. Si quieres, vuelve a intentarlo en un momento.');
      console.error(error);
    } finally {
      leadSubmitting = false;
      leadSubmitEl.disabled = false;
      leadSubmitEl.textContent = labels.leadCta;
    }
  }

  function resetConversation() {
    sessionId = null;
    latestStage = 'welcome';
    latestUserMessage = '';
    latestRecommendation = '';
    leadSent = false;
    leadSubmitting = false;
    localStorage.removeItem(storageKey);
    messagesEl.innerHTML = '';
    leadNameEl.value = '';
    leadContactEl.value = '';
    toggleLeadForm(false);
    leadSubmitEl.disabled = false;
    leadSubmitEl.textContent = labels.leadCta;
    appendMessage('bot', labels.welcomeMessage);
    appendMessage(
      'bot',
      'He reiniciado la conversación. Empezamos de cero. Primero: ¿cómo nos has conocido?'
    );
  }

  toggleBtn.addEventListener('click', function () {
    container.classList.toggle('open');
  });

  formEl.addEventListener('submit', function (event) {
    event.preventDefault();
    const message = inputEl.value.trim();
    if (!message) return;
    latestUserMessage = message;
    appendMessage('user', message);
    inputEl.value = '';
    sendMessage(message);
  });

  leadSubmitEl.addEventListener('click', submitLead);
  if (showReset) {
    resetEl.addEventListener('click', resetConversation);
  }

  appendMessage('bot', labels.welcomeMessage);
})();
