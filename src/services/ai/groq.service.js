import axios from 'axios';
import { env } from '../../config/env.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function runGroqChat(messages, options = {}) {
  if (!env.groqApiKey) throw new Error('GROQ_API_KEY is required');
  const { data } = await axios.post(GROQ_URL, {
    model: options.model || env.groqModel,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 800,
  }, {
    headers: { Authorization: `Bearer ${env.groqApiKey}` },
    timeout: options.timeoutMs ?? 45000,
  });
  return data.choices?.[0]?.message?.content?.trim() || '';
}
