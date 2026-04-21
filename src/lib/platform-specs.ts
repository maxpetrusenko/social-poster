export type ImageSpec = {
  label: string;
  width: number;
  height: number;
  aspect: string;
};

export type PlatformSpec = {
  label: string;
  formats: string[];
  imageDimensions: Record<string, ImageSpec[]>;
  charLimit: number;
  firstCommentLimit?: number;
  supportsMultiImage: boolean;
  maxImages: number;
};

export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  instagram: {
    label: "Instagram",
    formats: ["Feed", "Story", "Reel", "Carousel"],
    imageDimensions: {
      Feed: [
        { label: "Square", width: 1080, height: 1080, aspect: "1:1" },
        { label: "Portrait", width: 1080, height: 1350, aspect: "4:5" },
        { label: "Landscape", width: 1080, height: 566, aspect: "1.91:1" },
      ],
      Story: [{ label: "Story", width: 1080, height: 1920, aspect: "9:16" }],
      Reel: [{ label: "Reel", width: 1080, height: 1920, aspect: "9:16" }],
      Carousel: [
        { label: "Square", width: 1080, height: 1080, aspect: "1:1" },
        { label: "Portrait", width: 1080, height: 1350, aspect: "4:5" },
      ],
    },
    charLimit: 2200,
    firstCommentLimit: 2200,
    supportsMultiImage: true,
    maxImages: 10,
  },
  instagram_personal: {
    label: "Instagram",
    formats: ["Feed", "Story", "Reel", "Carousel"],
    imageDimensions: {
      Feed: [
        { label: "Square", width: 1080, height: 1080, aspect: "1:1" },
        { label: "Portrait", width: 1080, height: 1350, aspect: "4:5" },
        { label: "Landscape", width: 1080, height: 566, aspect: "1.91:1" },
      ],
      Story: [{ label: "Story", width: 1080, height: 1920, aspect: "9:16" }],
      Reel: [{ label: "Reel", width: 1080, height: 1920, aspect: "9:16" }],
      Carousel: [
        { label: "Square", width: 1080, height: 1080, aspect: "1:1" },
        { label: "Portrait", width: 1080, height: 1350, aspect: "4:5" },
      ],
    },
    charLimit: 2200,
    firstCommentLimit: 2200,
    supportsMultiImage: true,
    maxImages: 10,
  },
  facebook: {
    label: "Facebook",
    formats: ["Feed", "Story", "Reel"],
    imageDimensions: {
      Feed: [{ label: "Feed", width: 1200, height: 630, aspect: "1.91:1" }],
      Story: [{ label: "Story", width: 1080, height: 1920, aspect: "9:16" }],
      Reel: [{ label: "Reel", width: 1080, height: 1920, aspect: "9:16" }],
    },
    charLimit: 63206,
    firstCommentLimit: 8000,
    supportsMultiImage: true,
    maxImages: 10,
  },
  x: {
    label: "X (Twitter)",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 675, aspect: "16:9" }],
    },
    charLimit: 25000,
    supportsMultiImage: true,
    maxImages: 4,
  },
  twitter: {
    label: "X (Twitter)",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 675, aspect: "16:9" }],
    },
    charLimit: 25000,
    supportsMultiImage: true,
    maxImages: 4,
  },
  linkedin: {
    label: "LinkedIn",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 627, aspect: "1.91:1" }],
    },
    charLimit: 3000,
    supportsMultiImage: true,
    maxImages: 9,
  },
  linkedin_personal: {
    label: "LinkedIn",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 627, aspect: "1.91:1" }],
    },
    charLimit: 3000,
    supportsMultiImage: true,
    maxImages: 9,
  },
  linkedin_company: {
    label: "LinkedIn",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 627, aspect: "1.91:1" }],
    },
    charLimit: 3000,
    supportsMultiImage: true,
    maxImages: 9,
  },
  pinterest: {
    label: "Pinterest",
    formats: [],
    imageDimensions: {
      default: [{ label: "Pin", width: 1000, height: 1500, aspect: "2:3" }],
    },
    charLimit: 500,
    supportsMultiImage: false,
    maxImages: 1,
  },
  tiktok: {
    label: "TikTok",
    formats: [],
    imageDimensions: {
      default: [{ label: "Video", width: 1080, height: 1920, aspect: "9:16" }],
    },
    charLimit: 2200,
    supportsMultiImage: false,
    maxImages: 1,
  },
  reddit: {
    label: "Reddit",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 628, aspect: "1.91:1" }],
    },
    charLimit: 40000,
    supportsMultiImage: true,
    maxImages: 20,
  },
  youtube: {
    label: "YouTube",
    formats: [],
    imageDimensions: {
      default: [{ label: "Thumbnail", width: 1280, height: 720, aspect: "16:9" }],
    },
    charLimit: 5000,
    supportsMultiImage: false,
    maxImages: 1,
  },
  threads: {
    label: "Threads",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1080, height: 1350, aspect: "4:5" }],
    },
    charLimit: 500,
    supportsMultiImage: true,
    maxImages: 10,
  },
  bluesky: {
    label: "Bluesky",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 675, aspect: "16:9" }],
    },
    charLimit: 300,
    supportsMultiImage: true,
    maxImages: 4,
  },
  google_business: {
    label: "Google Business",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 900, aspect: "4:3" }],
    },
    charLimit: 1500,
    supportsMultiImage: true,
    maxImages: 10,
  },
  mastodon: {
    label: "Mastodon",
    formats: [],
    imageDimensions: {
      default: [{ label: "Post", width: 1200, height: 675, aspect: "16:9" }],
    },
    charLimit: 500,
    supportsMultiImage: true,
    maxImages: 4,
  },
  whatsapp: {
    label: "WhatsApp",
    formats: [],
    imageDimensions: {
      default: [{ label: "Status", width: 1080, height: 1920, aspect: "9:16" }],
    },
    charLimit: 700,
    supportsMultiImage: false,
    maxImages: 1,
  },
};

export function getSpecForPlatform(type: string): PlatformSpec | undefined {
  return PLATFORM_SPECS[type.toLowerCase()];
}

export function getImageDimensions(type: string, format?: string): ImageSpec[] {
  const spec = getSpecForPlatform(type);
  if (!spec) return [];
  const key = format || Object.keys(spec.imageDimensions)[0] || "default";
  return spec.imageDimensions[key] || spec.imageDimensions["default"] || [];
}
