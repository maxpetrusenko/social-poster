import { describe, expect, it } from "vitest";

import { getMissingImageDimensionUrls } from "@/lib/dashboard/composer-media";

describe("composer media dimensions", () => {
  it("loads dimensions only for image URLs that are still missing", () => {
    expect(
      getMissingImageDimensionUrls(
        [
          "/media/already-sized.jpg",
          "/media/new-image.png",
          "/media/video.mp4",
          "",
        ],
        {
          "/media/already-sized.jpg": {
            label: "Original",
            width: 1080,
            height: 1080,
            aspect: "1:1",
          },
        }
      )
    ).toEqual(["/media/new-image.png"]);
  });
});
