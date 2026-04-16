import type { Story } from "../feed-engine";

export function selectFeedStoryForSchedule(
  stories: Story[],
  options: { requireImage: boolean }
) {
  if (!stories.length) return null;
  if (!options.requireImage) return stories[0];
  return stories.find((story) => Boolean(story.imageUrl)) ?? null;
}
