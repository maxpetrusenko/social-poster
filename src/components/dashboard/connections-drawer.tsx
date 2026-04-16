"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  CONNECTION_PLATFORM_DEFINITIONS,
  type ConnectionField,
  type ConnectionMethod,
  type ConnectionPlatformDefinition,
} from "@/lib/connection-catalog";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import type { NativeConnectionAvailability } from "@/lib/providers/env-availability";
import type { PlatformType } from "@/lib/platforms";
import type { FormState, ProfileRow } from "./connections-types";
import {
  ConnectionDocButton,
  ConnectionDocPillLinks,
  getUniqueConnectionDocs,
} from "./connection-doc-links";
import { ConnectionSetupGuideButton } from "./connection-setup-guide";
import {
  ConnectionMethodOption,
  getBrowserOAuthCallbackUrl,
  OAuthSetupPanel,
} from "./connection-method-option";
import { PlatformBrandIcon } from "./platform-brand-icon";

export function ConnectionsDrawer({
  drawerOpen,
  profiles,
  selectedProfileId,
  selectedPlatformType,
  selectedDefinition,
  selectedMethod,
  selectedMethodMode,
  availableMethodModes,
  nativeAvailabilityByPlatform,
  formState,
  error,
  isSaving,
  onClose,
  onProfileChange,
  onPlatformChange,
  onMethodChange,
  onMethodModeChange,
  onFieldChange,
  onSubmit,
  onOAuthConnect,
}: {
  drawerOpen: boolean;
  profiles: ProfileRow[];
  selectedProfileId: string;
  selectedPlatformType: ConnectionPlatformDefinition["type"];
  selectedDefinition: ConnectionPlatformDefinition;
  selectedMethod: ConnectionMethod;
  selectedMethodMode: "native" | "proxy";
  availableMethodModes: Array<"native" | "proxy">;
  nativeAvailabilityByPlatform: Record<PlatformType, NativeConnectionAvailability>;
  formState: FormState;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onProfileChange: (value: string) => void;
  onPlatformChange: (value: ConnectionPlatformDefinition["type"]) => void;
  onMethodChange: (value: string) => void;
  onMethodModeChange: (value: "native" | "proxy") => void;
  onFieldChange: (key: string, value: string | boolean) => void;
  onSubmit: () => void;
  onOAuthConnect: (
    platformType: ConnectionPlatformDefinition["type"],
    methodId: string,
    credentials?: { clientId?: string; clientSecret?: string }
  ) => void;
}) {
  const [expandedPlatformType, setExpandedPlatformType] =
    useState<PlatformType | null>(selectedPlatformType);

  if (!drawerOpen) {
    return null;
  }

  const selectedMethodDeactivated = isMethodDeactivated(
    selectedDefinition.type,
    selectedMethod,
    nativeAvailabilityByPlatform
  );
  const selectedNativeAvailability =
    nativeAvailabilityByPlatform[selectedDefinition.type];
  const selectedCallbackUrl = getBrowserOAuthCallbackUrl(selectedDefinition.type);

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
              {CONNECTION_PLATFORM_DEFINITIONS.filter((definition) =>
                hasMethodForMode(definition, selectedMethodMode)
              ).map((definition) => {
                const active = definition.type === selectedPlatformType;
                const expanded = definition.type === expandedPlatformType;
                const meta = getPlatformMeta(definition.type);
                const visibleMethods = definition.methods.filter((method) =>
                  selectedMethodMode === "native"
                    ? method.provider === "direct"
                    : method.provider !== "direct"
                );
                const nativeDeactivated = hasDeactivatedOAuthMethod(
                  definition,
                  nativeAvailabilityByPlatform
                );
                const docs = getUniqueConnectionDocs(
                  visibleMethods.flatMap((method) => method.docs)
                );
                return (
                  <div
                    key={definition.type}
                    className={`w-full rounded-[16px] border transition ${
                      active
                        ? "border-[rgba(15,126,169,0.26)] bg-white"
                        : "border-[rgba(33,25,19,0.08)] bg-[rgba(255,255,255,0.72)]"
                    }`}
                  >
                    <div className="flex items-center gap-3 px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (expanded) {
                            setExpandedPlatformType(null);
                            return;
                          }
                          onPlatformChange(definition.type);
                          setExpandedPlatformType(definition.type);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
                          style={{
                            backgroundColor: `${meta.accent}18`,
                            color: meta.accent,
                          }}
                        >
                          <PlatformBrandIcon
                            type={definition.type}
                            className="h-5 w-5"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#211913]">
                            {definition.label}
                          </p>
                          <p className="text-xs text-[#7a6756]">
                            {definition.summary}
                          </p>
                          {nativeDeactivated ? (
                            <p className="mt-1 text-[11px] font-semibold text-[#a36211]">
                              Native deactivated
                            </p>
                          ) : null}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <ConnectionDocButton docs={docs} label={definition.label} />
                      </div>
                    </div>
                    {expanded ? (
                      <div className="border-t border-[rgba(33,25,19,0.08)] px-3 pb-3 pt-3">
                        <div className="mt-2 space-y-2">
                          {visibleMethods.map((method) => (
                            <div key={method.id}>
                              <ConnectionMethodOption
                                method={method}
                                definition={definition}
                                active={method.id === selectedMethod.id}
                                deactivated={isMethodDeactivated(
                                  definition.type,
                                  method,
                                  nativeAvailabilityByPlatform
                                )}
                                onSelect={() => onMethodChange(method.id)}
                                onConnect={() =>
                                  onOAuthConnect(
                                    definition.type,
                                    method.id,
                                    getOAuthCredentials(formState, method.id)
                                  )
                                }
                                callbackUrl={getBrowserOAuthCallbackUrl(
                                  definition.type
                                )}
                                availability={
                                  nativeAvailabilityByPlatform[definition.type]
                                }
                                clientId={readOAuthCredential(
                                  formState,
                                  method.id,
                                  "clientId"
                                )}
                                clientSecret={readOAuthCredential(
                                  formState,
                                  method.id,
                                  "clientSecret"
                                )}
                                onCredentialChange={(key, value) =>
                                  onFieldChange(
                                    getOAuthCredentialKey(method.id, key),
                                    value
                                  )
                                }
                              />
                              {method.id === selectedMethod.id &&
                              method.authType !== "oauth" ? (
                                <div className="mt-2 space-y-3 rounded-[14px] border border-[rgba(33,25,19,0.08)] bg-white/75 p-3">
                                  {method.fields.map((field) => (
                                    <ConnectionFieldInput
                                      key={field.id}
                                      field={field}
                                      value={formState[field.id]}
                                      onChange={(value) =>
                                        onFieldChange(field.id, value)
                                      }
                                    />
                                  ))}
                                  <button
                                    type="button"
                                    onClick={onSubmit}
                                    disabled={isSaving}
                                    className="inline-flex w-full items-center justify-center rounded-[12px] bg-[#121d2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                                  >
                                    {isSaving ? "Connecting..." : "Create connection"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
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

            <div className="mt-4 grid grid-cols-2 rounded-[14px] border border-[rgba(33,25,19,0.08)] bg-[#f7f1e5] p-1">
              {(["native", "proxy"] as const).map((mode) => {
                const enabled = availableMethodModes.includes(mode);
                const active = selectedMethodMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!enabled}
                    onClick={() => onMethodModeChange(mode)}
                    className={`rounded-[11px] px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      active
                        ? "bg-white text-[#211913] shadow-[0_3px_12px_rgba(33,25,19,0.08)]"
                        : "text-[#746253]"
                    }`}
                  >
                    {mode === "native" ? "Native" : "Proxy"}
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
                {selectedMethod.authType === "oauth" ? (
                  <ConnectionSetupGuideButton
                    definition={selectedDefinition}
                    method={selectedMethod}
                    callbackUrl={selectedCallbackUrl}
                    availability={selectedNativeAvailability}
                  />
                ) : null}
                <ConnectionDocPillLinks docs={selectedMethod.docs} />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {selectedMethod.authType === "oauth" ? (
                <OAuthSetupPanel
                  availability={selectedNativeAvailability}
                  callbackUrl={selectedCallbackUrl}
                  deactivated={selectedMethodDeactivated}
                />
              ) : (
                selectedMethod.fields.map((field) => (
                  <ConnectionFieldInput
                    key={field.id}
                    field={field}
                    value={formState[field.id]}
                    onChange={(value) => onFieldChange(field.id, value)}
                  />
                ))
              )}
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
                disabled={isSaving || selectedMethodDeactivated}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#121d2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {selectedMethodDeactivated
                  ? "Deactivated"
                  : isSaving
                  ? "Connecting..."
                  : selectedMethod.authType === "oauth"
                    ? "Continue with OAuth"
                    : "Create connection"}
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

function hasDeactivatedOAuthMethod(
  definition: ConnectionPlatformDefinition,
  availabilityByPlatform: Record<PlatformType, NativeConnectionAvailability>
) {
  return definition.methods.some((method) =>
    isMethodDeactivated(definition.type, method, availabilityByPlatform)
  );
}

function isMethodDeactivated(
  platformType: PlatformType,
  method: ConnectionMethod,
  availabilityByPlatform: Record<PlatformType, NativeConnectionAvailability>
) {
  if (method.authType !== "oauth") return false;
  return availabilityByPlatform[platformType]?.configured === false;
}

function hasMethodForMode(
  definition: ConnectionPlatformDefinition,
  mode: "native" | "proxy"
) {
  return definition.methods.some((method) =>
    mode === "native" ? method.provider === "direct" : method.provider !== "direct"
  );
}

function getOAuthCredentials(formState: FormState, methodId: string) {
  return {
    clientId: readOAuthCredential(formState, methodId, "clientId"),
    clientSecret: readOAuthCredential(formState, methodId, "clientSecret"),
  };
}

function readOAuthCredential(
  formState: FormState,
  methodId: string,
  key: "clientId" | "clientSecret"
) {
  const value = formState[getOAuthCredentialKey(methodId, key)];
  return typeof value === "string" ? value.trim() : "";
}

function getOAuthCredentialKey(methodId: string, key: "clientId" | "clientSecret") {
  return `oauth.${methodId}.${key}`;
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
