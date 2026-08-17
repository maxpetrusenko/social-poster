import type { Story } from "../feed-engine";
import { isAiTopicStory } from "./ai-topic-gate";

export function selectFeedStoryForSchedule(
  stories: Story[],
  options: { requireImage: boolean; aiTopicGate?: boolean }
) {
  if (!stories.length) return null;

  const candidates = options.aiTopicGate
    ? stories.filter((story) => isAiTopicStory(story))
    : stories;

  if (!candidates.length) return null;
  if (!options.requireImage) return candidates[0];
  return candidates.find((story) => Boolean(story.imageUrl)) ?? null;
}
