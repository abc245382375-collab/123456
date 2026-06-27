/**
 * 对话管理器 - 支持多对话、角色卡绑定
 */

class ChatManager {
  constructor() {
    this.conversations = {};  // { convId: MessageManager }
    this.activeConvId = null;
    this.convMeta = {};       // { convId: { title, characterCardId, createdAt } }
    this.characterCards = {}; // { cardId: { name, background, personality, tone, opening } }
    this.loadFromStorage();
  }

  _generateId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * 创建新对话
   */
  createConversation(title, characterCardId) {
    const convId = this._generateId();
    this.conversations[convId] = new MessageManager();
    this.convMeta[convId] = {
      title: title || '新对话',
      characterCardId: characterCardId || null,
      createdAt: Date.now()
    };
    this.activeConvId = convId;
    this.saveToStorage();
    return convId;
  }

  /**
   * 切换对话
   */
  switchConversation(convId) {
    if (this.conversations[convId]) {
      this.activeConvId = convId;
      this.saveToStorage();
      return true;
    }
    return false;
  }

  /**
   * 删除对话
   */
  deleteConversation(convId) {
    delete this.conversations[convId];
    delete this.convMeta[convId];
    if (this.activeConvId === convId) {
      const ids = Object.keys(this.conversations);
      this.activeConvId = ids.length > 0 ? ids[0] : null;
    }
    this.saveToStorage();
  }

  /**
   * 获取当前对话
   */
  getActiveConversation() {
    if (!this.activeConvId || !this.conversations[this.activeConvId]) {
      const ids = Object.keys(this.conversations);
      if (ids.length > 0) {
        this.activeConvId = ids[0];
      } else {
        this.createConversation('新对话');
      }
    }
    return {
      id: this.activeConvId,
      manager: this.conversations[this.activeConvId],
      meta: this.convMeta[this.activeConvId] || {}
    };
  }

  /**
   * 获取所有对话列表
   */
  getConversationList() {
    return Object.keys(this.conversations).map(id => ({
      id,
      title: this.convMeta[id]?.title || '未命名',
      characterCardId: this.convMeta[id]?.characterCardId,
      createdAt: this.convMeta[id]?.createdAt,
      messageCount: this.conversations[id]?.tree?.length || 0
    })).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 绑定角色卡到当前对话
   */
  bindCharacterCard(convId, cardId) {
    if (this.convMeta[convId]) {
      this.convMeta[convId].characterCardId = cardId;
    }
    this.saveToStorage();
  }

  // ========== 角色卡管理 ==========

  /**
   * 创建角色卡
   */
  createCharacterCard(card) {
    const cardId = 'card_' + Date.now();
    this.characterCards[cardId] = {
      id: cardId,
      name: card.name || '未命名角色',
      background: card.background || '',
      personality: card.personality || '',
      tone: card.tone || '友好',
      opening: card.opening || '',
      avatar: card.avatar || '🤖',
      createdAt: Date.now()
    };
    this.saveToStorage();
    return cardId;
  }

  /**
   * 更新角色卡
   */
  updateCharacterCard(cardId, updates) {
    if (this.characterCards[cardId]) {
      Object.assign(this.characterCards[cardId], updates);
    }
    this.saveToStorage();
  }

  /**
   * 删除角色卡
   */
  deleteCharacterCard(cardId) {
    delete this.characterCards[cardId];
    // 解绑所有使用此卡的对话
    Object.keys(this.convMeta).forEach(convId => {
      if (this.convMeta[convId].characterCardId === cardId) {
        this.convMeta[convId].characterCardId = null;
      }
    });
    this.saveToStorage();
  }

  /**
   * 获取所有角色卡
   */
  getCharacterCards() {
    return Object.values(this.characterCards).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取角色卡
   */
  getCharacterCard(cardId) {
    return this.characterCards[cardId] || null;
  }

  // ========== 持久化 ==========

  saveToStorage() {
    try {
      const data = {
        activeConvId: this.activeConvId,
        convMeta: this.convMeta,
        characterCards: this.characterCards,
        // 序列化每个对话的消息树
        conversations: {}
      };
      Object.keys(this.conversations).forEach(id => {
        const mgr = this.conversations[id];
        data.conversations[id] = {
          tree: mgr.tree,
          currentLeaf: mgr.currentLeaf,
          recalledIds: Array.from(mgr.recalledIds)
        };
      });
      localStorage.setItem('chat_manager_data', JSON.stringify(data));
    } catch(e) {
      console.error('保存失败:', e);
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('chat_manager_data');
      if (!saved) return;

      const data = JSON.parse(saved);
      this.activeConvId = data.activeConvId;
      this.convMeta = data.convMeta || {};
      this.characterCards = data.characterCards || {};

      // 恢复对话
      if (data.conversations) {
        Object.keys(data.conversations).forEach(id => {
          const mgr = new MessageManager();
          const convData = data.conversations[id];
          mgr.tree = convData.tree || [];
          mgr.currentLeaf = convData.currentLeaf || null;
          mgr.recalledIds = new Set(convData.recalledIds || []);
          this.conversations[id] = mgr;
        });
      }

      // 确保有至少一个对话
      if (Object.keys(this.conversations).length === 0) {
        this.createConversation('新对话');
      }
    } catch(e) {
      console.error('加载失败:', e);
      this.createConversation('新对话');
    }
  }
}

if (typeof module !== 'undefined') module.exports = ChatManager;