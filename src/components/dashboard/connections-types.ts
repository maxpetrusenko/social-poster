import type { PlatformType } from "@/lib/platforms";

export type ProfileRow = {
  id: string;
  name: string;
};

export type PlatformRow = {
  id: string;
  name: string;
  type: PlatformType;
  handle: string | null;
  accountId: string | null;
  provider: "zernio" | "bird" | "direct";
  config: Record<string, unknown> | null;
  enabled: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

export type PlatformInsight = {
  id: string;
  deliveryCount30d: number;
  failureCount30d: number;
  scheduleCount: number;
  successRate30d: number;
  lastDeliveredAt: Date | null;
};

export type FormState = Record<string, string | boolean>;
