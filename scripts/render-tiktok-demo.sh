#!/bin/bash
set -e

mkdir -p out

echo "Rendering TikTok App Review demo video..."
npx remotion render src/remotion/Root.tsx TikTokAppReview \
  --output="out/tiktok-app-review-demo.mp4" \
  --codec h264 \
  --crf 18

echo ""
echo "Done! Video saved to: out/tiktok-app-review-demo.mp4"
ls -lh out/tiktok-app-review-demo.mp4
