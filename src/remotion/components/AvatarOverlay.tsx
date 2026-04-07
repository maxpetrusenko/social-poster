import React from "react";
import { OffthreadVideo, AbsoluteFill, staticFile, useVideoConfig } from "remotion";

const ACCENT = "#DA7756";

interface AvatarOverlayProps {
  avatarVideoUrl: string;
}

export const AvatarOverlay: React.FC<AvatarOverlayProps> = ({ avatarVideoUrl }) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const avatarSize = 400;
  const padding = 28;

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
          borderRadius: "50%",
          overflow: "hidden",
          margin: `${padding}px`,
          border: `4px solid ${ACCENT}`,
          backgroundColor: "#000000",
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
