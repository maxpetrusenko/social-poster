import React from "react";
import { OffthreadVideo, AbsoluteFill, staticFile } from "remotion";

const ACCENT = "#DA7756";

interface AvatarOverlayProps {
  avatarVideoUrl: string;
}

export const AvatarOverlay: React.FC<AvatarOverlayProps> = ({ avatarVideoUrl }) => {
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
          width: 400,
          height: 400,
          borderRadius: "50%",
          overflow: "hidden",
          margin: "28px",
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
