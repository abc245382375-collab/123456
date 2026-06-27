/**
 * 流式输出模块
 * 实现 AI 回复边生成边显示
 */

class StreamHandler {
  constructor() {
    this.abortController = null;
    this.currentMessageDiv = null;
    this.currentContent = '';
  }

  /**
   * 流式调用 DeepSeek API
   */
  async streamChat(apiKey, messages, options = {}) {
    // 取消之前的请求
    this.cancel();

    this.abortController = new AbortController();
    this.currentContent = '';

    const requestBody = {
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: options.maxTokens || 800,
      stream: true  // ✅ 开启流式
    };

    if (options.temperature !== undefined) requestBody.temperature = options.temperature;
    if (options.topP !== undefined) requestBody.top_p = options.topP;

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      return this._processStream(response);
    } catch (error) {
      if (error.name === 'AbortError') {
        return { content: this.currentContent, aborted: true };
      }
      throw error;
    }
  }

  /**
   * 处理流式响应
   */
  async _processStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            this.currentContent += delta;
            // 触发回调
            if (this.onChunk) {
              this.onChunk(delta, this.currentContent);
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    return { content: this.currentContent, aborted: false };
  }

  /**
   * 取消流式请求
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 设置流式回调
   */
  onUpdate(callback) {
    this.onChunk = callback;
  }
}

// 导出
if (typeof module !== 'undefined') module.exports = StreamHandler;