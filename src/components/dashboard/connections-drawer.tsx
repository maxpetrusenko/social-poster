"use client";

import { Check, ExternalLink, Link2, X } from "lucide-react";
import {
  CONNECTION_PLATFORM_DEFINITIONS,
  type ConnectionField,
  type ConnectionMethod,
  type ConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import type { FormState, ProfileRow } from "./connections-types";

export function ConnectionsDrawer({
  drawerOpen,
  profiles,
  selectedProfileId,
  selectedPlatformType,
  selectedDefinition,
  selectedMethod,
  formState,
  error,
  isSaving,
  onClose,
  onProfileChange,
  onPlatformChange,
  onMethodChange,
  onFieldChange,
  onSubmit,
}: {
  drawerOpen: boolean;
  profiles: ProfileRow[];
  selectedProfileId: string;
  selectedPlatformType: ConnectionPlatformDefinition["type"];
  selectedDefinition: ConnectionPlatformDefinition;
  selectedMethod: ConnectionMethod;
  formState: FormState;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onProfileChange: (value: string) => void;
  onPlatformChange: (value: ConnectionPlatformDefinition["type"]) => void;
  onMethodChange: (value: string) => void;
  onFieldChange: (key: string, value: string | boolean) => void;
  onSubmit: () => void;
}) {
  if (!drawerOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(7,11,18,0.58)] backdrop-blur-[2px]">
      <div className="h-full w-full max-w-[470px] overflow-y-auto border-l border-[rgba(12,17,21,0.08)] bg-[#f8f4eb] p-5 shadow-[-24px_0_80px_rgba(8,17,29,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[1.85rem] font-semibold leading-none text-[#211913]">
              New Connection
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#746253]">
              Choose a profile, pick a network, then choose how this app should
              authenticate or route publishing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[rgba(33,25,19,0.12)] p-2 text-[#746253]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#7a6756]">
              Profile
            </label>
            <select
              value={selectedProfileId}
              onChange={(event) => onProfileChange(event.target.value)}
              className="mt-2 w-full rounded-[14px] border border-[rgba(33,25,19,0.12)] bg-white px-4 py-3 text-sm font-semibold text-[#211913]"
            >
              <option value="all">Select a profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-[rgba(33,25,19,0.08)] pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a6756]">
              Social
            </p>
            <div className="mt-3 space-y-2">
              {CONNECTION_PLATFORM_DEFINITIONS.map((definition) => {
                const active = definition.type === selectedPlatformType;
                const meta = getPlatformMeta(definition.type);
                return (
                  <button
                    key={definition.type}
                    type="button"
                    onClick={() => onPlatformChange(definition.type)}
                    className={`flex w-full items-center justify-between rounded-[16px] border px-4 py-3 text-left transition ${
                      active
                        ? "border-[rgba(15,126,169,0.26)] bg-white"
                        : "border-[rgba(33,25,19,0.08)] bg-[rgba(255,255,255,0.72)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-sm font-bold"
                        style={{
                          backgroundColor: `${meta.accent}18`,
                          color: meta.accent,
                        }}
                      >
                        {meta.shortLabel}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#211913]">
                          {definition.label}
                        </p>
                        <p className="text-xs text-[#7a6756]">
                          {definition.summary}
                        </p>
                      </div>
                    </div>
                    <Link2 className="h-4 w-4 text-[#8b7868]" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[18px] border border-[rgba(33,25,19,0.08)] bg-white p-4">
            <p className="text-sm font-semibold text-[#211913]">
              {selectedDefinition.label}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#746253]">
              {selectedDefinition.summary}
            </p>

            <div className="mt-4 space-y-2">
              {selectedDefinition.methods.map((method) => {
                const active = method.id === selectedMethod.id;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => onMethodChange(method.id)}
                    className={`w-full rounded-[16px] border px-4 py-3 text-left transition ${
                      active
                        ? "border-[rgba(15,126,169,0.28)] bg-[rgba(15,126,169,0.06)]"
                        : "border-[rgba(33,25,19,0.08)] bg-[rgba(248,244,235,0.7)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[#211913]">
                          {method.label}
                        </p>
                        <p className="mt-1 text-xs leading-6 text-[#746253]">
                          {method.description}
                        </p>
                      </div>
                      {active ? (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(15,126,169,0.14)] text-[var(--accent-tech)]">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-[14px] border border-[rgba(33,25,19,0.08)] bg-[#f7f1e5] px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a6756]">
                Recommendation
              </p>
              <p className="mt-2 text-sm leading-6 text-[#4d3f34]">
                {selectedMethod.recommendation}
              </p>
            </div>
          </div>

          <div className="rounded-[18px] border border-[rgba(33,25,19,0.08)] bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-[#211913]">
                Setup details
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedMethod.docs.map((item) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[rgba(33,25,19,0.1)] px-2.5 py-1 text-xs font-semibold text-[#5e4e42]"
                  >
                    {item.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {selectedMethod.fields.map((field) => (
                <ConnectionFieldInput
                  key={field.id}
                  field={field}
                  value={formState[field.id]}
                  onChange={(value) => onFieldChange(field.id, value)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-800">
              Temporary note: credentials still live inside `platforms.config`
              until the dedicated encrypted credential model lands.
            </div>

            {error ? (
              <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSaving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#121d2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isSaving ? "Connecting..." : "Create connection"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-[14px] border border-[rgba(33,25,19,0.12)] px-4 py-3 text-sm font-semibold text-[#4d3f34]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConnectionField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#7a6756]">
        {field.label}
      </label>
      {field.type === "textarea" ? (
        <textarea
          rows={4}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="mt-2 w-full rounded-[14px] border border-[rgba(33,25,19,0.12)] bg-[#fcfbf8] px-4 py-3 text-sm text-[#211913]"
        />
      ) : field.type === "toggle" ? (
        <label className="mt-2 flex items-center gap-3 rounded-[14px] border border-[rgba(33,25,19,0.12)] bg-[#fcfbf8] px-4 py-3 text-sm font-semibold text-[#211913]">
          <input
            type="checkbox"
            checked={typeof value === "boolean" ? value : false}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      ) : (
        <input
          type={field.type === "password" ? "password" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="mt-2 w-full rounded-[14px] border border-[rgba(33,25,19,0.12)] bg-[#fcfbf8] px-4 py-3 text-sm text-[#211913]"
        />
      )}
      {field.help ? (
        <p className="mt-2 text-xs leading-5 text-[#7a6756]">{field.help}</p>
      ) : null}
    </div>
  );
}
