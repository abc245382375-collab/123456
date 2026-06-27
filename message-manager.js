/**
 * 消息管理器 - 对话分支树
 */

class MessageManager {
  constructor() {
    this.tree = [];
    this.currentLeaf = null;
    this.recalledIds = new Set();
  }

  _generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

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

    if (msg.parentId) {
      const parent = this.findNode(msg.parentId);
      if (parent && !parent.children.includes(msg.id)) {
        parent.children.push(msg.id);
      }
    }

    this.tree.push(msg);
    this.currentLeaf = msg.id;
    return msg;
  }

  updateMessage(messageId, content) {
    const node = this.findNode(messageId);
    if (node) {
      node.versions[node.currentVersion].content = content;
    }
    return node;
  }

  recallMessage(messageId) {
    const node = this.findNode(messageId);
    if (!node) return null;

    const toRecall = this.getDescendants(messageId);
    toRecall.add(messageId);

    toRecall.forEach(id => this.recalledIds.add(id));

    const parentId = node.parentId;
    this.currentLeaf = parentId;

    return { recalledIds: toRecall, newCurrentLeaf: parentId };
  }

  startRegenerate(messageId) {
    const node = this.findNode(messageId);
    if (!node) return null;

    const newVersionIndex = node.versions.length;
    node.versions.push({ content: '', timestamp: Date.now() });
    node.currentVersion = newVersionIndex;

    this.currentLeaf = messageId;

    return { messageId, versionIndex: newVersionIndex };
  }

  switchVersion(messageId, versionIndex) {
    const node = this.findNode(messageId);
    if (!node || versionIndex < 0 || versionIndex >= node.versions.length) return null;

    node.currentVersion = versionIndex;
    this.currentLeaf = messageId;

    return {
      content: node.versions[versionIndex].content,
      versionIndex,
      totalVersions: node.versions.length
    };
  }

  getVersionInfo(messageId) {
    const node = this.findNode(messageId);
    if (!node) return { total: 0, current: 0, hasPrev: false, hasNext: false };

    return {
      total: node.versions.length,
      current: node.currentVersion + 1,
      hasPrev: node.currentVersion > 0,
      hasNext: node.currentVersion < node.versions.length - 1
    };
  }

  getConversationChain() {
    if (!this.currentLeaf) return [];

    const chain = [];
    let currentId = this.currentLeaf;

    while (currentId) {
      const node = this.findNode(currentId);
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

  getRecentMessages(count = 8) {
    const chain = this.getConversationChain();
    return chain.slice(-count);
  }

  // ✅ 公开方法
  findNode(id) {
    return this.tree.find(n => n.id === id) || null;
  }

  // ✅ 公开方法
  getDescendants(id) {
    const descendants = new Set();
    const node = this.findNode(id);
    if (!node) return descendants;

    const queue = [...node.children];
    while (queue.length) {
      const childId = queue.shift();
      descendants.add(childId);
      const child = this.findNode(childId);
      if (child) queue.push(...child.children);
    }
    return descendants;
  }

  clear() {
    this.tree = [];
    this.currentLeaf = null;
    this.recalledIds.clear();
  }
}

if (typeof module !== 'undefined') module.exports = MessageManager;