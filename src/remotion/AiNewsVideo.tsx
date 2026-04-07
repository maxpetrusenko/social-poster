import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AiNewsVideoProps } from "./lib/types";
import { AvatarOverlay } from "./components/AvatarOverlay";

const ACCENT = "#DA7756";
const BLUE = "#0f7ea9";
const DARK = "#0e1520";
const CARD_BG = "rgba(10,18,30,0.78)";

/**
 * V3 — Scene-based TikTok AI News Video
 * Each scene gets its own background image held 2-3s.
 * Crossfade between images. Numbered bullet cards.
 * Progress dots. Variety in card placement.
 */
export const AiNewsVideo: React.FC<AiNewsVideoProps> = ({
  headline,
  bullets,
  audioUrl,
  imageUrls,
  avatarVideoUrl,
  durationInSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();  const totalFrames = Math.round(durationInSeconds * fps);
  const images = (imageUrls ?? []).filter(Boolean);

  // === SCENE TIMELINE ===
  // Hook(1.5s) → Headline(2.5s) → Bullets(2-3s each) → Outro(2s)
  const hookDur = Math.round(Math.min(1.5, durationInSeconds * 0.1) * fps);
  const headlineDur = Math.round(Math.min(2.5, durationInSeconds * 0.18) * fps);
  const outroDur = Math.round(Math.min(2, durationInSeconds * 0.12) * fps);
  const bulletZone = totalFrames - hookDur - headlineDur - outroDur;
  const bulletCount = bullets.length || 1;
  const bulletDur = Math.max(Math.round(bulletZone / bulletCount), fps); // min 1s per bullet

  // Scene boundaries [start, end)
  const scenes: { start: number; end: number; type: string; idx?: number }[] = [];
  scenes.push({ start: 0, end: hookDur, type: "hook" });
  scenes.push({ start: hookDur, end: hookDur + headlineDur, type: "headline" });
  for (let i = 0; i < bulletCount; i++) {
    const s = hookDur + headlineDur + i * bulletDur;
    scenes.push({ start: s, end: s + bulletDur, type: "bullet", idx: i });
  }
  const outroStart = totalFrames - outroDur;
  scenes.push({ start: outroStart, end: totalFrames, type: "outro" });

  // Assign one image per scene (round-robin if fewer images than scenes)
  const getSceneImage = (sceneIdx: number) => {
    if (images.length === 0) return null;
    return images[sceneIdx % images.length];
  };
  // Find current scene
  const currentSceneIdx = scenes.findIndex((s) => frame >= s.start && frame < s.end);
  const prevSceneIdx = currentSceneIdx > 0 ? currentSceneIdx - 1 : -1;

  // Crossfade duration between images (frames)
  const xfadeDur = Math.round(fps * 0.4);

  // Ken Burns zoom per scene — slow steady zoom 1.0 → 1.06
  const sceneLocalFrame = currentSceneIdx >= 0 ? frame - scenes[currentSceneIdx].start : 0;
  const sceneTotalDur = currentSceneIdx >= 0 ? scenes[currentSceneIdx].end - scenes[currentSceneIdx].start : 1;
  const zoomProgress = sceneLocalFrame / sceneTotalDur;
  const zoom = 1 + zoomProgress * 0.06;

  // Global progress (for top bar)
  const progress = Math.min(frame / totalFrames, 1);

  // === CARD PLACEMENT VARIETY ===
  // Alternate card positions: center, bottom-third, center, top-third...
  const cardPositions: Array<"center" | "bottom" | "top"> = ["center", "bottom", "center", "top", "bottom", "center"];
  const getCardPosition = (idx: number) => cardPositions[idx % cardPositions.length];

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>

      {/* === BACKGROUND IMAGES with crossfade === */}
      {images.length > 0 && scenes.map((scene, sIdx) => {
        const img = getSceneImage(sIdx);
        if (!img) return null;
        // Image opacity: fade in at scene start, fade out at scene end
        const fadeIn = interpolate(frame, [scene.start, scene.start + xfadeDur], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        const fadeOut = interpolate(frame, [scene.end - xfadeDur, scene.end], [1, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        const imgOpacity = Math.min(fadeIn, fadeOut);
        if (imgOpacity <= 0) return null;

        // Per-scene zoom
        const localF = Math.max(0, frame - scene.start);
        const localTotal = scene.end - scene.start;
        const sceneZoom = 1 + (localF / localTotal) * 0.06;

        return (
          <AbsoluteFill key={`bg-${sIdx}`} style={{ opacity: imgOpacity }}>
            <Img
              src={staticFile(img)}
              style={{
                width: "100%", height: "100%", objectFit: "cover",
                transform: `scale(${sceneZoom})`,
                filter: "brightness(0.4) saturate(1.2)",
              }}
            />
          </AbsoluteFill>
        );
      })}
      {/* Fallback gradient when no images */}
      {images.length === 0 && (
        <AbsoluteFill style={{
          background: `radial-gradient(circle at 30% 40%, rgba(218,119,86,0.25), transparent 50%),
                       radial-gradient(circle at 70% 60%, rgba(15,126,169,0.15), transparent 40%),
                       linear-gradient(145deg, ${DARK} 0%, #152438 100%)`,
        }} />
      )}

      {/* === VIGNETTE overlay for depth === */}
      <AbsoluteFill style={{
        background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
        zIndex: 5,
      }} />

      {/* === PROGRESS BAR (top) === */}
      <div style={{
        position: "absolute", top: 0, left: 0, height: 5, zIndex: 30,
        width: `${progress * 100}%`,
        background: `linear-gradient(90deg, ${ACCENT}, ${BLUE})`,
        borderRadius: "0 3px 3px 0",
      }} />

      {/* === SCENE COUNTER DOTS (bottom) === */}
      <div style={{
        position: "absolute", bottom: 100, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 10, zIndex: 25,
      }}>
        {scenes.filter(s => s.type !== "hook").map((s, i) => {          const isActive = frame >= s.start && frame < s.end;
          return (
            <div key={`dot-${i}`} style={{
              width: isActive ? 24 : 8, height: 8, borderRadius: 4,
              backgroundColor: isActive ? ACCENT : "rgba(255,255,255,0.3)",
              transition: "all 0.2s",
            }} />
          );
        })}
      </div>

      {/* ======= HOOK SCENE (first 1.5s) ======= */}
      {frame < hookDur && (() => {
        const hookScale = spring({ frame, fps, config: { damping: 12, stiffness: 200 } });
        const hookOpacity = interpolate(frame, [0, 4, hookDur - 6, hookDur], [0, 1, 1, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        return (
          <AbsoluteFill style={{
            justifyContent: "center", alignItems: "center",
            opacity: hookOpacity, zIndex: 10,
          }}>
            {/* Flash effect */}
            <AbsoluteFill style={{
              backgroundColor: "rgba(255,255,255,0.15)",
              opacity: interpolate(frame, [0, 8], [1, 0], {
                extrapolateRight: "clamp",
              }),
            }} />            <div style={{
              transform: `scale(${hookScale})`, textAlign: "center", padding: "0 40px",
            }}>
              <div style={{
                display: "inline-block", backgroundColor: ACCENT,
                borderRadius: 14, padding: "14px 40px",
                boxShadow: "0 8px 32px rgba(218,119,86,0.4)",
              }}>
                <span style={{
                  fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: 5,
                  fontFamily: '"Inter",sans-serif',
                }}>BREAKING</span>
              </div>
              <p style={{
                fontSize: 22, color: "rgba(255,255,255,0.6)", marginTop: 16,
                fontFamily: '"Inter",sans-serif', letterSpacing: 2,
              }}>AI NEWS</p>
            </div>
          </AbsoluteFill>
        );
      })()}

      {/* ======= HEADLINE SCENE (1.5s — 4s) ======= */}
      {frame >= hookDur && frame < hookDur + headlineDur && (() => {
        const lf = frame - hookDur;
        const hlFade = Math.min(8, Math.floor(headlineDur / 3));
        const hlOpacity = interpolate(frame, [hookDur, hookDur + hlFade, hookDur + headlineDur - hlFade, hookDur + headlineDur], [0, 1, 1, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });        const hlY = spring({ frame: lf, fps, config: { damping: 14, stiffness: 180 } });
        return (
          <AbsoluteFill style={{
            justifyContent: "center", alignItems: "center",
            opacity: hlOpacity, zIndex: 10,
          }}>
            <div style={{
              transform: `translateY(${(1 - hlY) * 40}px)`,
              textAlign: "center", padding: "0 48px", maxWidth: "95%",
            }}>
              {/* Topic label */}
              <div style={{
                display: "inline-block", marginBottom: 20,
                borderBottom: `3px solid ${ACCENT}`, paddingBottom: 8,
              }}>
                <span style={{
                  fontSize: 20, fontWeight: 600, color: ACCENT, letterSpacing: 3,
                  fontFamily: '"Inter",sans-serif', textTransform: "uppercase",
                }}>Artificial Intelligence</span>
              </div>
              <h1 style={{
                fontSize: 68, fontWeight: 900, color: "#fff", margin: 0,
                lineHeight: 1.08, letterSpacing: -1,
                textShadow: "0 6px 24px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.4)",
                fontFamily: '"Inter","SF Pro Display",sans-serif',
              }}>{headline}</h1>
            </div>
          </AbsoluteFill>
        );
      })()}
      {/* ======= BULLET SCENES — each held 2-3s with unique image ======= */}
      {bullets.map((bullet, idx) => {
        const bStart = hookDur + headlineDur + idx * bulletDur;
        const bEnd = bStart + bulletDur;
        if (frame < bStart || frame >= bEnd) return null;

        const localFrame = frame - bStart;
        const bSpring = spring({ frame: localFrame, fps, config: { damping: 13, stiffness: 180 } });
        const fadeOutF = Math.min(8, Math.floor(bulletDur / 4));
        const fadeOut = interpolate(frame, [bEnd - fadeOutF, bEnd], [1, 0], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });

        // Card position varies per bullet
        const pos = getCardPosition(idx);
        const justifyContent = pos === "top" ? "flex-start" : pos === "bottom" ? "flex-end" : "center";
        const paddingTop = pos === "top" ? 200 : 0;
        const paddingBottom = pos === "bottom" ? 220 : 0;

        // Number string
        const numStr = String(idx + 1).padStart(2, "0");
        const totalStr = String(bulletCount).padStart(2, "0");

        return (
          <AbsoluteFill key={idx} style={{
            justifyContent, alignItems: "center",
            paddingTop, paddingBottom,
            opacity: fadeOut, zIndex: 10,
          }}>            <div style={{
              transform: `scale(${bSpring}) translateY(${(1 - bSpring) * 50}px)`,
              padding: "0 44px", maxWidth: "92%", width: "100%",
            }}>
              {/* Number indicator */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
              }}>
                <span style={{
                  fontSize: 52, fontWeight: 900, color: ACCENT,
                  fontFamily: '"Inter",sans-serif', lineHeight: 1,
                  opacity: 0.9,
                }}>{numStr}</span>
                <div style={{
                  flex: 1, height: 2,
                  background: `linear-gradient(90deg, ${ACCENT}, transparent)`,
                }} />
                <span style={{
                  fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.4)",
                  fontFamily: '"Inter",sans-serif',
                }}>/ {totalStr}</span>
              </div>

              {/* Card */}
              <div style={{
                backgroundColor: CARD_BG,
                backdropFilter: "blur(16px)",
                borderRadius: 24,
                padding: "32px 36px",
                borderLeft: `5px solid ${ACCENT}`,
                boxShadow: "0 12px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}>                <p style={{
                  fontSize: 44, fontWeight: 700, color: "#fff", margin: 0,
                  lineHeight: 1.25,
                  textShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  fontFamily: '"Inter","SF Pro",sans-serif',
                }}>{bullet}</p>
              </div>
            </div>
          </AbsoluteFill>
        );
      })}

      {/* ======= OUTRO SCENE — last 2s ======= */}
      {frame >= outroStart && (() => {
        const lf = frame - outroStart;
        const outroSpring = spring({ frame: lf, fps, config: { damping: 14, stiffness: 160 } });
        const outroOpacity = interpolate(frame, [outroStart, outroStart + 8], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp",
        });
        return (
          <AbsoluteFill style={{
            justifyContent: "center", alignItems: "center", zIndex: 10,
            opacity: outroOpacity,
          }}>
            <div style={{
              textAlign: "center",
              transform: `scale(${outroSpring})`,
            }}>
              {/* Accent line */}
              <div style={{
                width: 80, height: 4, borderRadius: 2, margin: "0 auto 20px",
                background: `linear-gradient(90deg, ${ACCENT}, ${BLUE})`,
              }} />              <h2 style={{
                fontSize: 52, fontWeight: 800, color: "#fff", margin: 0,
                textShadow: "0 4px 16px rgba(0,0,0,0.5)",
                fontFamily: '"Inter","SF Pro",sans-serif',
              }}>@petrusenko_max</h2>
              <p style={{
                fontSize: 26, color: "rgba(255,255,255,0.6)", marginTop: 12,
                fontFamily: '"Inter",sans-serif', letterSpacing: 1,
              }}>Follow for daily AI news</p>
              {/* CTA button */}
              <div style={{
                display: "inline-block", marginTop: 28,
                backgroundColor: ACCENT, borderRadius: 40,
                padding: "14px 48px",
                boxShadow: "0 8px 24px rgba(218,119,86,0.35)",
              }}>
                <span style={{
                  fontSize: 24, fontWeight: 700, color: "#fff",
                  fontFamily: '"Inter",sans-serif', letterSpacing: 1,
                }}>FOLLOW</span>
              </div>
              <div style={{
                width: 80, height: 4, borderRadius: 2, margin: "24px auto 0",
                background: `linear-gradient(90deg, ${BLUE}, ${ACCENT})`,
              }} />
            </div>
          </AbsoluteFill>
        );
      })()}
      {/* === AVATAR (bottom-left) === */}
      {avatarVideoUrl && <AvatarOverlay avatarVideoUrl={avatarVideoUrl} />}

      {/* === AUDIO === */}
      <Audio src={staticFile(audioUrl)} />
    </AbsoluteFill>
  );
};