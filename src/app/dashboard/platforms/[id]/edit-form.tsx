"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  buildPlatformConfig,
  PLATFORM_OPTIONS,
  readPlatformConfig,
} from "@/lib/platforms";
import { readStoredConnectionConfig } from "@/lib/connection-config";

type Platform = {
  id: string;
  name: string;
  type: string;
  handle: string | null;
  accountId: string | null;
  provider: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
};

export default function EditPlatformForm({ platform }: { platform: Platform }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const configState = readPlatformConfig(platform.config);
  const storedConfig = readStoredConnectionConfig(platform.config);
  const isXBirdPlatform =
    platform.provider === "bird" && ["twitter", "x"].includes(platform.type);
  const xAuthToken = readCredentialValue(
    storedConfig.credentials,
    "X_AUTH_TOKEN",
    "authToken",
    "accessToken"
  );
  const xCt0 = readCredentialValue(
    storedConfig.credentials,
    "X_CT0",
    "ct0",
    "accessTokenSecret"
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const data = isXBirdPlatform
        ? {
            name: platform.name,
            type: platform.type === "x" ? "twitter" : platform.type,
            handle: platform.handle || undefined,
            provider: "bird",
            config: buildXBirdConfig(platform.config, {
              xAuthToken: (formData.get("X_AUTH_TOKEN") as string) || "",
              xCt0: (formData.get("X_CT0") as string) || "",
            }),
            enabled: platform.enabled,
          }
        : {
            name: formData.get("name") as string,
            type: formData.get("type") as string,
            handle: (formData.get("handle") as string) || undefined,
            accountId: (formData.get("accountId") as string) || undefined,
            provider: formData.get("provider") as string,
            config: buildPlatformConfig({
              skillsText: (formData.get("skills") as string) || "",
              notes: (formData.get("notes") as string) || "",
              advancedConfigText: (formData.get("advancedConfig") as string) || "",
            }),
            enabled: formData.get("enabled") === "on",
          };

      const res = await fetch(`/api/platforms/${platform.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update platform");
      }

      router.push("/dashboard/platforms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this platform?")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/platforms/${platform.id}/delete`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete platform");
      }

      router.push("/dashboard/platforms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setDeleting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      const res = await fetch(`/api/platforms/${platform.id}/test`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(body.error || "Connection test failed");
      }

      setTestResult(body.message || "Connection test passed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6">
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {testResult && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">{testResult}</p>
        </div>
      )}
      {isXBirdPlatform && storedConfig.birdSession ? (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">
            Bird session: {storedConfig.birdSession.status === "ok" ? "healthy" : "needs reconnect"}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {storedConfig.birdSession.error ?? storedConfig.birdSession.message}
          </p>
          {storedConfig.birdSession.checkedAt ? (
            <p className="mt-1 text-xs text-gray-500">
              Checked {new Date(storedConfig.birdSession.checkedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}

      {!isXBirdPlatform ? (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Platform Name
          </label>
          <input
            type="text"
            name="name"
            defaultValue={platform.name}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ) : null}

      {!isXBirdPlatform ? (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Platform Type
          </label>
          <select
            name="type"
            defaultValue={platform.type}
            required
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!isXBirdPlatform ? (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Handle
          </label>
          <input
            type="text"
            name="handle"
            defaultValue={platform.handle || ""}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ) : null}

      {!isXBirdPlatform ? (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Account ID
            </label>
            <input
              type="text"
              name="accountId"
              defaultValue={platform.accountId || ""}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Provider account ID used for publishing
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Provider
            </label>
            <select
              name="provider"
              defaultValue={platform.provider}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="zernio">Zernio</option>
              <option value="bird">Bird</option>
              <option value="direct">Direct</option>
            </select>
          </div>
        </>
      ) : null}

      {isXBirdPlatform ? (
        <>
          <details className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-900">
              Setup with Claude Code or Codex
            </summary>
            <textarea
              readOnly
              rows={7}
              value={X_COOKIE_AGENT_PROMPT}
              className="mt-3 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none resize-y"
            />
            <p className="text-xs text-gray-500 mt-2">
              User must be logged in to X in Chrome on the same computer.
            </p>
          </details>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              X_AUTH_TOKEN
            </label>
            <input
              type="password"
              name="X_AUTH_TOKEN"
              defaultValue={xAuthToken}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional for prod. Local Bird mode can use the installed browser session instead.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              X_CT0
            </label>
            <input
              type="password"
              name="X_CT0"
              defaultValue={xCt0}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional for prod. Refresh both cookies if X rejects explicit tokens.
            </p>
          </div>
        </>
      ) : null}

      {!isXBirdPlatform ? (
        <div className="mb-8">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={platform.enabled}
              className="w-4 h-4 border border-gray-200 rounded focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-gray-900 font-medium">Enable this platform</span>
          </label>
        </div>
      ) : null}

      {!isXBirdPlatform ? (
        <>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Platform Skills
            </label>
            <textarea
              name="skills"
              rows={4}
              defaultValue={configState.skillsText}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
            <p className="text-xs text-gray-500 mt-1">
              One skill per line. Edit per platform.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Platform Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              defaultValue={configState.notes}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
            />
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Advanced Config JSON
            </label>
            <textarea
              name="advancedConfig"
              rows={8}
              defaultValue={configState.advancedConfigText}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y font-mono"
            />
          </div>
        </>
      ) : null}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
        {isXBirdPlatform ? (
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? "Testing..." : "Test connection"}
          </button>
        ) : null}
        <Link
          href="/dashboard/platforms"
          className="px-4 py-2 bg-white border border-gray-200 text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="ml-auto px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </form>
  );
}

function readCredentialValue(
  credentials: Record<string, unknown> | null | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = credentials?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function buildXBirdConfig(
  currentConfig: Record<string, unknown> | null,
  credentials: { xAuthToken: string; xCt0: string }
) {
  const stored = readStoredConnectionConfig(currentConfig);
  const nextCredentials = {
    ...(stored.credentials ?? {}),
    ...(credentials.xAuthToken.trim()
      ? { X_AUTH_TOKEN: credentials.xAuthToken.trim() }
      : {}),
    ...(credentials.xCt0.trim() ? { X_CT0: credentials.xCt0.trim() } : {}),
  };

  return {
    ...(currentConfig ?? {}),
    authMethod: "bird_cli",
    credentials: nextCredentials,
  };
}

const X_COOKIE_AGENT_PROMPT =
  "Local Bird mode: log in to https://x.com in the configured browser, then click Check Bird session.\n\nProd token mode: use Claude Code or Codex on the browser machine to get only the x.com cookies named auth_token and ct0. Do not print them in chat. Paste auth_token into X_AUTH_TOKEN and ct0 into X_CT0, save, then click Check Bird session.";
