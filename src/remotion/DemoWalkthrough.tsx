import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * Flow: Calendar → click post → Post Detail modal → click X preview → X.com post → Schedules
 * 10 seconds at 30fps = 300 frames
 *
 * Timeline:
 *   0-75   Calendar (cursor moves to the "Qwen" post cell at ~frame 40, click at 55)
 *  75-150  Post Detail (cursor moves to X preview at ~frame 110, click at 130)
 * 150-225  X.com post view (just viewing)
 * 225-300  Schedules page (just viewing)
 */

type ScreenDef = {
  src: string;
  /** Cursor start position as % of screen width/height */
  cursorStart: [number, number];
  /** Cursor end (click target) as % of screen width/height */
  cursorEnd: [number, number];
  /** Frame within the sequence when cursor starts moving */
  cursorMoveStart: number;
  /** Frame within the sequence when click happens */
  clickFrame: number;
  /** Show cursor at all? */
  hasCursor: boolean;
};

const SCENE_FRAMES = 75;

const SCENES: ScreenDef[] = [
  {
    // 1. Schedules — cursor clicks on "Calendar" sidebar link
    src: staticFile("demo-screens/schedules.png"),
    cursorStart: [40, 55],
    cursorEnd: [5, 26], // "Calendar" text in sidebar (~26% down)
    cursorMoveStart: 15,
    clickFrame: 52,
    hasCursor: true,
  },
  {
    // 2. Calendar — cursor clicks on X post icon in the "15" cell
    src: staticFile("demo-screens/calendar-full.png"),
    cursorStart: [12, 20],
    cursorEnd: [54, 30], // the red X icon in "15" cell area
    cursorMoveStart: 10,
    clickFrame: 52,
    hasCursor: true,
  },
  {
    // 3. Post Detail — cursor clicks on the green "POSTED" badge
    src: staticFile("demo-screens/post-detail.png"),
    cursorStart: [30, 70],
    cursorEnd: [55, 38], // "POSTED" green badge right of X preview
    cursorMoveStart: 10,
    clickFrame: 52,
    hasCursor: true,
  },
  {
    // 4. X.com post — just viewing the live tweet
    src: staticFile("demo-screens/x-post.png"),
    cursorStart: [50, 50],
    cursorEnd: [50, 50],
    cursorMoveStart: 0,
    clickFrame: -1,
    hasCursor: false,
  },
];

const TRANSITION = 10;

function Cursor({
  x,
  y,
  clicking,
  frame,
  fps,
}: {
  x: number;
  y: number;
  clicking: boolean;
  frame: number;
  fps: number;
}) {
  const clickScale = clicking
    ? spring({ frame, fps, config: { damping: 12, stiffness: 200 }, durationInFrames: 8 })
    : 0;

  return (
    <>
      {/* Click ripple */}
      {clicking && (
        <div
          style={{
            position: "absolute",
            left: x - 20,
            top: y - 20,
            width: 40,
            height: 40,
            borderRadius: "50%",
            border: "3px solid rgba(234, 88, 12, 0.6)",
            transform: `scale(${1 + clickScale * 1.5})`,
            opacity: 1 - clickScale * 0.8,
            pointerEvents: "none",
          }}
        />
      )}
      {/* Cursor */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: x,
          top: y,
          filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.4))",
          transform: clicking ? `scale(${0.85 + clickScale * 0.15})` : "scale(1)",
          pointerEvents: "none",
          zIndex: 100,
        }}
      >
        <path
          d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="1.5"
        />
      </svg>
    </>
  );
}

function Scene({
  scene,
  sceneFrames,
}: {
  scene: ScreenDef;
  sceneFrames: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in/out
  const fadeIn = interpolate(frame, [0, TRANSITION], [0, 1], {
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [sceneFrames - TRANSITION, sceneFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Cursor position
  const cursorProgress = scene.hasCursor
    ? interpolate(
        frame,
        [scene.cursorMoveStart, scene.clickFrame - 5],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    : 0;

  // Ease the cursor movement
  const eased =
    cursorProgress < 1
      ? cursorProgress * cursorProgress * (3 - 2 * cursorProgress) // smoothstep
      : 1;

  const cursorX = interpolate(
    eased,
    [0, 1],
    [(scene.cursorStart[0] / 100) * 1920, (scene.cursorEnd[0] / 100) * 1920]
  );
  const cursorY = interpolate(
    eased,
    [0, 1],
    [(scene.cursorStart[1] / 100) * 1080, (scene.cursorEnd[1] / 100) * 1080]
  );

  const isClicking =
    scene.hasCursor && frame >= scene.clickFrame && frame < scene.clickFrame + 8;

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: "#f5f0e6" }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "95%",
            height: "92%",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
            position: "relative",
          }}
        >
          <Img
            src={scene.src}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top left",
            }}
          />
        </div>
      </AbsoluteFill>
      {scene.hasCursor && frame > 5 && (
        <Cursor
          x={cursorX}
          y={cursorY}
          clicking={isClicking}
          frame={isClicking ? frame - scene.clickFrame : 0}
          fps={fps}
        />
      )}
    </AbsoluteFill>
  );
}

export const DemoWalkthrough: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#f5f0e6" }}>
      {SCENES.map((scene, i) => (
        <Sequence
          key={i}
          from={i * SCENE_FRAMES}
          durationInFrames={SCENE_FRAMES + TRANSITION}
        >
          <Scene scene={scene} sceneFrames={SCENE_FRAMES + TRANSITION} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
