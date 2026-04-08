import React from "react";
import { Composition, registerRoot } from "remotion";
import { AiNewsVideo } from "./AiNewsVideo";
import { AiNewsVideoProps } from "./lib/types";

const defaultProps: AiNewsVideoProps = {
  headline: "AI Breakthrough",
  bullets: ["Point one", "Point two", "Point three"],
  audioUrl: "narration.wav",
  durationInSeconds: 15,
};

const RootComponent = () => {
  return (
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
  );
};

registerRoot(RootComponent);
