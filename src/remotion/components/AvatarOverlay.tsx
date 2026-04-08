import React from "react";
import { OffthreadVideo, AbsoluteFill, staticFile } from "remotion";

const ACCENT = "#DA7756";

interface AvatarOverlayProps {
  avatarVideoUrl: string;
  layout?: "portrait" | "square";
}

export const AvatarOverlay: React.FC<AvatarOverlayProps> = ({ avatarVideoUrl, layout = "portrait" }) => {
  const avatarSize = layout === "square" ? 268 : 348;
  const padding = layout === "square" ? 34 : 36;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "flex-start",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: avatarSize,
          height: avatarSize,
          borderRadius: layout === "square" ? 32 : 999,
          overflow: "hidden",
          margin: `${padding}px`,
          border: `4px solid ${ACCENT}`,
          backgroundColor: "#000000",
          boxShadow: "0 28px 80px rgba(0,0,0,0.45)",
        }}
      >
        <OffthreadVideo
          src={staticFile(avatarVideoUrl)}
          volume={0}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
