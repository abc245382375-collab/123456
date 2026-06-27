/**
 * 消息管理器 - 对话分支树
 * 参考 DeepSeek 官方对话模式
 */

class MessageManager {
  constructor() {
    this.tree = [];           // 对话树：[{ id, role, content, parentId, children: [id, ...], versions: [{content, timestamp}], currentVersion }]
    this.currentLeaf = null;  // 当前叶节点ID
    this.recalledIds = new Set(); // 已撤回的消息ID
  }

  _generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * 添加消息
   */
  addMessage(role, content, options = {}) {
    const msg = {
      id: options.id || this._generateId(),
      role: role,
      parentId: options.parentId || this.currentLeaf,
      children: [],
      versions: [{ content, timestamp: Date.now() }],
      currentVersion: 0,
      timestamp: Date.now()
    };

    // 更新父节点的 children
    if (msg.parentId) {
      const parent = this._findNode(msg.parentId);
      if (parent && !parent.children.includes(msg.id)) {
        parent.children.push(msg.id);
      }
    }

    this.tree.push(msg);
    this.currentLeaf = msg.id;
    return msg;
  }

  /**
   * 更新消息内容（流式输出）
   */
  updateMessage(messageId, content) {
    const node = this._findNode(messageId);
    if (node) {
      node.versions[node.currentVersion].content = content;
    }
    return node;
  }

  /**
   * 撤回消息（撤回这条及之后所有消息）
   */
  recallMessage(messageId) {
    const node = this._findNode(messageId);
    if (!node) return;

    // 收集这条消息及所有后代
    const toRecall = this._getDescendants(messageId);
    toRecall.add(messageId);

    // 标记为已撤回
    toRecall.forEach(id => this.recalledIds.add(id));

    // 更新 currentLeaf 为撤回消息的父节点
    const parentId = node.parentId;
    this.currentLeaf = parentId;

    return { recalledIds: toRecall, newCurrentLeaf: parentId };
  }

  /**
   * 重新生成（从这条消息开始，创建新分支）
   */
  startRegenerate(messageId) {
    const node = this._findNode(messageId);
    if (!node) return null;

    // 创建新版本
    const newVersionIndex = node.versions.length;
    node.versions.push({ content: '', timestamp: Date.now() });
    node.currentVersion = newVersionIndex;

    // 清除旧分支的子节点标记（不删除数据，只是不再使用）
    // 将 currentLeaf 设置为此消息
    this.currentLeaf = messageId;

    return { messageId, versionIndex: newVersionIndex };
  }

  /**
   * 切换版本
   */
  switchVersion(messageId, versionIndex) {
    const node = this._findNode(messageId);
    if (!node || versionIndex < 0 || versionIndex >= node.versions.length) return null;

    node.currentVersion = versionIndex;
    this.currentLeaf = messageId;

    return {
      content: node.versions[versionIndex].content,
      versionIndex,
      totalVersions: node.versions.length
    };
  }

  /**
   * 获取版本信息
   */
  getVersionInfo(messageId) {
    const node = this._findNode(messageId);
    if (!node) return { total: 0, current: 0, hasPrev: false, hasNext: false };

    return {
      total: node.versions.length,
      current: node.currentVersion + 1,
      hasPrev: node.currentVersion > 0,
      hasNext: node.currentVersion < node.versions.length - 1
    };
  }

  /**
   * 获取从根到当前叶子的消息链
   */
  getConversationChain() {
    if (!this.currentLeaf) return [];

    const chain = [];
    let currentId = this.currentLeaf;

    // 回溯到根
    while (currentId) {
      const node = this._findNode(currentId);
      if (!node) break;

      if (!this.recalledIds.has(currentId)) {
        chain.unshift({
          id: node.id,
          role: node.role,
          content: node.versions[node.currentVersion]?.content || ''
        });
      }

      currentId = node.parentId;
    }

    return chain;
  }

  /**
   * 获取最近消息（用于API上下文）
   */
  getRecentMessages(count = 8) {
    const chain = this.getConversationChain();
    return chain.slice(-count);
  }

  /**
   * 获取某个消息及其在当前版本下的子消息
   */
  getMessageAndChildren(messageId) {
    const node = this._findNode(messageId);
    if (!node) return [];

    const result = [{
      id: node.id,
      role: node.role,
      content: node.versions[node.currentVersion]?.content || '',
      recalled: this.recalledIds.has(node.id)
    }];

    // 只获取当前叶子链上的子节点
    let childId = node.children.find(cid => this._isOnCurrentChain(cid));
    while (childId) {
      const child = this._findNode(childId);
      if (!child) break;
      result.push({
        id: child.id,
        role: child.role,
        content: child.versions[child.currentVersion]?.content || '',
        recalled: this.recalledIds.has(child.id)
      });
      childId = child.children.find(cid => this._isOnCurrentChain(cid));
    }

    return result;
  }

  /**
   * 清除所有
   */
  clear() {
    this.tree = [];
    this.currentLeaf = null;
    this.recalledIds.clear();
  }

  /**
   * 按角色获取消息（用于统计）
   */
  getMessagesByRole(role) {
    return this.tree.filter(n => n.role === role && !this.recalledIds.has(n.id));
  }

  // ========== 私有方法 ==========

  _findNode(id) {
    return this.tree.find(n => n.id === id) || null;
  }

  _getDescendants(id) {
    const descendants = new Set();
    const node = this._findNode(id);
    if (!node) return descendants;

    const queue = [...node.children];
    while (queue.length) {
      const childId = queue.shift();
      descendants.add(childId);
      const child = this._findNode(childId);
      if (child) queue.push(...child.children);
    }
    return descendants;
  }

  _isOnCurrentChain(id) {
    let current = this.currentLeaf;
    while (current) {
      if (current === id) return true;
      const node = this._findNode(current);
      if (!node) return false;
      current = node.parentId;
    }
    return false;
  }
}

// 导出
if (typeof module !== 'undefined') module.exports = MessageManager;