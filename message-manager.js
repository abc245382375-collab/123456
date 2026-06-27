/**
 * 消息管理器
 * 处理消息存储、撤回、重新生成、版本切换
 */

class MessageManager {
  constructor() {
    this.messages = [];       // 所有消息
    this.messageVersions = {}; // { messageId: [版本1, 版本2, ...] }
    this.currentVersions = {}; // { messageId: 当前版本索引 }
  }

  /**
   * 添加消息
   */
  addMessage(role, content, options = {}) {
    const msg = {
      id: options.id || this._generateId(),
      role: role,
      content: content,
      timestamp: Date.now(),
      isStreaming: options.isStreaming || false,
      isError: options.isError || false
    };

    this.messages.push(msg);

    // 初始化版本管理
    if (!this.messageVersions[msg.id]) {
      this.messageVersions[msg.id] = [content];
      this.currentVersions[msg.id] = 0;
    }

    return msg;
  }

  /**
   * 更新消息内容（流式输出时使用）
   */
  updateMessage(messageId, content, isStreaming = true) {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.content = content;
      msg.isStreaming = isStreaming;
      
      // 更新版本
      if (this.messageVersions[messageId]) {
        this.messageVersions[messageId][this.currentVersions[messageId]] = content;
      }
    }
    return msg;
  }

  /**
   * 撤回消息（软删除，保留在版本历史中）
   */
  recallMessage(messageId) {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.recalled = true;
      msg.recalledContent = msg.content;
      msg.content = '⏪ 此消息已撤回';
    }
    return msg;
  }

  /**
   * 重新生成（创建新版本）
   */
  regenerate(messageId, newContent) {
    if (!this.messageVersions[messageId]) {
      this.messageVersions[messageId] = [];
    }
    this.messageVersions[messageId].push(newContent);
    this.currentVersions[messageId] = this.messageVersions[messageId].length - 1;

    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.content = newContent;
      msg.isStreaming = false;
      msg.regenerated = true;
    }

    return msg;
  }

  /**
   * 切换到上一版本
   */
  prevVersion(messageId) {
    const versions = this.messageVersions[messageId];
    if (!versions || versions.length <= 1) return null;

    let current = this.currentVersions[messageId] || 0;
    current = (current - 1 + versions.length) % versions.length;
    this.currentVersions[messageId] = current;

    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.content = versions[current];
    }

    return { content: versions[current], current, total: versions.length };
  }

  /**
   * 切换到下一版本
   */
  nextVersion(messageId) {
    const versions = this.messageVersions[messageId];
    if (!versions || versions.length <= 1) return null;

    let current = this.currentVersions[messageId] || 0;
    current = (current + 1) % versions.length;
    this.currentVersions[messageId] = current;

    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.content = versions[current];
    }

    return { content: versions[current], current, total: versions.length };
  }

  /**
   * 获取版本信息
   */
  getVersionInfo(messageId) {
    const versions = this.messageVersions[messageId] || [];
    const current = this.currentVersions[messageId] || 0;
    return {
      total: versions.length,
      current: current + 1,
      hasPrev: current > 0,
      hasNext: current < versions.length - 1
    };
  }

  /**
   * 获取最近消息（用于API上下文）
   */
  getRecentMessages(count = 8) {
    return this.messages
      .filter(m => !m.recalled)
      .slice(-count)
      .map(m => ({ role: m.role, content: m.content }));
  }

  /**
   * 清除所有消息
   */
  clear() {
    this.messages = [];
    this.messageVersions = {};
    this.currentVersions = {};
  }

  _generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }
}

// 导出
if (typeof module !== 'undefined') module.exports = MessageManager;