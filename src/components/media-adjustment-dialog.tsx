"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";

import {
  buildMediaAdjustmentPresets,
  computeCanvasPlacement,
  validateOriginalImageForPlatforms,
  type MediaAdjustmentPlatform,
  type MediaAdjustmentPreset,
  type MediaFitMode,
  type OriginalImageValidation,
} from "@/lib/media-adjustment";

type Props = {
  sourceUrl: string;
  platforms: MediaAdjustmentPlatform[];
  onClose: () => void;
  onApply: (url: string) => void;
};

export function MediaAdjustmentDialog({ sourceUrl, platforms, onClose, onApply }: Props) {
  const presets = useMemo(() => buildMediaAdjustmentPresets(platforms), [platforms]);
  const [presetKey, setPresetKey] = useState(presets[0]?.key ?? "");
  const [mode, setMode] = useState<MediaFitMode>("fill");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [applying, setApplying] = useState(false);
  const [originalInfo, setOriginalInfo] = useState<{
    width: number;
    height: number;
    bytes: number | null;
    validation: OriginalImageValidation;
  } | null>(null);
  const [error, setError] = useState("");
  const allPresets: MediaAdjustmentPreset[] = [
    {
      key: "original",
      platformLabel: "Original",
      platformType: "original",
      label: "No resize",
      width: originalInfo?.width ?? 1,
      height: originalInfo?.height ?? 1,
      aspect: originalInfo ? ratioLabel(originalInfo.width, originalInfo.height) : "source",
    },
    ...presets,
  ];
  const preset = allPresets.find((item) => item.key === presetKey) ?? allPresets[1] ?? allPresets[0];
  const usingOriginal = preset?.key === "original";
  const resizePreset = usingOriginal ? null : preset;
  const previewUrl = proxiedImageUrl(sourceUrl);

  async function applyAdjustment() {
    if (!preset) return;

    setApplying(true);
    setError("");

    try {
      const image = await loadImage(previewUrl);
      const info = await buildOriginalInfo(image, platforms);
      setOriginalInfo(info);
      if (usingOriginal) {
        onApply(sourceUrl);
        onClose();
        return;
      }

      if (!resizePreset) return;
      const canvas = document.createElement("canvas");
      canvas.width = resizePreset.width;
      canvas.height = resizePreset.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, resizePreset.width, resizePreset.height);
      const placement = computeCanvasPlacement({
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
        targetWidth: resizePreset.width,
        targetHeight: resizePreset.height,
        mode,
        zoom,
        offsetX,
        offsetY,
      });
      context.drawImage(
        image,
        placement.dx,
        placement.dy,
        placement.drawWidth,
        placement.drawHeight
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("Could not export adjusted image.");

      const formData = new FormData();
      formData.append(
        "file",
        new File([blob], `${resizePreset.platformLabel}-${resizePreset.width}x${resizePreset.height}.jpg`, {
          type: "image/jpeg",
        })
      );

      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") {
        throw new Error(typeof result.error === "string" ? result.error : "Upload failed.");
      }

      onApply(result.url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not adjust image.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adjust media</h2>
            <p className="text-xs text-gray-500">Crop or fit the image to the selected platform size.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-[28rem] items-center justify-center rounded-lg bg-gray-100 p-4">
            {preset ? (
              <div
                className="relative max-h-[68vh] w-full max-w-3xl overflow-hidden bg-white shadow-sm"
                style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt=""
                  className="h-full w-full"
                  style={{
                    objectFit: usingOriginal ? "contain" : mode === "fill" ? "cover" : "contain",
                    objectPosition: `${50 + offsetX / 2}% ${50 + offsetY / 2}%`,
                    transform: usingOriginal ? "none" : `scale(${zoom})`,
                    transformOrigin: "center",
                  }}
                  onLoad={(event) => {
                    void buildOriginalInfo(event.currentTarget, platforms).then(setOriginalInfo);
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Preset</p>
              <div className="space-y-2">
                {allPresets.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPresetKey(item.key)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      item.key === preset?.key
                        ? "border-[#7a3030] bg-[#7a3030]/5 text-gray-900"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{item.platformLabel} {item.label}</span>
                      {item.key === "original" && originalInfo ? (
                        <ValidationPill status={originalInfo.validation.status} />
                      ) : null}
                    </span>
                    <span className="text-gray-500">{item.width}x{item.height} ({item.aspect})</span>
                  </button>
                ))}
              </div>
            </div>

            {usingOriginal && originalInfo ? (
              <div className={`rounded-lg border px-3 py-2 text-xs ${
                originalInfo.validation.status === "fail"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : originalInfo.validation.status === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}>
                <div className="mb-1 flex items-center gap-1.5 font-semibold">
                  {originalInfo.validation.status === "pass" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  Original {originalInfo.width}x{originalInfo.height}
                </div>
                <div className="space-y-1">
                  {originalInfo.validation.messages.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {!usingOriginal ? <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("fill")}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${mode === "fill" ? "border-[#7a3030] bg-[#7a3030]/5 text-[#7a3030]" : "border-gray-200 text-gray-600"}`}
                >
                  Fill crop
                </button>
                <button
                  type="button"
                  onClick={() => setMode("fit")}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${mode === "fit" ? "border-[#7a3030] bg-[#7a3030]/5 text-[#7a3030]" : "border-gray-200 text-gray-600"}`}
                >
                  Fit pad
                </button>
              </div>
            </div> : null}

            {!usingOriginal ? (
              <>
                <Slider label="Zoom" value={zoom} min={1} max={3} step={0.01} onChange={setZoom} />
                <Slider label="Horizontal" value={offsetX} min={-100} max={100} step={1} onChange={setOffsetX} />
                <Slider label="Vertical" value={offsetY} min={-100} max={100} step={1} onChange={setOffsetY} />
              </>
            ) : null}

            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

            <button
              type="button"
              onClick={() => void applyAdjustment()}
              disabled={applying}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#7a3030] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6a2828] disabled:opacity-60"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {usingOriginal && originalInfo?.validation.status !== "pass" ? "Use original anyway" : usingOriginal ? "Use original image" : "Apply adjusted image"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationPill({ status }: { status: OriginalImageValidation["status"] }) {
  const className =
    status === "pass"
      ? "bg-emerald-100 text-emerald-700"
      : status === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";

  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${className}`}>
      {status}
    </span>
  );
}

async function buildOriginalInfo(image: HTMLImageElement, platforms: MediaAdjustmentPlatform[]) {
  const bytes = await fetchByteSize(image.src);
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    bytes,
    validation: validateOriginalImageForPlatforms({
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      sourceBytes: bytes,
      platforms,
    }),
  };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-medium text-gray-600">
        <span>{label}</span>
        <span>{label === "Zoom" ? value.toFixed(2) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="w-full accent-[#7a3030]"
      />
    </label>
  );
}

function proxiedImageUrl(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/og-image?${new URLSearchParams({ url }).toString()}`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image for editing."));
    image.src = url;
  });
}

async function fetchByteSize(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const length = Number(response.headers.get("content-length") || 0);
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

function ratioLabel(width: number, height: number) {
  const gcdValue = gcd(width, height);
  return `${Math.round(width / gcdValue)}:${Math.round(height / gcdValue)}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
