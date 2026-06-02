// Chat Widget - Floating bubble + overlay chat
(function() {
  let isOpen = false;
  let isWaiting = false;
  let conversationHistory = [];
  let userRole = 'teacher';
  let sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
  let lastLogId = null; // Track last response for feedback

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
      background: conic-gradient(from 45deg, #59d2ff, #6366f1, #a855f7, #ec4899, #f59e0b, #10b981, #59d2ff);
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      z-index: 9998;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .chat-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.5);
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
    @media (max-width: 500px) {
      .chat-overlay {
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100dvh;
        max-height: 100dvh;
        max-width: 100%;
        border-radius: 0;
      }
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
      background: #092b50;
      color: white;
      border-bottom: 3px solid;
      border-image: linear-gradient(90deg, #59d2ff, #6366f1, #a855f7, #ec4899, #f59e0b, #10b981) 1;
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
      position: relative;
    }
    .chat-feedback {
      display: flex;
      gap: 4px;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid #e5e7eb;
    }
    .chat-feedback button {
      background: none;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all 0.15s;
      color: #9ca3af;
      line-height: 1;
    }
    .chat-feedback button:hover {
      border-color: #6b7280;
      color: #6b7280;
    }
    .chat-feedback-thanks {
      font-size: 0.72rem;
      color: #9ca3af;
      margin-top: 6px;
      padding-top: 4px;
      animation: chatFeedbackFade 2s forwards;
    }
    @keyframes chatFeedbackFade {
      0% { opacity: 1; }
      70% { opacity: 1; }
      100% { opacity: 0; height: 0; margin: 0; padding: 0; overflow: hidden; }
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
      background: linear-gradient(135deg, #59d2ff, #6366f1, #a855f7, #ec4899, #f59e0b, #10b981) border-box;
      color: white;
      border: 2px solid transparent;
      border-radius: 8px;
      width: 38px;
      height: 38px;
      cursor: pointer;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
      position: relative;
    }
    .chat-send-btn::before {
      content: '';
      position: absolute;
      inset: 2px;
      background: #092b50;
      border-radius: 6px;
      z-index: 0;
    }
    .chat-send-btn span {
      position: relative;
      z-index: 1;
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

    .chat-bubble-tooltip {
      position: fixed;
      bottom: 90px;
      right: 24px;
      background: #092b50;
      color: white;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 0.82rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9997;
      animation: tooltipFadeIn 0.3s ease-out, tooltipFadeOut 0.5s ease-in 4.5s forwards;
      max-width: 220px;
      line-height: 1.4;
    }
    .chat-bubble-tooltip::after {
      content: '';
      position: absolute;
      bottom: -6px;
      right: 24px;
      width: 12px;
      height: 12px;
      background: #092b50;
      transform: rotate(45deg);
    }
    @keyframes tooltipFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tooltipFadeOut {
      from { opacity: 1; }
      to { opacity: 0; pointer-events: none; }
    }

    @media (max-width: 440px) {
      .chat-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        max-height: none;
        max-width: none;
        border-radius: 0;
        z-index: 99999;
      }
      .chat-overlay.keyboard-open {
        height: calc(var(--vh, 100vh));
      }
      .chat-overlay-header {
        padding: 12px 16px;
        padding-top: max(12px, env(safe-area-inset-top, 0px));
        min-height: 50px;
        flex-shrink: 0;
      }
      .chat-overlay-header h3 {
        font-size: 1.1rem;
      }
      .chat-messages {
        padding: 12px;
        flex: 1;
        min-height: 0;
      }
      .chat-input-area {
        padding: 10px 12px;
        padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
        flex-shrink: 0;
      }
      .chat-bubble {
        bottom: 16px;
        right: 16px;
        width: 56px;
        height: 56px;
        font-size: 28px;
      }
    }
  `;
  document.head.appendChild(style);

  // Create bubble button
  const bubble = document.createElement('button');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="white" style="display:block"><path d="M12 0 Q12 12 24 12 Q12 12 12 24 Q12 12 0 12 Q12 12 12 0 Z"/></svg>';
  bubble.title = 'Atlas';
  bubble.onclick = toggleChat;
  document.body.appendChild(bubble);

  // One-time tooltip (shows once per user, auto-dismisses after 5s)
  if (!localStorage.getItem('atlas_tooltip_seen')) {
    setTimeout(function() {
      var tooltip = document.createElement('div');
      tooltip.className = 'chat-bubble-tooltip';
      tooltip.textContent = '¡Hola! Soy Atlas, tu nuevo asistente de WorldClass BCN';
      tooltip.onclick = function() { tooltip.remove(); toggleChat(); };
      document.body.appendChild(tooltip);
      localStorage.setItem('atlas_tooltip_seen', '1');
      setTimeout(function() { if (tooltip.parentNode) tooltip.remove(); }, 5500);
    }, 1500);
  }

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'chat-overlay';
  overlay.id = 'chatOverlay';
  overlay.innerHTML = `
    <div class="chat-overlay-header">
      <h3>✦ Atlas</h3>
      <div class="chat-overlay-header-actions">
        <button onclick="window.chatWidget.newConversation()" title="Nueva conversación">↻</button>
        <button onclick="window.chatWidget.toggle()" title="Cerrar">✕</button>
      </div>
    </div>
    <div class="chat-messages" id="chatWidgetMessages">
      <div class="chat-welcome" id="chatWelcome">
        <h4>¡Hola! Soy Atlas</h4>
        <p>Pregúntame sobre procedimientos, materiales o vacaciones.</p>
        <div class="chat-suggestions">
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Cuántos días de vacaciones me quedan?')">Mis vacaciones</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Qué hago si no viene ningún alumno a clase?')">No viene nadie</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('¿Cómo funciona la tarea evaluable?')">Tarea evaluable</div>
          <div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion('Fichar mis horas de esta semana')">Fichar horas</div>
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <textarea id="chatWidgetInput" placeholder="Escribe tu pregunta..." rows="1" maxlength="2000"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.chatWidget.send()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
      <button class="chat-send-btn" id="chatWidgetSendBtn" onclick="window.chatWidget.send()"><span>➤</span></button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Detect user role on load — only show for test accounts during testing
  (async function detectRole() {
    try {
      const { data: { session } } = await db.auth.getSession();
      if (session) {
        const { data: profile } = await db.from('profiles').select('role, email').eq('id', session.user.id).single();
        if (profile) {
          userRole = profile.role;
          // Show for all users — Atlas is live for everyone
          updateWelcomeForRole();
        }
      }
    } catch(e) {}
  })();

  function getWelcomeHTML() {
    // Determine context from the current page URL, not the profile role
    var isAdminPage = window.location.pathname.indexOf('admin') !== -1;
    if (isAdminPage) {
      return '<div class="chat-welcome" id="chatWelcome">' +
        '<h4>¡Hola! Soy Atlas</h4>' +
        '<p>Pregúntame sobre el equipo, cobertura o el convenio.</p>' +
        '<div class="chat-suggestions">' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'¿Quién tiene vacaciones esta semana?\')">Vacaciones equipo</div>' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'Horas del equipo este mes\')">Horas equipo</div>' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'¿Qué dice el convenio sobre las vacaciones?\')">Consultar convenio</div>' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'¿Cuál es el procedimiento de sustitución?\')">Proceso sustis</div>' +
        '</div>' +
      '</div>';
    } else {
      return '<div class="chat-welcome" id="chatWelcome">' +
        '<h4>¡Hola! Soy Atlas</h4>' +
        '<p>Pregúntame sobre procedimientos, materiales o vacaciones.</p>' +
        '<div class="chat-suggestions">' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'¿Cuántos días de vacaciones me quedan?\')">Mis vacaciones</div>' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'¿Qué hago si no viene ningún alumno a clase?\')">No viene nadie</div>' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'¿Cómo funciona la tarea evaluable?\')">Tarea evaluable</div>' +
          '<div class="chat-suggestion" onclick="window.chatWidget.sendSuggestion(\'Fichar mis horas de esta semana\')">Fichar horas</div>' +
        '</div>' +
      '</div>';
    }
  }

  function updateWelcomeForRole() {
    var welcomeEl = document.getElementById('chatWelcome');
    if (welcomeEl) {
      welcomeEl.outerHTML = getWelcomeHTML();
    }
  }

  function toggleChat() {
    isOpen = !isOpen;
    overlay.classList.toggle('visible', isOpen);
    bubble.classList.toggle('open', isOpen);
    // Don't auto-focus input — let user tap it when ready (avoids mobile keyboard popping up)
    // On mobile, prevent page scroll when chat is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }

  function newConversation() {
    conversationHistory = [];
    sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
    lastLogId = null;
    const container = document.getElementById('chatWidgetMessages');
    container.innerHTML = getWelcomeHTML();
  }

  function sendSuggestion(text) {
    document.getElementById('chatWidgetInput').value = text;
    document.getElementById('chatWidgetInput').focus();
    const input = document.getElementById('chatWidgetInput');
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 80) + 'px';
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
          body: JSON.stringify({ message, history: conversationHistory, session_id: sessionId }),
        }
      );

      removeTyping();

      if (response.status === 429) {
        addMsg('Límite diario alcanzado (50 mensajes). Inténtalo mañana.', 'error');
      } else if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        addMsg(err.error || 'Atlas no disponible.', 'error');
      } else {
        const data = await response.json();
        conversationHistory.push({ role: 'user', content: message });
        conversationHistory.push({ role: 'assistant', content: data.response });
        if (conversationHistory.length > 10) {
          conversationHistory = conversationHistory.slice(-10);
        }
        lastLogId = data.log_id || null;
        addMsg(data.response, 'assistant', lastLogId);
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

  function addMsg(text, type, logId) {
    const container = document.getElementById('chatWidgetMessages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${type}`;
    if (type === 'assistant') {
      div.innerHTML = text
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" style="color:#4f46e5;text-decoration:underline">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/(https?:\/\/[^\s<]+)/g, function(match) { if (match.includes('"')) return match; return '<a href="'+match+'" target="_blank" style="color:#4f46e5;text-decoration:underline">📄 Abrir archivo</a>'; })
        .replace(/\n/g, '<br>');
      // Add confirm/cancel buttons ONLY when Atlas is asking to execute a specific action
      // (holiday request or punch submission with a summary shown)
      const hasActionSummary = text.includes('Confirma para enviar') || text.includes('Confirma para añadir') || text.includes('¿Procedo?') || text.includes('¿Confirmas?');
      if (hasActionSummary) {
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'margin-top:10px;display:flex;gap:8px;';
        btnWrap.innerHTML = `
          <button class="chat-confirm-btn" style="background:#092b50;color:white;border:2px solid transparent;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:600;font-size:0.85rem;background-image:linear-gradient(#092b50,#092b50),linear-gradient(135deg,#59d2ff,#6366f1,#a855f7,#ec4899,#f59e0b,#10b981);background-origin:border-box;background-clip:padding-box,border-box;">✓ Confirmar</button>
          <button class="chat-cancel-btn" style="background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:8px;padding:8px 16px;cursor:pointer;font-weight:500;font-size:0.85rem;">✗ Cancelar</button>
        `;
        btnWrap.querySelector('.chat-confirm-btn').onclick = () => { 
          btnWrap.remove(); 
          document.querySelectorAll('.chat-confirm-btn, .chat-cancel-btn').forEach(b => { const w = b.closest('div'); if(w) w.remove(); });
          addMsg('Confirmado ✓', 'user'); 
          sendSilent('Sí, confirmo. Ejecuta la acción con confirmed=true.'); 
        };
        btnWrap.querySelector('.chat-cancel-btn').onclick = () => { btnWrap.remove(); addMsg('Solicitud cancelada.', 'assistant'); };
        div.appendChild(btnWrap);
      }
      // Add thumbs up/down feedback (only for logged messages)
      if (logId) {
        const feedback = document.createElement('div');
        feedback.className = 'chat-feedback';
        feedback.innerHTML = `
          <button class="thumbs-up" title="Útil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 22V11L2 11V22H7ZM7 11L11 2C12.1 2 13 2.9 13 4V8H19.5C20.3 8 21 8.8 20.9 9.6L19.4 19.6C19.3 20.4 18.6 21 17.8 21H7"/></svg></button>
          <button class="thumbs-down" title="No útil"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2V13H22V2H17ZM17 13L13 22C11.9 22 11 21.1 11 20V16H4.5C3.7 16 3 15.2 3.1 14.4L4.6 4.4C4.7 3.6 5.4 3 6.2 3H17"/></svg></button>
        `;
        feedback.querySelector('.thumbs-up').onclick = function() { sendFeedback(logId, true, feedback); };
        feedback.querySelector('.thumbs-down').onclick = function() { sendFeedback(logId, false, feedback); };
        div.appendChild(feedback);
      }
    } else {
      div.textContent = text;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // Send message silently (no user bubble shown, just the response)
  async function sendSilent(text) {
    isWaiting = true;
    document.getElementById('chatWidgetSendBtn').disabled = true;
    showTyping();

    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) { removeTyping(); addMsg('Sesión expirada.', 'error'); isWaiting = false; document.getElementById('chatWidgetSendBtn').disabled = false; return; }

      conversationHistory.push({ role: 'user', content: text });

      const response = await fetch(`${SUPABASE_URL}/functions/v1/class-helper`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${session.access_token}`, 'apikey':SUPABASE_ANON_KEY },
        body: JSON.stringify({ message: text, history: conversationHistory, session_id: sessionId }),
      });

      removeTyping();

      if (!response.ok) {
        addMsg('Error al procesar.', 'error');
      } else {
        const data = await response.json();
        conversationHistory.push({ role: 'assistant', content: data.response });
        if (conversationHistory.length > 10) conversationHistory = conversationHistory.slice(-10);
        addMsg(data.response, 'assistant');
      }
    } catch(e) { removeTyping(); addMsg('Error de conexión.', 'error'); }

    isWaiting = false;
    document.getElementById('chatWidgetSendBtn').disabled = false;
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

  // Handle mobile keyboard - resize overlay to visual viewport
  if (window.visualViewport) {
    const resizeOverlay = () => {
      const vh = window.visualViewport.height;
      overlay.style.setProperty('--vh', vh + 'px');
      if (vh < window.innerHeight * 0.8) {
        overlay.classList.add('keyboard-open');
        overlay.style.height = vh + 'px';
        overlay.style.top = window.visualViewport.offsetTop + 'px';
      } else {
        overlay.classList.remove('keyboard-open');
        overlay.style.height = '';
        overlay.style.top = '';
      }
      // Scroll messages to bottom when keyboard opens
      const msgs = document.getElementById('chatWidgetMessages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    };
    window.visualViewport.addEventListener('resize', resizeOverlay);
    window.visualViewport.addEventListener('scroll', resizeOverlay);
  }

  async function sendFeedback(logId, helpful, feedbackEl) {
    // Replace buttons with thank you message that fades away
    feedbackEl.innerHTML = '<span class="chat-feedback-thanks">Gracias por tu feedback</span>';
    feedbackEl.className = '';
    // Remove the element after animation
    setTimeout(() => { feedbackEl.remove(); }, 2200);
    
    // Send to backend
    try {
      const { data: { session } } = await db.auth.getSession();
      if (session) {
        await fetch(`${SUPABASE_URL}/rest/v1/chat_logs?id=eq.${logId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ helpful })
        });
      }
    } catch(_e) { /* silently fail */ }
  }

  // Expose API
  window.chatWidget = { toggle: toggleChat, send, sendSuggestion, newConversation };
})();
