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
import { AvatarOverlay } from "./components/AvatarOverlay";
import { AiNewsVideoProps } from "./lib/types";

const ACCENT = "#f26b3a";
const GOLD = "#ffcf63";
const CYAN = "#62d5ff";
const INK = "#050816";
const CARD = "rgba(7, 12, 27, 0.82)";
const GRID = "rgba(255,255,255,0.08)";

const THEMES = [
  { label: "Signal", accent: ACCENT, helper: CYAN },
  { label: "Flow", accent: CYAN, helper: GOLD },
  { label: "Stack", accent: GOLD, helper: ACCENT },
];

export const AiNewsVideo: React.FC<AiNewsVideoProps> = ({
  headline,
  bullets,
  audioUrl,
  imageUrls,
  avatarVideoUrl,
  durationInSeconds,
  layout = "portrait",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.max(1, Math.round(durationInSeconds * fps));
  const beatFrames = Math.max(fps, Math.round(fps * 2));
  const storyBeats = [headline, ...bullets];
  const sceneIndex = Math.floor(frame / beatFrames);
  const activeBeat = Math.min(storyBeats.length - 1, sceneIndex);
  const beatStart = activeBeat * beatFrames;
  const beatProgress = (frame - beatStart) / beatFrames;
  const enter = spring({ frame: frame - beatStart, fps, config: { damping: 14, stiffness: 180 } });
  const fade = interpolate(beatProgress, [0, 0.1, 0.82, 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progress = Math.min(frame / totalFrames, 1);
  const isSquare = layout === "square";
  const avatarInset = avatarVideoUrl ? (isSquare ? 330 : 430) : 56;
  const cardBottom = isSquare ? 48 : 94;
  const cardMinHeight = isSquare ? 268 : 300;
  const activeTheme = THEMES[sceneIndex % THEMES.length];
  const activeImage = imageUrls?.length ? imageUrls[sceneIndex % imageUrls.length] : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: INK,
        color: "#fff",
        fontFamily: '"Inter","SF Pro Display",sans-serif',
      }}
    >
      <BackgroundLayer
        frame={frame}
        totalFrames={totalFrames}
        accent={activeTheme.accent}
        helper={activeTheme.helper}
        imageUrl={activeImage}
      />

      <div
        style={{
          position: "absolute",
          top: isSquare ? 28 : 34,
          left: isSquare ? 34 : 40,
          right: isSquare ? 34 : 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 20,
        }}
      >
        <div
          style={{
            borderRadius: 999,
            border: `1px solid ${GRID}`,
            background: "rgba(255,255,255,0.05)",
            padding: "10px 16px",
            fontSize: isSquare ? 20 : 22,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          {activeTheme.label}
        </div>
        <div
          style={{
            fontSize: isSquare ? 18 : 20,
            color: "rgba(255,255,255,0.62)",
            letterSpacing: 1.2,
          }}
        >
          AI system brief
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: 6,
          width: `${progress * 100}%`,
          background: `linear-gradient(90deg, ${activeTheme.accent}, ${activeTheme.helper})`,
          zIndex: 30,
          boxShadow: `0 0 30px ${activeTheme.accent}`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: isSquare ? 34 : 40,
          right: isSquare ? 34 : 40,
          bottom: cardBottom,
          minHeight: cardMinHeight,
          padding: isSquare ? "28px 30px" : "30px 34px",
          paddingLeft: avatarVideoUrl ? avatarInset : isSquare ? 30 : 34,
          borderRadius: 30,
          background: CARD,
          border: `1px solid ${GRID}`,
          boxShadow: "0 36px 120px rgba(0,0,0,0.38)",
          backdropFilter: "blur(16px)",
          zIndex: 18,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ opacity: fade, transform: `translateY(${(1 - enter) * 28}px)` }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
              color: activeTheme.accent,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontSize: isSquare ? 17 : 18,
            }}
          >
            <span>{String(activeBeat + 1).padStart(2, "0")}</span>
            <div
              style={{
                flex: 1,
                height: 2,
                background: `linear-gradient(90deg, ${activeTheme.accent}, transparent)`,
              }}
            />
          </div>

          <div
            style={{
              fontSize: activeBeat === 0 ? (isSquare ? 54 : 66) : isSquare ? 36 : 44,
              lineHeight: activeBeat === 0 ? 1.02 : 1.12,
              fontWeight: activeBeat === 0 ? 900 : 800,
              letterSpacing: activeBeat === 0 ? -1.8 : -0.8,
              textWrap: "balance",
            }}
          >
            {storyBeats[activeBeat]}
          </div>

          {activeBeat > 0 ? (
            <div
              style={{
                marginTop: 18,
                fontSize: isSquare ? 21 : 24,
                lineHeight: 1.28,
                color: "rgba(255,255,255,0.72)",
              }}
            >
              {headline}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 22,
          }}
        >
          {storyBeats.map((_, index) => (
            <div
              key={`beat-${index}`}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 999,
                background:
                  index === activeBeat
                    ? `linear-gradient(90deg, ${activeTheme.accent}, ${activeTheme.helper})`
                    : "rgba(255,255,255,0.14)",
                opacity: index <= activeBeat ? 1 : 0.7,
              }}
            />
          ))}
        </div>
      </div>

      {avatarVideoUrl ? <AvatarOverlay avatarVideoUrl={avatarVideoUrl} layout={layout} /> : null}
      <Audio src={staticFile(audioUrl)} />
    </AbsoluteFill>
  );
};

