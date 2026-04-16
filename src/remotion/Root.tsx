import React from "react";
import { Composition, registerRoot } from "remotion";
import { AiNewsVideo } from "./AiNewsVideo";
import { AiNewsVideoProps } from "./lib/types";
import { TikTokAppReview } from "./TikTokAppReview";
import type { TikTokDemoProps } from "./tiktok-demo/types";

const defaultProps: AiNewsVideoProps = {
  headline: "AI Breakthrough",
  bullets: ["Point one", "Point two", "Point three"],
  audioUrl: "narration.wav",
  durationInSeconds: 15,
};

const tiktokDemoProps: TikTokDemoProps = {
  appDomain: "social.maxpetrusenko.com",
  tiktokHandle: "max_petrusenko",
  displayName: "Max Petrusenko",
  followerCount: "1.2K",
  durationInSeconds: 35,
};

const RootComponent = () => {
  return (
    <>
      <Composition<AiNewsVideoProps>
        id="AiNewsVideo"
        component={AiNewsVideo}
        durationInFrames={30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round(props.durationInSeconds * 30),
        })}
      />
      <Composition<TikTokDemoProps>
        id="TikTokAppReview"
        component={TikTokAppReview}
        durationInFrames={30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={tiktokDemoProps}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.round(props.durationInSeconds * 30),
        })}
      />
    </>
  );
};

registerRoot(RootComponent);
