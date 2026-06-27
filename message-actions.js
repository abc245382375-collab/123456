/**
 * 消息操作覆盖模块
 * 新增此文件即可替换所有消息操作逻辑
 * 无需修改 index.html
 */

(function() {
  // 等待主脚本初始化完成
  function init() {
    if (typeof messageActions === 'undefined') {
      setTimeout(init, 100);
      return;
    }

    // ========== 覆盖全局函数 ==========

    // 重新生成
    window.regenerateMessage = async function(msgId) {
      if (window._isGenerating) return;
      const msgDiv = document.getElementById(msgId);
      if (!msgDiv) return;

      msgDiv.classList.add('regenerating');
      const bubble = msgDiv.querySelector('.bubble');
      if (bubble) bubble.innerHTML = '<span class="streaming-indicator"></span>';

      window._isGenerating = true;

      await messageActions.regenerate(msgId,
        (content) => {
          if (bubble) bubble.innerHTML = escapeHtml(content) + '<span class="streaming-indicator"></span>';
        },
        (content, versionIndex, total) => {
          if (bubble) bubble.innerHTML = escapeHtml(content);
          msgDiv.classList.remove('regenerating');
          updateVersionPagerUI(msgId);
          updateConvBarIfExists();
        }
      );

      window._isGenerating = false;
    };

    // 编辑用户消息
    window.editUserMessage = function(msgId) {
      const msgDiv = document.getElementById(msgId);
      if (!msgDiv) return;

      const conv = getGlobalConv();
      const node = conv.manager.findNode(msgId);
      if (!node) return;

      const bubble = msgDiv.querySelector('.bubble');
      if (!bubble) return;

      const currentContent = node.versions[node.currentVersion]?.content || '';
      bubble.innerHTML = `<input type="text" class="edit-user-input" id="editInput-${msgId}" value="${escapeHtml(currentContent)}">`;

      const oldBtns = msgDiv.closest('.message-wrapper')?.querySelector('.edit-user-btns');
      if (oldBtns) oldBtns.remove();

      const btnsDiv = document.createElement('div');
      btnsDiv.className = 'edit-user-btns';
      btnsDiv.innerHTML = `
        <button class="edit-save-btn" onclick="saveUserEdit('${msgId}')">保存</button>
        <button class="edit-cancel-btn" onclick="cancelUserEdit('${msgId}', \`${escapeHtml(currentContent).replace(/`/g, '\\`')}\`)">取消</button>
      `;
      msgDiv.closest('.message-wrapper')?.appendChild(btnsDiv);

      setTimeout(() => {
        const input = document.getElementById('editInput-' + msgId);
        if (input) input.focus();
      }, 50);
    };

    // 保存编辑
    window.saveUserEdit = async function(msgId) {
      const input = document.getElementById('editInput-' + msgId);
      if (!input) return;
      const newContent = input.value.trim();
      if (!newContent) return;

      const btnsDiv = document.querySelector(`#${msgId}`)?.closest('.message-wrapper')?.querySelector('.edit-user-btns');
      if (btnsDiv) btnsDiv.remove();

      const msgDiv = document.getElementById(msgId);
      if (msgDiv) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) bubble.innerHTML = escapeHtml(newContent);
      }

      window._isGenerating = true;

      await messageActions.editUserMessage(msgId, newContent,
        (targetMsgId, content, status) => {
          const div = document.getElementById(targetMsgId);
          if (div) {
            const b = div.querySelector('.bubble');
            if (b) {
              b.innerHTML = escapeHtml(content) + (status === 'streaming' ? '<span class="streaming-indicator"></span>' : '');
            }
          }
          if (status === 'done') updateVersionPagerUI(targetMsgId);
        }
      );

      window._isGenerating = false;
      updateConvBarIfExists();
    };

    // 取消编辑
    window.cancelUserEdit = function(msgId, originalContent) {
      const btnsDiv = document.querySelector(`#${msgId}`)?.closest('.message-wrapper')?.querySelector('.edit-user-btns');
      if (btnsDiv) btnsDiv.remove();
      const msgDiv = document.getElementById(msgId);
      if (msgDiv) {
        const bubble = msgDiv.querySelector('.bubble');
        if (bubble) bubble.innerHTML = originalContent;
      }
    };

    // 撤回
    window.recallMessage = function(msgId) {
      const conv = getGlobalConv();
      const result = conv.manager.recallMessage(msgId);
      if (!result) return;
      result.recalledIds.forEach(id => {
        const wrapper = document.querySelector(`[data-msg-id="${id}"]`);
        if (wrapper) wrapper.remove();
      });
      updateConvBarIfExists();
    };

    // 版本切换（只切换内容，不影响后续）
    window.switchVersion = function(msgId, direction) {
      const result = messageActions.switchVersion(msgId, direction);
      if (result) {
        const msgDiv = document.getElementById(msgId);
        if (msgDiv) {
          const bubble = msgDiv.querySelector('.bubble');
          if (bubble) bubble.innerHTML = escapeHtml(result.content);
        }
        updateVersionPagerUI(msgId);
      }
    };

    // ========== 辅助函数 ==========

    function escapeHtml(t) {
      if (!t) return '';
      const d = document.createElement('div');
      d.textContent = t;
      return d.innerHTML.replace(/\n/g, '<br>');
    }

    function getGlobalConv() {
      if (typeof getConv === 'function') return getConv();
      if (typeof chatManager !== 'undefined') return chatManager.getActiveConversation();
      return { manager: { recallMessage: () => {}, findNode: () => null } };
    }

    function updateVersionPagerUI(msgId) {
      const pager = document.getElementById('pager-' + msgId);
      if (!pager || typeof messageActions === 'undefined') return;
      const info = messageActions.getVersionInfo(msgId);
      pager.innerHTML = `
        <button class="version-pager-btn" onclick="switchVersion('${msgId}','prev')" ${!info.hasPrev ? 'disabled' : ''}>◀</button>
        <span class="version-info">${info.current}/${info.total}</span>
        <button class="version-pager-btn" onclick="switchVersion('${msgId}','next')" ${!info.hasNext ? 'disabled' : ''}>▶</button>
      `;
    }

    function updateConvBarIfExists() {
      if (typeof updateConvBar === 'function') updateConvBar();
    }

    // ========== 修改DOM中已有的操作按钮 ==========
    function fixExistingButtons() {
      document.querySelectorAll('.message-wrapper').forEach(wrapper => {
        const msgId = wrapper.dataset.msgId;
        if (!msgId) return;
        const actionsDiv = wrapper.querySelector('div:last-child');
        if (!actionsDiv) return;

        const msgDiv = wrapper.querySelector('.message');
        if (!msgDiv) return;

        if (msgDiv.classList.contains('assistant')) {
          actionsDiv.innerHTML = `
            <span class="msg-action-btn" onclick="regenerateMessage('${msgId}')">🔄 重新生成</span>
            <span class="msg-action-btn" onclick="recallMessage('${msgId}')">⏪ 撤回</span>
          `;
        } else if (msgDiv.classList.contains('user')) {
          actionsDiv.innerHTML = `
            <span class="msg-action-btn" onclick="editUserMessage('${msgId}')">✏️ 编辑</span>
            <span class="msg-action-btn" onclick="recallMessage('${msgId}')">⏪ 撤回</span>
          `;
        }
      });
    }

    // ========== 监听新消息添加 ==========
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList.contains('message-wrapper')) {
            const msgId = node.dataset.msgId;
            if (!msgId) return;
            const actionsDiv = node.querySelector('div:last-child');
            if (!actionsDiv) return;
            const msgDiv = node.querySelector('.message');
            if (!msgDiv) return;

            if (msgDiv.classList.contains('assistant')) {
              actionsDiv.innerHTML = `
                <span class="msg-action-btn" onclick="regenerateMessage('${msgId}')">🔄 重新生成</span>
                <span class="msg-action-btn" onclick="recallMessage('${msgId}')">⏪ 撤回</span>
              `;
            } else if (msgDiv.classList.contains('user')) {
              actionsDiv.innerHTML = `
                <span class="msg-action-btn" onclick="editUserMessage('${msgId}')">✏️ 编辑</span>
                <span class="msg-action-btn" onclick="recallMessage('${msgId}')">⏪ 撤回</span>
              `;
            }
          }
        });
      });
    });

    observer.observe(document.getElementById('chatArea') || document.body, {
      childList: true,
      subtree: true
    });

    // 初始化
    fixExistingButtons();
    console.log('✅ 消息操作模块已加载（新增文件方式）');
  }

  // 等待DOM和主脚本就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }
})();