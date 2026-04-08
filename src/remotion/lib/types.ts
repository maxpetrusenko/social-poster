export interface AiNewsVideoProps {
  headline: string;
  bullets: string[];
  audioUrl: string;
  imageUrls?: string[];
  avatarVideoUrl?: string;
  durationInSeconds: number;
  layout?: "portrait" | "square";
}
