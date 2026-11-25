/**
 * ai.ts — User-configured AI lyrics translation (OpenAI, OpenRouter, Gemini)
 */

import { app, ipcMain, net } from 'electron';
import fs from 'fs';
import path from 'path';

export type AIProvider = 'openai' | 'openrouter' | 'gemini';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  targetLanguage: string;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'google/gemini-2.0-flash-001',
  gemini: 'gemini-2.0-flash',
};

let cachedConfig: AIConfig | null = null;

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-config.json');
}

function loadConfig(): AIConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const file = getConfigPath();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const provider: AIProvider =
        parsed.provider === 'openrouter' || parsed.provider === 'gemini' ? parsed.provider : 'openai';
      cachedConfig = {
        provider,
        apiKey: String(parsed.apiKey || ''),
        model: String(parsed.model || DEFAULT_MODELS[provider]),
        targetLanguage: String(parsed.targetLanguage || 'English'),
      };
      return cachedConfig;
    }
  } catch { /* ignore */ }
  cachedConfig = {
    provider: 'openai',
    apiKey: '',
    model: DEFAULT_MODELS.openai,
    targetLanguage: 'English',
  };
  return cachedConfig;
}

function saveConfig(cfg: AIConfig) {
  cachedConfig = cfg;
  try {
    const file = getConfigPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

async function callLLM(cfg: AIConfig, prompt: string): Promise<string> {
  const model = cfg.model.trim() || DEFAULT_MODELS[cfg.provider];

  if (cfg.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await net.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  const endpoint =
    cfg.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

  const res = await net.fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `AI HTTP ${res.status}`);
  return data?.choices?.[0]?.message?.content || '';
}

export function setupAIIPC() {
  ipcMain.handle('ai:getConfig', () => {
    const cfg = loadConfig();
    return {
      configured: Boolean(cfg.apiKey),
      provider: cfg.provider,
      model: cfg.model,
      targetLanguage: cfg.targetLanguage,
    };
  });

  ipcMain.handle(
    'ai:configure',
    (_e, input: { provider: AIProvider; apiKey?: string; model?: string; targetLanguage?: string }) => {
      const current = loadConfig();
      const provider =
        input.provider === 'openrouter' || input.provider === 'gemini' ? input.provider : 'openai';
      const next: AIConfig = {
        provider,
        apiKey: input.apiKey !== undefined && input.apiKey.trim() ? input.apiKey.trim() : current.apiKey,
        model: input.model?.trim() || DEFAULT_MODELS[provider],
        targetLanguage: input.targetLanguage?.trim() || current.targetLanguage || 'English',
      };
      saveConfig(next);
      return {
        ok: true,
        configured: Boolean(next.apiKey),
        provider: next.provider,
        model: next.model,
        targetLanguage: next.targetLanguage,
      };
    }
  );

  ipcMain.handle('ai:translateLyrics', async (_e, lines: string[], overrideLang?: string) => {
    const cfg = loadConfig();
    if (!cfg.apiKey) {
      return { ok: false, error: 'Configure an AI API key in Settings first.' };
    }
    const cleanLines = lines.slice(0, 120);
    if (cleanLines.length === 0) return { ok: true, translated: [] };

    const targetLang = overrideLang?.trim() || cfg.targetLanguage || 'English';
    const numbered = cleanLines.map((l, i) => `${i + 1}. ${l}`).join('\n');
    const prompt = `Translate each numbered lyric line naturally into ${targetLang}. Return ONLY a JSON array of ${cleanLines.length} strings matching each line index 1-to-1.\n\n${numbered}`;

    try {
      const raw = await callLLM(cfg, prompt);
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Invalid translation format from model');
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
      return {
        ok: true,
        translated: cleanLines.map((orig, i) => String(parsed[i] ?? orig)),
        language: targetLang,
      };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
}
