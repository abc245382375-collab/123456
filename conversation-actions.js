/**
 * 对话操作模块 v2.0
 * 重新生成 | 编辑用户发言 | 版本切换 | 撤回
 * 引入此文件即可，无需修改 index.html
 */

(function() {
  // 等待主脚本就绪
  function waitForGlobals(callback) {
    if (typeof chatManager !== 'undefined' && typeof StreamHandler !== 'undefined') {
      callback();
    } else {
      setTimeout(() => waitForGlobals(callback), 150);
    }
  }

  waitForGlobals(() => {
    console.log('✅ 对话操作模块已加载');

    // 暴露到全局
    window.conversationActions = {
      regenerate: regenerateMessage,
      editUser: editUserMessage,
      switchVersion: switchVersion,
      recall: recallMessage
    };

    // 接管DOM按钮
    hijackMessageButtons();
  });

  // ==================== 核心功能 ====================

  // 1. 重新生成 AI 回复（创建新版本，保留旧版本）
  async function regenerateMessage(msgId) {
    if (isGenerating()) return;
    const conv = getConv();
    const node = conv.manager.findNode(msgId);
    if (!node || node.role !== 'assistant') return;

    setGenerating(true);

    // 创建新版本
    const newVersionIndex = node.versions.length;
    node.versions.push({ content: '', timestamp: Date.now() });
    node.currentVersion = newVersionIndex;

    // 显示加载状态
    const msgDiv = document.getElementById(msgId);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.bubble');
      if (bubble) bubble.innerHTML = '<span class="streaming-indicator"></span>';
    }

    // 获取上下文（不包含当前消息）
    const chain = conv.manager.getConversationChain();
    const msgIndex = chain.findIndex(m => m.id === msgId);
    const contextMessages = chain.slice(0, msgIndex);

    const systemMessages = buildSystemPrompt();
    const allMessages = [...systemMessages, ...contextMessages.map(m => ({ role: m.role, content: m.content }))];

    // 流式生成
    const streamHandler = new StreamHandler();
    let finalContent = '';

    streamHandler.onUpdate((delta, fullContent) => {
      finalContent = fullContent;
      if (msgDiv) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) bubble.innerHTML = escapeHtml(fullContent) + '<span class="streaming-indicator"></span>';
      }
    });

    try {
      const result = await streamHandler.streamChat(getApiKey(), allMessages, getRequestOptions());
      finalContent = result.content;
    } catch (error) {
      finalContent = '❌ ' + error.message;
    }

    // 保存版本
    node.versions[newVersionIndex].content = finalContent;

    // 更新显示
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.bubble');
      if (bubble) bubble.innerHTML = escapeHtml(finalContent);
    }

    updatePagerUI(msgId);
    updateConvBarIfExists();
    setGenerating(false);
  }

  // 2. 编辑用户消息
  async function editUserMessage(msgId, newContent) {
    if (isGenerating()) return;
    const conv = getConv();
    const node = conv.manager.findNode(msgId);
    if (!node || node.role !== 'user') return;

    // 更新用户消息
    node.versions[0].content = newContent;

    // 找到后续所有AI消息，重新生成
    const chain = conv.manager.getConversationChain();
    const msgIndex = chain.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    const followingMessages = chain.slice(msgIndex + 1);

    setGenerating(true);

    for (const msg of followingMessages) {
      if (msg.role !== 'assistant') continue;

      const currentNode = conv.manager.findNode(msg.id);
      if (!currentNode) continue;

      // 创建新版本
      const newVersionIndex = currentNode.versions.length;
      currentNode.versions.push({ content: '', timestamp: Date.now() });
      currentNode.currentVersion = newVersionIndex;

      // 获取上下文
      const currentChain = conv.manager.getConversationChain();
      const currentIndex = currentChain.findIndex(m => m.id === msg.id);
      const contextMessages = currentChain.slice(0, currentIndex);

      const systemMessages = buildSystemPrompt();
      const allMessages = [...systemMessages, ...contextMessages.map(m => ({ role: m.role, content: m.content }))];

      // 确保DOM存在
      let msgDiv = document.getElementById(msg.id);
      if (!msgDiv) {
        const result = addMessageToDOMSimple('assistant', '', msg.id);
        msgDiv = result ? document.getElementById(msg.id) : null;
      }

      const streamHandler = new StreamHandler();
      let finalContent = '';

      streamHandler.onUpdate((delta, fullContent) => {
        finalContent = fullContent;
        if (msgDiv) {
          const bubble = msgDiv.querySelector('.bubble');
          if (bubble) bubble.innerHTML = escapeHtml(fullContent) + '<span class="streaming-indicator"></span>';
        }
      });

      try {
        const result = await streamHandler.streamChat(getApiKey(), allMessages, getRequestOptions());
        finalContent = result.content;
      } catch (error) {
        finalContent = '❌ ' + error.message;
      }

      currentNode.versions[newVersionIndex].content = finalContent;

      if (msgDiv) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) bubble.innerHTML = escapeHtml(finalContent);
      }

      updatePagerUI(msg.id);
    }

    updateConvBarIfExists();
    setGenerating(false);
  }

  // 3. 切换版本（只换内容，不动后续）
  function switchVersion(msgId, direction) {
    const conv = getConv();
    const node = conv.manager.findNode(msgId);
    if (!node) return;

    const newIndex = direction === 'prev' ? node.currentVersion - 1 : node.currentVersion + 1;
    if (newIndex < 0 || newIndex >= node.versions.length) return;

    node.currentVersion = newIndex;

    const msgDiv = document.getElementById(msgId);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.bubble');
      if (bubble) bubble.innerHTML = escapeHtml(node.versions[newIndex].content);
    }

    updatePagerUI(msgId);
  }

  // 4. 撤回消息
  function recallMessage(msgId) {
    const conv = getConv();
    const result = conv.manager.recallMessage(msgId);
    if (!result) return;
    result.recalledIds.forEach(id => {
      const wrapper = document.querySelector(`[data-msg-id="${id}"]`);
      if (wrapper) wrapper.remove();
    });
    updateConvBarIfExists();
  }

  // ==================== 辅助函数 ====================

  function getConv() {
    if (typeof chatManager !== 'undefined') {
      return chatManager.getActiveConversation();
    }
    return { manager: { findNode: () => null, getConversationChain: () => [], recallMessage: () => {} } };
  }

  function getApiKey() {
    return localStorage.getItem('deepseek_api_key') || '';
  }

  function isGenerating() {
    return window._isGenerating || false;
  }

  function setGenerating(val) {
    window._isGenerating = val;
  }

  function getRequestOptions() {
    const longMode = getLongModeSettings();
    const aiParams = getAiParams();
    const options = { maxTokens: longMode.enabled ? 2000 : 800 };
    if (aiParams.useCustom) {
      options.temperature = aiParams.temperature;
      options.topP = aiParams.topP;
    }
    return options;
  }

  function getLongModeSettings() {
    try {
      return JSON.parse(localStorage.getItem('long_mode_settings')) || { enabled: false };
    } catch(e) { return { enabled: false }; }
  }

  function getAiParams() {
    try {
      return JSON.parse(localStorage.getItem('ai_params_v2')) || { useCustom: false };
    } catch(e) { return { useCustom: false }; }
  }

  function buildSystemPrompt() {
    try {
      const settings = JSON.parse(localStorage.getItem('ai_settings_v2')) || {};
      const name = settings.name || 'AI';
      let sp = '';
      if (settings.background) sp += `【背景】${settings.background}\n`;
      if (settings.personality) sp += `【性格】${settings.personality}\n`;
      sp += `【风格】${settings.tone || '友好'}\n`;
      return [{ role: 'system', content: sp }];
    } catch(e) {
      return [{ role: 'system', content: '你是友好助手。' }];
    }
  }

  function escapeHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML.replace(/\n/g, '<br>');
  }

  function updatePagerUI(msgId) {
    const pager = document.getElementById('pager-' + msgId);
    if (!pager) return;
    const conv = getConv();
    const node = conv.manager.findNode(msgId);
    if (!node) {
      pager.innerHTML = '';
      return;
    }

    const total = node.versions.length;
    const current = node.currentVersion + 1;

    pager.innerHTML = `
      <button class="version-pager-btn" onclick="conversationActions.switchVersion('${msgId}','prev')" ${current <= 1 ? 'disabled' : ''}>◀</button>
      <span class="version-info">${current}/${total}</span>
      <button class="version-pager-btn" onclick="conversationActions.switchVersion('${msgId}','next')" ${current >= total ? 'disabled' : ''}>▶</button>
    `;
  }

  function updateConvBarIfExists() {
    if (typeof updateConvBar === 'function') updateConvBar();
  }

  function addMessageToDOMSimple(role, content, msgId) {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';
    wrapper.dataset.msgId = msgId;

    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.id = msgId;

    let name = 'AI';
    try {
      const settings = JSON.parse(localStorage.getItem('ai_settings_v2')) || {};
      name = settings.name || 'AI';
    } catch(e) {}

    div.innerHTML = `
      <span class="sender-name">${name}</span>
      <div class="bubble">${escapeHtml(content)}</div>
    `;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:4px;margin-top:4px;opacity:0.6;';
    actions.innerHTML = `
      <span class="msg-action-btn" onclick="conversationActions.regenerate('${msgId}')">🔄 重新生成</span>
      <span class="msg-action-btn" onclick="conversationActions.recall('${msgId}')">⏪ 撤回</span>
    `;

    const pager = document.createElement('div');
    pager.id = 'pager-' + msgId;
    pager.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;color:#8e8e93;';

    wrapper.appendChild(div);
    wrapper.appendChild(actions);
    wrapper.appendChild(pager);
    chatArea.appendChild(wrapper);

    return wrapper;
  }

  function hijackMessageButtons() {
    // 替换已存在的按钮
    document.querySelectorAll('.message-wrapper').forEach(wrapper => {
      const msgId = wrapper.dataset.msgId;
      if (!msgId) return;
      const msgDiv = wrapper.querySelector('.message');
      if (!msgDiv) return;
      const actionsDiv = wrapper.querySelector('div:nth-child(2)');
      if (!actionsDiv) return;

      if (msgDiv.classList.contains('assistant')) {
        actionsDiv.innerHTML = `
          <span class="msg-action-btn" onclick="conversationActions.regenerate('${msgId}')">🔄 重新生成</span>
          <span class="msg-action-btn" onclick="conversationActions.recall('${msgId}')">⏪ 撤回</span>
        `;
      } else if (msgDiv.classList.contains('user')) {
        actionsDiv.innerHTML = `
          <span class="msg-action-btn" onclick="editUserMsg('${msgId}')">✏️ 编辑</span>
          <span class="msg-action-btn" onclick="conversationActions.recall('${msgId}')">⏪ 撤回</span>
        `;
      }
    });

    // 监听新消息
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return;

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1 || !node.classList.contains('message-wrapper')) return;
          const msgId = node.dataset.msgId;
          if (!msgId) return;
          const msgDiv = node.querySelector('.message');
          if (!msgDiv) return;
          const actionsDiv = node.querySelector('div:nth-child(2)');
          if (!actionsDiv) return;

          if (msgDiv.classList.contains('assistant')) {
            actionsDiv.innerHTML = `
              <span class="msg-action-btn" onclick="conversationActions.regenerate('${msgId}')">🔄 重新生成</span>
              <span class="msg-action-btn" onclick="conversationActions.recall('${msgId}')">⏪ 撤回</span>
            `;
          } else if (msgDiv.classList.contains('user')) {
            actionsDiv.innerHTML = `
              <span class="msg-action-btn" onclick="editUserMsg('${msgId}')">✏️ 编辑</span>
              <span class="msg-action-btn" onclick="conversationActions.recall('${msgId}')">⏪ 撤回</span>
            `;
          }

          // 为AI消息添加版本翻页器
          if (msgDiv.classList.contains('assistant')) {
            setTimeout(() => updatePagerUI(msgId), 100);
          }
        });
      });
    });

    observer.observe(chatArea, { childList: true, subtree: true });
  }

  // 编辑用户消息的UI处理
  window.editUserMsg = function(msgId) {
    const msgDiv = document.getElementById(msgId);
    if (!msgDiv) return;
    const conv = getConv();
    const node = conv.manager.findNode(msgId);
    if (!node) return;

    const currentContent = node.versions[node.currentVersion]?.content || '';
    const bubble = msgDiv.querySelector('.bubble');
    if (!bubble) return;

    bubble.innerHTML = `<input type="text" class="edit-user-input" id="editInput-${msgId}" value="${escapeHtml(currentContent)}" style="width:100%;border:1px solid #007aff;border-radius:14px;padding:8px 12px;font-size:14px;font-family:inherit;background:#fff;outline:none;margin-top:4px;">`;

    // 移除旧按钮
    const oldBtns = msgDiv.closest('.message-wrapper')?.querySelector('.edit-user-btns');
    if (oldBtns) oldBtns.remove();

    // 添加保存/取消按钮
    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'edit-user-btns';
    btnsDiv.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
    btnsDiv.innerHTML = `
      <button onclick="saveUserEdit('${msgId}')" style="padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;border:none;background:#007aff;color:#fff;cursor:pointer;">保存</button>
      <button onclick="cancelUserEdit('${msgId}')" style="padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;border:none;background:#f2f2f7;color:#8e8e93;cursor:pointer;">取消</button>
    `;
    msgDiv.closest('.message-wrapper')?.appendChild(btnsDiv);

    setTimeout(() => {
      const input = document.getElementById('editInput-' + msgId);
      if (input) input.focus();
    }, 50);
  };

  window.saveUserEdit = async function(msgId) {
    const input = document.getElementById('editInput-' + msgId);
    if (!input) return;
    const newContent = input.value.trim();
    if (!newContent) return;

    // 移除按钮
    const btnsDiv = document.querySelector(`#${msgId}`)?.closest('.message-wrapper')?.querySelector('.edit-user-btns');
    if (btnsDiv) btnsDiv.remove();

    // 更新显示
    const msgDiv = document.getElementById(msgId);
    if (msgDiv) {
      const bubble = msgDiv.querySelector('.bubble');
      if (bubble) bubble.innerHTML = escapeHtml(newContent);
    }

    // 执行编辑
    await conversationActions.editUser(msgId, newContent);
  };

  window.cancelUserEdit = function(msgId) {
    const btnsDiv = document.querySelector(`#${msgId}`)?.closest('.message-wrapper')?.querySelector('.edit-user-btns');
    if (btnsDiv) btnsDiv.remove();
    const conv = getConv();
    const node = conv.manager.findNode(msgId);
    if (node) {
      const msgDiv = document.getElementById(msgId);
      if (msgDiv) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) bubble.innerHTML = escapeHtml(node.versions[node.currentVersion]?.content || '');
      }
    }
  };
})();