const BackgroundLayer: React.FC<{
  frame: number;
  totalFrames: number;
  accent: string;
  helper: string;
  imageUrl?: string | null;
}> = ({ frame, totalFrames, accent, helper, imageUrl }) => {
  const pulse = interpolate(frame % 120, [0, 60, 120], [0.72, 1, 0.72], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const drift = interpolate(frame % totalFrames, [0, totalFrames], [0, 180], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 18% 20%, ${withAlpha(accent, 0.32)}, transparent 28%),
            radial-gradient(circle at 82% 22%, ${withAlpha(helper, 0.22)}, transparent 26%),
            linear-gradient(140deg, #040713 0%, #091225 54%, #060b17 100%)`,
        }}
      />

      {imageUrl ? (
        <AbsoluteFill style={{ opacity: 0.16, mixBlendMode: "screen" }}>
          <Img
            src={staticFile(imageUrl)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(1.08) translateX(${drift * -0.1}px)`,
            }}
          />
        </AbsoluteFill>
      ) : null}

      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1080 1920"
        style={{ position: "absolute", inset: 0, opacity: 0.9 }}
      >
        <defs>
          <linearGradient id="grid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={withAlpha(accent, 0.44)} />
            <stop offset="100%" stopColor={withAlpha(helper, 0.18)} />
          </linearGradient>
        </defs>
        {Array.from({ length: 12 }).map((_, index) => (
          <line
            key={`v-${index}`}
            x1={index * 96}
            y1="0"
            x2={index * 96}
            y2="1920"
            stroke={GRID}
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 20 }).map((_, index) => (
          <line
            key={`h-${index}`}
            x1="0"
            y1={index * 96}
            x2="1080"
            y2={index * 96}
            stroke={GRID}
            strokeWidth="1"
          />
        ))}
        <circle
          cx={180 + drift * 0.2}
          cy="280"
          r={84 * pulse}
          fill={withAlpha(accent, 0.12)}
          stroke="url(#grid)"
          strokeWidth="2"
        />
        <circle
          cx="860"
          cy={420 + drift * 0.16}
          r="128"
          fill="none"
          stroke={withAlpha(helper, 0.28)}
          strokeWidth="4"
        />
        <path
          d={`M 110 1230 C 340 ${1080 - drift * 0.2}, 620 ${1440 + drift * 0.08}, 980 1160`}
          fill="none"
          stroke={withAlpha(accent, 0.46)}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d={`M 120 1290 C 360 ${1160 - drift * 0.12}, 690 ${1330 + drift * 0.08}, 980 1280`}
          fill="none"
          stroke={withAlpha(helper, 0.28)}
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 140,
          right: 56,
          width: 280,
          padding: 18,
          borderRadius: 24,
          border: `1px solid ${GRID}`,
          background: "rgba(255,255,255,0.04)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            fontSize: 18,
            textTransform: "uppercase",
            letterSpacing: 1.4,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          Infra pulse
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            height: 110,
            marginTop: 18,
          }}
        >
          {[52, 78, 40, 92, 66].map((bar, index) => (
            <div
              key={`bar-${index}`}
              style={{
                flex: 1,
                height: `${bar * pulse}%`,
                borderRadius: 999,
                background: index % 2 === 0 ? accent : helper,
                opacity: 0.84,
              }}
            />
          ))}
        </div>
      </div>

      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at center, transparent 54%, rgba(0,0,0,0.44) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

function withAlpha(hex: string, alpha: number): string {
  const safe = hex.replace("#", "");
  if (safe.length !== 6) return hex;
  const value = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${safe}${value}`;
}
