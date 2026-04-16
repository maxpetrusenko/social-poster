import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrowserChrome } from "./tiktok-demo/BrowserChrome";
import type { TikTokDemoProps } from "./tiktok-demo/types";

/* ── Palette ────────────────────────────────────────────────── */

const APP_BG = "#fffcf7";
const APP_BORDER = "#ddd2bf";
const APP_TEXT = "#171717";
const APP_MUTED = "#8e7556";
const TIKTOK_BG = "#121212";
const TIKTOK_RED = "#fe2c55";
const TIKTOK_CYAN = "#25f4ee";
const SUCCESS_GREEN = "#22c55e";
const CARD_BG = "rgba(255,252,247,0.92)";

/* ── Sidebar ────────────────────────────────────────────────── */

const SIDEBAR_ITEMS = [
  { label: "Overview", icon: "◎", active: false },
  { label: "Publish", icon: "📅", active: false },
  { label: "Compose", icon: "✏️", active: false },
  { label: "Schedules", icon: "▶", active: false },
  { label: "RSS Feeds", icon: "◉", active: false },
  { label: "Connections", icon: "🔗", active: true },
  { label: "Profiles", icon: "👤", active: false },
  { label: "Settings", icon: "⚙", active: false },
];

function Sidebar({ activeItem }: { activeItem: string }) {
  return (
    <div
      style={{
        width: 220,
        height: "100%",
        backgroundColor: "#faf8f4",
        borderRight: `1px solid ${APP_BORDER}`,
        padding: "24px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: APP_TEXT,
          padding: "0 12px 20px",
          letterSpacing: -0.5,
        }}
      >
        Social Poster
      </div>
      {SIDEBAR_ITEMS.map((item) => {
        const isActive = item.label === activeItem;
        return (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 10,
              backgroundColor: isActive ? "rgba(142,117,86,0.1)" : "transparent",
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? APP_TEXT : "#666",
            }}
          >
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

/* ── Animated Cursor ────────────────────────────────────────── */

function Cursor({ x, y, clicking }: { x: number; y: number; clicking: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 100,
        pointerEvents: "none",
        transform: clicking ? "scale(0.85)" : "scale(1)",
        transition: "transform 0.1s",
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 3L19 12L12 13L9 20L5 3Z"
          fill="white"
          stroke="#333"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {clicking && (
        <div
          style={{
            position: "absolute",
            top: -8,
            left: -8,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "2px solid rgba(254,44,85,0.5)",
            animation: "none",
          }}
        />
      )}
    </div>
  );
}

/* ── Typing Text ────────────────────────────────────────────── */

function TypingText({
  text,
  progress,
  style,
}: {
  text: string;
  progress: number;
  style?: React.CSSProperties;
}) {
  const chars = Math.floor(text.length * Math.min(1, progress));
  const visible = text.slice(0, chars);
  const showCursor = progress < 1;
  return (
    <span style={style}>
      {visible}
      {showCursor && (
        <span style={{ borderRight: "2px solid #333", marginLeft: 1 }}>&nbsp;</span>
      )}
    </span>
  );
}

/* ── Main Composition ───────────────────────────────────────── */

export const TikTokAppReview: React.FC<TikTokDemoProps> = ({
  appDomain,
  tiktokHandle,
  displayName,
  followerCount,
  durationInSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.round(durationInSeconds * fps);

  /* Scene timing (frames) */
  const s = (sec: number) => Math.round(sec * fps);

  const scenes = [
    { name: "dashboard", start: 0, dur: s(3) },
    { name: "connect", start: s(3), dur: s(5) },
    { name: "authorize", start: s(8), dur: s(6) },
    { name: "connected", start: s(14), dur: s(4) },
    { name: "compose", start: s(18), dur: s(7) },
    { name: "publish", start: s(25), dur: s(5) },
    { name: "success", start: s(30), dur: s(5) },
  ];

  const getScene = () => {
    for (let i = scenes.length - 1; i >= 0; i--) {
      if (frame >= scenes[i].start) return scenes[i];
    }
    return scenes[0];
  };

  const scene = getScene();
  const localFrame = frame - scene.start;
  const sceneProgress = localFrame / scene.dur;

  const fadeIn = (startFrame: number, dur = 8) =>
    interpolate(frame, [startFrame, startFrame + dur], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

  const slideUp = (startFrame: number) =>
    spring({ frame: Math.max(0, frame - startFrame), fps, config: { damping: 14, stiffness: 180 } });

  /* Cursor position interpolation */
  const cursorX = interpolate(
    frame,
    [0, s(3.5), s(4.5), s(9), s(12), s(19), s(26)],
    [960, 700, 700, 600, 600, 500, 700],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const cursorY = interpolate(
    frame,
    [0, s(3.5), s(4.5), s(9), s(12), s(19), s(26)],
    [400, 380, 380, 480, 480, 300, 500],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const isClicking =
    (frame >= s(4.3) && frame <= s(4.6)) ||
    (frame >= s(11.8) && frame <= s(12.1)) ||
    (frame >= s(25.8) && frame <= s(26.1));

  /* URL for browser chrome */
  const urls: Record<string, string> = {
    dashboard: `${appDomain}/dashboard`,
    connect: `${appDomain}/dashboard/connections`,
    authorize: "www.tiktok.com/v2/auth/authorize",
    connected: `${appDomain}/dashboard/connections`,
    compose: `${appDomain}/dashboard/compose`,
    publish: `${appDomain}/dashboard/compose`,
    success: `${appDomain}/dashboard/compose`,
  };

  return (
    <AbsoluteFill
      style={{ fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif' }}
    >
      <BrowserChrome url={urls[scene.name] || appDomain}>
        {/* ─── Scene 1: Dashboard ─────────────────────── */}
        {scene.name === "dashboard" && (
          <div style={{ display: "flex", height: "100%", backgroundColor: APP_BG }}>
            <Sidebar activeItem="Connections" />
            <div style={{ flex: 1, padding: 40 }}>
              <div style={{ opacity: fadeIn(0) }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    color: APP_MUTED,
                  }}
                >
                  Workspace
                </p>
                <h1
                  style={{
                    fontSize: 36,
                    fontWeight: 600,
                    color: APP_TEXT,
                    letterSpacing: -1,
                    margin: "4px 0 24px",
                  }}
                >
                  Social Poster Dashboard
                </h1>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 16,
                  opacity: fadeIn(s(0.5)),
                  transform: `translateY(${(1 - slideUp(s(0.5))) * 20}px)`,
                }}
              >
                {[
                  { label: "Connected Accounts", value: "7", sub: "4 platforms" },
                  { label: "Posts Published", value: "142", sub: "Last 30 days" },
                  { label: "Scheduled", value: "12", sub: "Upcoming" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      backgroundColor: CARD_BG,
                      border: `1px solid ${APP_BORDER}`,
                      borderRadius: 20,
                      padding: "20px 24px",
                    }}
                  >
                    <p style={{ fontSize: 12, color: APP_MUTED, margin: 0 }}>{stat.label}</p>
                    <p
                      style={{
                        fontSize: 32,
                        fontWeight: 700,
                        color: APP_TEXT,
                        margin: "4px 0 2px",
                      }}
                    >
                      {stat.value}
                    </p>
                    <p style={{ fontSize: 12, color: "#999", margin: 0 }}>{stat.sub}</p>
                  </div>
                ))}
              </div>

              {/* Annotation */}
              <div
                style={{
                  marginTop: 40,
                  opacity: fadeIn(s(1.5)),
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    backgroundColor: "#010101",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "8px 16px",
                    borderRadius: 8,
                  }}
                >
                  → Navigating to Connections to add TikTok
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Scene 2: Connect TikTok ────────────────── */}
        {scene.name === "connect" && (
          <div style={{ display: "flex", height: "100%", backgroundColor: APP_BG }}>
            <Sidebar activeItem="Connections" />
            <div style={{ flex: 1, padding: 40 }}>
              <div style={{ opacity: fadeIn(scene.start) }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    color: APP_MUTED,
                  }}
                >
                  Workspace
                </p>
                <h1
                  style={{
                    fontSize: 36,
                    fontWeight: 600,
                    color: APP_TEXT,
                    letterSpacing: -1,
                    margin: "4px 0 24px",
                  }}
                >
                  Connections
                </h1>
              </div>

              {/* Existing connections */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 24,
                  opacity: fadeIn(scene.start + s(0.3)),
                }}
              >
                {[
                  { platform: "Twitter", icon: "𝕏", color: "#0f1419" },
                  { platform: "LinkedIn", icon: "in", color: "#0a66c2" },
                  { platform: "Instagram", icon: "IG", color: "#e1306c" },
                ].map((p) => (
                  <div
                    key={p.platform}
                    style={{
                      backgroundColor: CARD_BG,
                      border: `1px solid ${APP_BORDER}`,
                      borderRadius: 16,
                      padding: "14px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: p.color,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {p.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: APP_TEXT, margin: 0 }}>
                        {p.platform}
                      </p>
                      <p style={{ fontSize: 11, color: SUCCESS_GREEN, margin: 0 }}>Connected</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add TikTok button */}
              <div
                style={{
                  opacity: fadeIn(scene.start + s(0.6)),
                  transform: `translateY(${(1 - slideUp(scene.start + s(0.6))) * 15}px)`,
                }}
              >
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: "#010101",
                    color: "#fff",
                    border: "none",
                    borderRadius: 14,
                    padding: "14px 28px",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: "linear-gradient(135deg, #25f4ee, #fe2c55)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    TT
                  </span>
                  + Connect TikTok
                </button>
              </div>

              {/* OAuth method card */}
              {localFrame > s(2) && (
                <div
                  style={{
                    marginTop: 20,
                    opacity: fadeIn(scene.start + s(2)),
                    transform: `translateY(${(1 - slideUp(scene.start + s(2))) * 20}px)`,
                    backgroundColor: CARD_BG,
                    border: `1px solid ${APP_BORDER}`,
                    borderRadius: 20,
                    padding: 24,
                    maxWidth: 480,
                  }}
                >
                  <p style={{ fontSize: 15, fontWeight: 600, color: APP_TEXT, margin: "0 0 8px" }}>
                    Connect via TikTok OAuth
                  </p>
                  <p style={{ fontSize: 13, color: "#777", margin: "0 0 16px" }}>
                    Sign in with your TikTok account. We'll request access to publish videos
                    through TikTok's Content Posting API.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      marginBottom: 16,
                    }}
                  >
                    {["user.info.basic", "video.publish", "video.upload"].map((scope) => (
                      <span
                        key={scope}
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          backgroundColor: "rgba(1,1,1,0.06)",
                          color: "#555",
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontFamily: "monospace",
                        }}
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      backgroundColor: "#010101",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    Authorize with TikTok →
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Scene 3: TikTok Authorization ──────────── */}
        {scene.name === "authorize" && (
          <div
            style={{
              height: "100%",
              backgroundColor: TIKTOK_BG,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 440,
                backgroundColor: "#1e1e1e",
                borderRadius: 20,
                padding: "36px 32px",
                opacity: fadeIn(scene.start),
                transform: `scale(${slideUp(scene.start)})`,
              }}
            >
              {/* TikTok logo */}
              <div
                style={{
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#fff",
                  }}
                >
                  <span
                    style={{
                      background: `linear-gradient(135deg, ${TIKTOK_CYAN}, ${TIKTOK_RED})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    TikTok
                  </span>
                  <span style={{ color: "#666", fontWeight: 400 }}>for Developers</span>
                </div>
              </div>

              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#fff",
                  textAlign: "center",
                  margin: "0 0 4px",
                }}
              >
                Social Poster wants to access your account
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "#888",
                  textAlign: "center",
                  margin: "0 0 24px",
                }}
              >
                {appDomain}
              </p>

              {/* Scopes */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {[
                  {
                    scope: "user.info.basic",
                    label: "Read your basic profile info",
                    desc: "Display name, avatar, follower count",
                    product: "Login Kit + Display API",
                  },
                  {
                    scope: "video.publish",
                    label: "Publish videos to your account",
                    desc: "Post videos via Content Posting API",
                    product: "Content Posting API",
                  },
                  {
                    scope: "video.upload",
                    label: "Upload video files",
                    desc: "Direct file upload for video content",
                    product: "Content Posting API",
                  },
                ].map((s) => (
                  <div
                    key={s.scope}
                    style={{
                      backgroundColor: "rgba(255,255,255,0.05)",
                      borderRadius: 12,
                      padding: "12px 16px",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: 0 }}>
                        {s.label}
                      </p>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: TIKTOK_CYAN,
                          backgroundColor: "rgba(37,244,238,0.1)",
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {s.product}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>{s.desc}</p>
                    <code
                      style={{
                        fontSize: 11,
                        color: "#aaa",
                        backgroundColor: "rgba(255,255,255,0.04)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        marginTop: 4,
                        display: "inline-block",
                      }}
                    >
                      {s.scope}
                    </code>
                  </div>
                ))}
              </div>

              {/* Authorize button */}
              {localFrame > s(3) && (
                <div
                  style={{
                    opacity: fadeIn(scene.start + s(3)),
                  }}
                >
                  <div
                    style={{
                      background: `linear-gradient(135deg, ${TIKTOK_RED}, #ff6b81)`,
                      color: "#fff",
                      borderRadius: 12,
                      padding: "14px 0",
                      fontSize: 16,
                      fontWeight: 700,
                      textAlign: "center",
                      boxShadow: "0 4px 20px rgba(254,44,85,0.3)",
                    }}
                  >
                    ✓ Authorize
                  </div>
                </div>
              )}

              {/* Annotation */}
              {localFrame > s(4) && (
                <div
                  style={{
                    marginTop: 16,
                    opacity: fadeIn(scene.start + s(4)),
                    textAlign: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: TIKTOK_CYAN,
                      fontWeight: 500,
                    }}
                  >
                    → TikTok Login Kit OAuth 2.0 flow initiated
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Scene 4: Account Connected ─────────────── */}
        {scene.name === "connected" && (
          <div style={{ display: "flex", height: "100%", backgroundColor: APP_BG }}>
            <Sidebar activeItem="Connections" />
            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  opacity: fadeIn(scene.start),
                  transform: `scale(${slideUp(scene.start)})`,
                  backgroundColor: CARD_BG,
                  border: `1px solid ${APP_BORDER}`,
                  borderRadius: 24,
                  padding: "36px 40px",
                  textAlign: "center",
                  maxWidth: 420,
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: "50%",
                    backgroundColor: "rgba(34,197,94,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 16px",
                    fontSize: 28,
                  }}
                >
                  ✓
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: APP_TEXT, margin: "0 0 8px" }}>
                  TikTok Connected
                </h2>
                <p style={{ fontSize: 13, color: "#888", margin: "0 0 24px" }}>
                  Account authorized via TikTok Login Kit
                </p>

                {/* Profile card from Display API */}
                <div
                  style={{
                    backgroundColor: "#fafaf8",
                    border: `1px solid ${APP_BORDER}`,
                    borderRadius: 16,
                    padding: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    textAlign: "left",
                    opacity: fadeIn(scene.start + s(1)),
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${TIKTOK_CYAN}, ${TIKTOK_RED})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      fontWeight: 800,
                      color: "#fff",
                    }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: APP_TEXT, margin: 0 }}>
                      {displayName}
                    </p>
                    <p style={{ fontSize: 13, color: "#888", margin: "2px 0" }}>
                      @{tiktokHandle}
                    </p>
                    <p style={{ fontSize: 12, color: APP_MUTED, margin: 0 }}>
                      {followerCount} followers
                    </p>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: SUCCESS_GREEN,
                      backgroundColor: "rgba(34,197,94,0.08)",
                      padding: "4px 10px",
                      borderRadius: 6,
                    }}
                  >
                    Active
                  </div>
                </div>

                {/* API info */}
                <div
                  style={{
                    marginTop: 16,
                    opacity: fadeIn(scene.start + s(1.8)),
                    display: "flex",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "#888",
                      backgroundColor: "rgba(0,0,0,0.03)",
                      padding: "3px 8px",
                      borderRadius: 4,
                    }}
                  >
                    Display API → user.info.basic
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Scene 5: Compose Video Post ────────────── */}
        {scene.name === "compose" && (
          <div style={{ display: "flex", height: "100%", backgroundColor: APP_BG }}>
            <Sidebar activeItem="Compose" />
            <div style={{ flex: 1, padding: 40 }}>
              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: APP_TEXT,
                  letterSpacing: -0.5,
                  margin: "0 0 24px",
                  opacity: fadeIn(scene.start),
                }}
              >
                Create Post
              </h1>

              <div style={{ display: "flex", gap: 24 }}>
                {/* Composer form */}
                <div
                  style={{
                    flex: 1,
                    backgroundColor: CARD_BG,
                    border: `1px solid ${APP_BORDER}`,
                    borderRadius: 20,
                    padding: 24,
                    opacity: fadeIn(scene.start + s(0.3)),
                  }}
                >
                  {/* Platform selector */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                    {[
                      { label: "𝕏", color: "#0f1419", selected: false },
                      { label: "in", color: "#0a66c2", selected: false },
                      { label: "TT", color: "#010101", selected: true },
                    ].map((p) => (
                      <div
                        key={p.label}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          backgroundColor: p.selected ? p.color : "rgba(0,0,0,0.04)",
                          color: p.selected ? "#fff" : "#888",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 700,
                          border: p.selected ? "2px solid " + p.color : "1px solid #e0e0e0",
                        }}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>

                  {/* Format selector */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    {["Video", "Photo"].map((fmt) => (
                      <div
                        key={fmt}
                        style={{
                          padding: "6px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: fmt === "Video" ? 600 : 400,
                          backgroundColor: fmt === "Video" ? "#010101" : "transparent",
                          color: fmt === "Video" ? "#fff" : "#888",
                          border: fmt === "Video" ? "none" : "1px solid #ddd",
                        }}
                      >
                        {fmt}
                      </div>
                    ))}
                  </div>

                  {/* Caption */}
                  <div
                    style={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e5e5",
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                      minHeight: 100,
                    }}
                  >
                    <TypingText
                      text="AI is transforming how we create content. Here's what you need to know about the latest breakthroughs 🤖✨ #AI #Tech #Innovation"
                      progress={interpolate(localFrame, [s(1), s(4)], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      })}
                      style={{ fontSize: 14, color: APP_TEXT, lineHeight: 1.6 }}
                    />
                  </div>

                  {/* Video attachment */}
                  {localFrame > s(4.5) && (
                    <div
                      style={{
                        opacity: fadeIn(scene.start + s(4.5)),
                        backgroundColor: "#f8f8f6",
                        border: "1px dashed #ccc",
                        borderRadius: 12,
                        padding: 16,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 8,
                          backgroundColor: "#010101",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                          color: "#fff",
                        }}
                      >
                        ▶
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: APP_TEXT, margin: 0 }}>
                          ai-news-recap.mp4
                        </p>
                        <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0" }}>
                          1080×1920 • 18s • 12.4 MB
                        </p>
                      </div>
                      <div
                        style={{
                          marginLeft: "auto",
                          fontSize: 12,
                          color: SUCCESS_GREEN,
                          fontWeight: 600,
                        }}
                      >
                        ✓ Ready
                      </div>
                    </div>
                  )}

                  {/* Char count */}
                  <div style={{ marginTop: 12, textAlign: "right" }}>
                    <span style={{ fontSize: 12, color: "#aaa" }}>
                      {Math.min(128, Math.round(128 * Math.min(1, sceneProgress * 1.5)))} / 2200
                    </span>
                  </div>
                </div>

                {/* Preview panel */}
                <div
                  style={{
                    width: 240,
                    opacity: fadeIn(scene.start + s(1)),
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 600, color: APP_MUTED, margin: "0 0 12px" }}>
                    Preview
                  </p>
                  <div
                    style={{
                      width: 220,
                      height: 390,
                      backgroundColor: "#010101",
                      borderRadius: 24,
                      overflow: "hidden",
                      border: "3px solid #333",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      padding: 16,
                    }}
                  >
                    <p style={{ fontSize: 12, color: "#fff", margin: "0 0 8px", lineHeight: 1.4 }}>
                      @{tiktokHandle}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", margin: 0, lineHeight: 1.3 }}>
                      AI is transforming how we create content...
                    </p>
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      {["#AI", "#Tech"].map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            color: "rgba(255,255,255,0.6)",
                            fontWeight: 500,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Scene 6: Publishing ────────────────────── */}
        {scene.name === "publish" && (
          <div style={{ display: "flex", height: "100%", backgroundColor: APP_BG }}>
            <Sidebar activeItem="Compose" />
            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  backgroundColor: CARD_BG,
                  border: `1px solid ${APP_BORDER}`,
                  borderRadius: 24,
                  padding: "36px 40px",
                  maxWidth: 520,
                  width: "100%",
                  opacity: fadeIn(scene.start),
                }}
              >
                <h2 style={{ fontSize: 20, fontWeight: 700, color: APP_TEXT, margin: "0 0 20px" }}>
                  Publishing to TikTok
                </h2>

                {/* Step 1: Token */}
                <div style={{ marginBottom: 16, opacity: fadeIn(scene.start + s(0.3)) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: SUCCESS_GREEN, fontSize: 16 }}>✓</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: APP_TEXT }}>
                      Access token verified
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 0 24px" }}>
                    OAuth token refreshed via /v2/oauth/token/
                  </p>
                </div>

                {/* Step 2: Init */}
                <div style={{ marginBottom: 16, opacity: fadeIn(scene.start + s(1)) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: SUCCESS_GREEN, fontSize: 16 }}>✓</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: APP_TEXT }}>
                      Upload initialized
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#888", margin: "0 0 0 24px" }}>
                    POST /v2/post/publish/video/init/ → source: FILE_UPLOAD
                  </p>
                </div>

                {/* Step 3: Upload */}
                <div style={{ marginBottom: 16, opacity: fadeIn(scene.start + s(2)) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {localFrame > s(3.5) ? (
                      <span style={{ color: SUCCESS_GREEN, fontSize: 16 }}>✓</span>
                    ) : (
                      <span style={{ color: "#f59e0b", fontSize: 16 }}>⟳</span>
                    )}
                    <span style={{ fontSize: 14, fontWeight: 600, color: APP_TEXT }}>
                      Uploading video file
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div
                    style={{
                      marginLeft: 24,
                      height: 6,
                      backgroundColor: "#eee",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, interpolate(localFrame, [s(2), s(3.5)], [0, 100], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        }))}%`,
                        height: "100%",
                        backgroundColor: "#010101",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0 24px" }}>
                    PUT upload_url → Content-Type: video/mp4 (12.4 MB)
                  </p>
                </div>

                {/* Step 4: Published */}
                {localFrame > s(3.5) && (
                  <div
                    style={{
                      opacity: fadeIn(scene.start + s(3.5)),
                      marginBottom: 0,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: SUCCESS_GREEN, fontSize: 16 }}>✓</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: APP_TEXT }}>
                        Video published
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0 24px" }}>
                      Content Posting API → publish_id received
                    </p>
                  </div>
                )}

                {/* API annotation */}
                <div
                  style={{
                    marginTop: 24,
                    backgroundColor: "rgba(0,0,0,0.03)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    opacity: fadeIn(scene.start + s(1)),
                  }}
                >
                  <p style={{ fontSize: 11, color: "#888", margin: 0, fontFamily: "monospace" }}>
                    Scope: video.publish + video.upload
                  </p>
                  <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0", fontFamily: "monospace" }}>
                    Endpoint: open.tiktokapis.com/v2/post/publish/video/init/
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Scene 7: Success ───────────────────────── */}
        {scene.name === "success" && (
          <div style={{ display: "flex", height: "100%", backgroundColor: APP_BG }}>
            <Sidebar activeItem="Compose" />
            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  opacity: fadeIn(scene.start),
                  transform: `scale(${slideUp(scene.start)})`,
                  maxWidth: 560,
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${TIKTOK_CYAN}, ${TIKTOK_RED})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    fontSize: 32,
                    color: "#fff",
                    fontWeight: 800,
                    boxShadow: "0 8px 32px rgba(254,44,85,0.25)",
                  }}
                >
                  ✓
                </div>
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: APP_TEXT,
                    margin: "0 0 8px",
                  }}
                >
                  Published to TikTok
                </h2>
                <p style={{ fontSize: 14, color: "#888", margin: "0 0 28px" }}>
                  Video successfully posted via Content Posting API
                </p>

                {/* Summary cards */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    justifyContent: "center",
                    flexWrap: "wrap",
                    opacity: fadeIn(scene.start + s(1)),
                  }}
                >
                  {[
                    {
                      title: "Login Kit",
                      desc: "OAuth 2.0 authorization",
                      scope: "user.info.basic",
                    },
                    {
                      title: "Display API",
                      desc: "Profile information",
                      scope: "user.info.basic",
                    },
                    {
                      title: "Content Posting",
                      desc: "Video file upload",
                      scope: "video.publish + video.upload",
                    },
                  ].map((card) => (
                    <div
                      key={card.title}
                      style={{
                        backgroundColor: CARD_BG,
                        border: `1px solid ${APP_BORDER}`,
                        borderRadius: 14,
                        padding: "14px 18px",
                        textAlign: "left",
                        minWidth: 150,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: APP_TEXT,
                          margin: "0 0 4px",
                        }}
                      >
                        {card.title}
                      </p>
                      <p style={{ fontSize: 11, color: "#888", margin: "0 0 6px" }}>
                        {card.desc}
                      </p>
                      <code
                        style={{
                          fontSize: 10,
                          color: APP_MUTED,
                          backgroundColor: "rgba(0,0,0,0.03)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {card.scope}
                      </code>
                    </div>
                  ))}
                </div>

                {/* App domain */}
                <div style={{ marginTop: 24, opacity: fadeIn(scene.start + s(2)) }}>
                  <p style={{ fontSize: 12, color: "#aaa" }}>
                    {appDomain} — Social Poster TikTok Integration
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </BrowserChrome>

      {/* Cursor overlay */}
      <Cursor x={cursorX} y={cursorY} clicking={isClicking} />

      {/* Scene label */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 50,
          backgroundColor: "rgba(0,0,0,0.7)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 6,
        }}
      >
        {scene.name === "dashboard" && "Step 1: App Dashboard"}
        {scene.name === "connect" && "Step 2: Connect TikTok (Login Kit)"}
        {scene.name === "authorize" && "Step 3: OAuth Authorization"}
        {scene.name === "connected" && "Step 4: Account Connected (Display API)"}
        {scene.name === "compose" && "Step 5: Create Video Post"}
        {scene.name === "publish" && "Step 6: Content Posting API"}
        {scene.name === "success" && "Step 7: Published Successfully"}
      </div>
    </AbsoluteFill>
  );
};
