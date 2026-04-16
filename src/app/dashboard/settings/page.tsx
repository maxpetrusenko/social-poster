'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Copy } from 'lucide-react';
import {
  getReplyLanguageLabel,
  normalizeReplyLanguage,
  type ReplyLanguage,
} from '@/lib/replies/language';

const REPLY_LANGUAGE_STORAGE_KEY = 'social-poster.replyLanguage';

export default function SettingsPage() {
  const [config, setConfig] = useState({
    faceId: '',
    voiceId: '',
    timezone: '',
    appUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [replyLanguage, setReplyLanguage] = useState<ReplyLanguage>('en');

  useEffect(() => {
    const storedReplyLanguage = window.localStorage.getItem(REPLY_LANGUAGE_STORAGE_KEY);
    if (storedReplyLanguage) {
      setReplyLanguage(normalizeReplyLanguage(storedReplyLanguage));
    }

    async function loadConfig() {
      try {
        // In a real app, this would fetch from an API endpoint
        // For now, we'll read from environment variables client-side (not recommended for secrets)
        // In production, you'd have an API route that masks sensitive data
        setConfig({
          faceId: process.env.NEXT_PUBLIC_SIMLI_FACE_ID || 'Not configured',
          voiceId: process.env.NEXT_PUBLIC_CARTESIA_VOICE_ID || 'Not configured',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          appUrl: process.env.NEXT_PUBLIC_APP_URL || typeof window !== 'undefined' ? window.location.origin : '',
        });
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(REPLY_LANGUAGE_STORAGE_KEY, replyLanguage);
  }, [replyLanguage]);

  const copyToClipboard = (value: string, key: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const maskValue = (value: string) => {
    if (!value || value === 'Not configured') return value;
    if (value.length < 4) return '*'.repeat(value.length);
    return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-gray-200 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Settings</h1>
      <p className="text-sm text-gray-600 mb-6">View and manage your application configuration</p>

      <div className="max-w-2xl">
        {/* Configuration Cards */}
        <div className="grid gap-4 mb-6">
          {/* Face ID */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Face ID (Simli)</p>
                <p className="text-xs text-gray-500 mt-1">Avatar face model ID</p>
              </div>
              <button
                onClick={() => copyToClipboard(config.faceId, 'faceId')}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3">
              <div className="font-mono text-sm text-gray-900 bg-gray-50 rounded px-3 py-2 break-all">
                {maskValue(config.faceId)}
              </div>
              {copied === 'faceId' && <p className="text-xs text-green-600 mt-2">Copied to clipboard</p>}
            </div>
          </div>

          {/* Voice ID */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Voice ID (Cartesia)</p>
                <p className="text-xs text-gray-500 mt-1">Avatar voice model ID</p>
              </div>
              <button
                onClick={() => copyToClipboard(config.voiceId, 'voiceId')}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3">
              <div className="font-mono text-sm text-gray-900 bg-gray-50 rounded px-3 py-2 break-all">
                {maskValue(config.voiceId)}
              </div>
              {copied === 'voiceId' && <p className="text-xs text-green-600 mt-2">Copied to clipboard</p>}
            </div>
          </div>

          {/* Timezone */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Timezone</p>
                <p className="text-xs text-gray-500 mt-1">Used for schedule calculations</p>
              </div>
              <button
                onClick={() => copyToClipboard(config.timezone, 'timezone')}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3">
              <div className="text-sm text-gray-900 bg-gray-50 rounded px-3 py-2">
                {config.timezone}
              </div>
              {copied === 'timezone' && <p className="text-xs text-green-600 mt-2">Copied to clipboard</p>}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Replies Language</p>
                <p className="text-xs text-gray-500 mt-1">Used when discovering and showing X reply candidates</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {getReplyLanguageLabel(replyLanguage)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-1">
              {(['en', 'any'] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setReplyLanguage(language)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                    replyLanguage === language
                      ? 'bg-white text-gray-950 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {getReplyLanguageLabel(language)}
                </button>
              ))}
            </div>
          </div>

          {/* App URL */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">App URL</p>
                <p className="text-xs text-gray-500 mt-1">Public application URL</p>
              </div>
              <button
                onClick={() => copyToClipboard(config.appUrl, 'appUrl')}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3">
              <div className="text-sm text-gray-900 bg-gray-50 rounded px-3 py-2 break-all">
                {config.appUrl}
              </div>
              {copied === 'appUrl' && <p className="text-xs text-green-600 mt-2">Copied to clipboard</p>}
            </div>
          </div>
        </div>

        {/* Environment Variables Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-900 mb-2">Manage Environment Variables</p>
          <p className="text-xs text-blue-800 mb-4">
            To change Face ID, Voice ID, or other API credentials, update your environment variables in Coolify.
          </p>
          <a
            href="https://coolify.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Open Coolify
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
