// Chat Widget - Floating bubble + overlay chat
(function() {
  let isOpen = false;
  let isWaiting = false;
  let conversationHistory = [];
  let userRole = 'teacher';

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .chat-bubble {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #59d2ff, #092b50);
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(9, 43, 80, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      z-index: 9998;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .chat-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(9, 43, 80, 0.5);
    }
    .chat-bubble.open {
      transform: scale(0.9);
    }

    .chat-overlay {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 380px;
      height: 520px;
      max-height: calc(100vh - 120px);
      max-width: calc(100vw - 48px);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      z-index: 9999;
      overflow: hidden;
      animation: chatSlideUp 0.25s ease-out;
    }
    .chat-overlay.visible {
      display: flex;
    }
    @keyframes chatSlideUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .chat-overlay-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: linear-gradient(135deg, #59d2ff, #092b50);
      color: white;
    }
    .chat-overlay-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chat-overlay-header-actions {
      display: flex;
      gap: 8px;
    }
    .chat-overlay-header button {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 30px;
      height: 30px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chat-overlay-header button:hover {
      background: rgba(255,255,255,0.3);
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }

    .chat-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.45;
      word-wrap: break-word;
    }
    .chat-msg-user {
      align-self: flex-end;
      background: #092b50;
      color: white;
      border-bottom-right-radius: 4px;
    }
    .chat-msg-assistant {
      align-self: flex-start;
      background: #f3f4f6;
      color: #1f2937;
      border-bottom-left-radius: 4px;
      border: 1px solid #e5e7eb;
    }
    .chat-msg-error {
      align-self: center;
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
      font-size: 0.82rem;
      text-align: center;
    }

    .chat-msg-typing {
      align-self: flex-start;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      padding: 12px 16px;
      border-radius: 12px;
      border-bottom-left-radius: 4px;
    }
    .chat-typing-dots {
      display: flex;
      gap: 4px;
    }
    .chat-typing-dots span {
      width: 7px;
      height: 7px;
      background: #9ca3af;
      border-radius: 50%;
      animation: chatTyping 1.4s infinite;
    }
    .chat-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .chat-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes chatTyping {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-3px); opacity: 1; }
    }

    .chat-welcome {
      text-align: center;
      padding: 20px 16px;
      color: #6b7280;
    }
    .chat-welcome h4 {
      margin: 0 0 6px 0;
      color: #1f2937;
      font-size: 1rem;
    }
    .chat-welcome p {
      margin: 0;
      font-size: 0.85rem;
    }
    .chat-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-top: 12px;
    }
    .chat-suggestion {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 6px 12px;
      font-size: 0.78rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .chat-suggestion:hover {
      border-color: #092b50;
      background: rgba(9, 43, 80, 0.04);
    }

    .chat-input-area {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid #e5e7eb;
      background: #fafafa;
    }
    .chat-input-area textarea {
      flex: 1;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 0.9rem;
      resize: none;
      min-height: 38px;
      max-height: 80px;
      font-family: inherit;
      line-height: 1.4;
      outline: none;
    }
    .chat-input-area textarea:focus {
      border-color: #092b50;
      box-shadow: 0 0 0 2px rgba(9, 43, 80, 0.1);
    }
    .chat-send-btn {
      background: #092b50;
      color: white;
      border: none;
      border-radius: 8px;
      width: 38px;
      height: 38px;
      cursor: pointer;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }
    .chat-send-btn:hover:not(:disabled) { opacity: 0.85; }
    .chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .chat-approval-card {
      background: #fffbeb;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      padding: 10px;
      margin-top: 6px;
      font-size: 0.82rem;
    }
    .chat-approval-card p { margin: 0 0 8px 0; font-weight: 500; }
    .chat-approval-actions { display: flex; gap: 6px; }
    .chat-approve-btn {
      background: #16a34a; color: white; border: none;
      padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8rem;
    }
    .chat-reject-btn {
      background: #dc2626; color: white; border: none;
      padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8rem;
    }

    @media (max-width: 440px) {
      .chat-overlay {
        bottom: 0;
        right: 0;
        width: 100vw;
        height: 100vh;
        max-height: 100vh;
        max-width: 100vw;
        border-radius: 0;
      }
      .chat-bubble {
        bottom: 16px;
        right: 16px;
        width: 54px;
        height: 54px;
        font-size: 24px;
      }
    }
  `;
  document.head.appendChild(style);

  // Create bubble button
  const bubble = document.createElement('button');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = '✦';
  bubble.title = 'Asistente de clase';
  bubble.onclick = toggleChat;
  document.body.appendChild(bubble);

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'chat-overlay';
  overlay.id = 'chatOverlay';
  overlay.innerHTML = `
    <div class="chat-overlay-header">
      <h3>✦ Asistente Profe</h3>
      <div class="chat-overlay-header-actions">
        <button onclick="window.chatWidget.newConversation()" title="Nueva conversación">🔄</button>
        <button onclick="window.chatWidget.toggle()" title="Cerrar">✕</button>
      </div>
    </div>
    <div class="chat-messages" id="chatWidgetMessages">
      <div class="chat-welcome" id="chatWelcome">
        <h4>¡Hola! Soy tu asistente</h4>
        <p>Pregúntame sobre horarios, materiales o permisos.</p>
        <div class="chat-suggestions">
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Qué clases tengo hoy?')">Mis clases hoy</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Cuántos días de vacaciones me quedan?')">Vacaciones</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('Busca materiales para B1 sobre comida')">Buscar materiales</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Cuántas horas he trabajado este mes?')">Horas trabajadas</div>
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <textarea id="chatWidgetInput" placeholder="Escribe tu pregunta..." rows="1" maxlength="2000"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.chatWidget.send()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
      <button class="chat-send-btn" id="chatWidgetSendBtn" onclick="window.chatWidget.send()">➤</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Detect user role on load — only show for test account during testing
  (async function detectRole() {
    try {
      const { data: { session } } = await db.auth.getSession();
      if (session) {
        const { data: profile } = await db.from('profiles').select('role, email').eq('id', session.user.id).single();
        if (profile) {
          userRole = profile.role;
          // TEST MODE: only show bubble for test account
          const TEST_EMAILS = ['danielbaudy@googlemail.com'];
          if (!TEST_EMAILS.includes(profile.email)) {
            bubble.style.display = 'none';
          }
        }
      }
    } catch(e) {}
  })();

  function toggleChat() {
    isOpen = !isOpen;
    overlay.classList.toggle('visible', isOpen);
    bubble.classList.toggle('open', isOpen);
    if (isOpen) {
      document.getElementById('chatWidgetInput').focus();
    }
  }

  function newConversation() {
    conversationHistory = [];
    const container = document.getElementById('chatWidgetMessages');
    container.innerHTML = `
      <div class="chat-welcome" id="chatWelcome">
        <h4>¡Hola! Soy tu asistente</h4>
        <p>Pregúntame sobre horarios, materiales o permisos.</p>
        <div class="chat-suggestions">
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Qué clases tengo hoy?')">Mis clases hoy</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Cuántos días de vacaciones me quedan?')">Vacaciones</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('Busca materiales para B1 sobre comida')">Buscar materiales</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Cuántas horas he trabajado este mes?')">Horas trabajadas</div>
        </div>
      </div>
    `;
  }

  function sendSuggestion(text) {
    document.getElementById('chatWidgetInput').value = text;
    send();
  }

  async function send() {
    const input = document.getElementById('chatWidgetInput');
    const message = input.value.trim();
    if (!message || isWaiting) return;

    // Remove welcome
    const welcome = document.getElementById('chatWelcome');
    if (welcome) welcome.remove();

    addMsg(message, 'user');
    input.value = '';
    input.style.height = 'auto';

    isWaiting = true;
    document.getElementById('chatWidgetSendBtn').disabled = true;
    showTyping();

    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) {
        removeTyping();
        addMsg('Sesión expirada. Inicia sesión de nuevo.', 'error');
        isWaiting = false;
        document.getElementById('chatWidgetSendBtn').disabled = false;
        return;
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/class-helper`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ message, history: conversationHistory }),
        }
      );

      removeTyping();

      if (response.status === 429) {
        addMsg('Límite diario alcanzado (50 mensajes). Inténtalo mañana.', 'error');
      } else if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        addMsg(err.error || 'Asistente no disponible.', 'error');
      } else {
        const data = await response.json();
        conversationHistory.push({ role: 'user', content: message });
        conversationHistory.push({ role: 'assistant', content: data.response });
        if (conversationHistory.length > 10) {
          conversationHistory = conversationHistory.slice(-10);
        }
        addMsg(data.response, 'assistant');
        if (data.pending_approval) {
          addApproval(data.pending_approval);
        }
      }
    } catch (e) {
      removeTyping();
      addMsg('Error de conexión.', 'error');
    }

    isWaiting = false;
    document.getElementById('chatWidgetSendBtn').disabled = false;
  }

  function addMsg(text, type) {
    const container = document.getElementById('chatWidgetMessages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${type}`;
    if (type === 'assistant') {
      div.innerHTML = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    } else {
      div.textContent = text;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addApproval(proposal) {
    const container = document.getElementById('chatWidgetMessages');
    const div = document.createElement('div');
    div.className = 'chat-approval-card';
    div.innerHTML = `
      <p>⚠️ ${proposal.description || 'Cambio propuesto'}</p>
      <div class="chat-approval-actions">
        <button class="chat-approve-btn" onclick="this.closest('.chat-approval-card').innerHTML='✅ Aprobado'">✓ Aprobar</button>
        <button class="chat-reject-btn" onclick="this.closest('.chat-approval-card').innerHTML='❌ Rechazado'">✗ Rechazar</button>
      </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    const container = document.getElementById('chatWidgetMessages');
    const div = document.createElement('div');
    div.className = 'chat-msg-typing';
    div.id = 'chatWidgetTyping';
    div.innerHTML = '<div class="chat-typing-dots"><span></span><span></span><span></span></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('chatWidgetTyping');
    if (el) el.remove();
  }

  // Expose API
  window.chatWidget = { toggle: toggleChat, send, sendSuggestion, newConversation };
})();
