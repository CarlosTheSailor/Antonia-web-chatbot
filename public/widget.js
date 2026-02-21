(function () {
  const scriptTag = document.currentScript;
  const apiBase = scriptTag?.dataset?.chatbotApiBase || 'http://localhost:3000';
  const title = scriptTag?.dataset?.chatbotTitle || 'Asistente';
  const primaryColor = scriptTag?.dataset?.chatbotPrimaryColor || '#0f766e';

  const style = document.createElement('style');
  style.textContent = `
    .cbt-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 56px;
      height: 56px;
      border: none;
      border-radius: 9999px;
      background: ${primaryColor};
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      box-shadow: 0 10px 25px rgba(0,0,0,.2);
      z-index: 9998;
    }

    .cbt-window {
      position: fixed;
      bottom: 88px;
      right: 20px;
      width: min(360px, calc(100vw - 32px));
      height: 500px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,.18);
      overflow: hidden;
      display: none;
      flex-direction: column;
      z-index: 9999;
      font-family: Arial, sans-serif;
    }

    .cbt-window.open {
      display: flex;
    }

    .cbt-header {
      padding: 14px 16px;
      background: ${primaryColor};
      color: #fff;
      font-weight: bold;
    }

    .cbt-messages {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      background: #f7f9fb;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .cbt-msg {
      max-width: 85%;
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.3;
    }

    .cbt-msg.user {
      align-self: flex-end;
      background: ${primaryColor};
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .cbt-msg.bot {
      align-self: flex-start;
      background: #fff;
      color: #111827;
      border-bottom-left-radius: 4px;
      border: 1px solid #e5e7eb;
    }

    .cbt-form {
      display: flex;
      gap: 8px;
      padding: 10px;
      border-top: 1px solid #e5e7eb;
      background: #fff;
    }

    .cbt-input {
      flex: 1;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 10px;
      font-size: 14px;
    }

    .cbt-send {
      border: none;
      border-radius: 10px;
      background: ${primaryColor};
      color: #fff;
      padding: 0 14px;
      cursor: pointer;
      font-size: 14px;
    }
  `;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'cbt-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Abrir chat');
  toggleBtn.innerText = '💬';

  const container = document.createElement('div');
  container.className = 'cbt-window';
  container.innerHTML = `
    <div class="cbt-header">${title}</div>
    <div class="cbt-messages" id="cbt-messages"></div>
    <form class="cbt-form" id="cbt-form">
      <input class="cbt-input" id="cbt-input" placeholder="Escribe tu mensaje" autocomplete="off" />
      <button class="cbt-send" type="submit">Enviar</button>
    </form>
  `;

  document.head.appendChild(style);
  document.body.appendChild(toggleBtn);
  document.body.appendChild(container);

  const messagesEl = container.querySelector('#cbt-messages');
  const formEl = container.querySelector('#cbt-form');
  const inputEl = container.querySelector('#cbt-input');

  function appendMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `cbt-msg ${sender}`;
    msg.innerText = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage(message) {
    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();
      appendMessage('bot', data.reply || 'No pude responder en este momento.');
    } catch (error) {
      appendMessage('bot', 'Error de conexión con el servidor del chatbot.');
      console.error(error);
    }
  }

  toggleBtn.addEventListener('click', function () {
    container.classList.toggle('open');
  });

  formEl.addEventListener('submit', function (event) {
    event.preventDefault();

    const message = inputEl.value.trim();
    if (!message) return;

    appendMessage('user', message);
    inputEl.value = '';
    sendMessage(message);
  });

  appendMessage('bot', 'Hola, soy tu asistente virtual. ¿Cómo te ayudo?');
})();
