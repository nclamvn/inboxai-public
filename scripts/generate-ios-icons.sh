#!/bin/bash

# Script tạo iOS App Icons từ ảnh gốc
# Usage: ./scripts/generate-ios-icons.sh [path/to/icon.png]

SOURCE_ICON=${1:-"public/icons/icon-512x512.png"}
OUTPUT_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"
SPLASH_DIR="ios/App/App/Assets.xcassets/Splash.imageset"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found: $SOURCE_ICON"
    echo "Usage: ./scripts/generate-ios-icons.sh path/to/icon.png"
    exit 1
fi

# Tạo thư mục nếu chưa có
mkdir -p "$OUTPUT_DIR"
mkdir -p "$SPLASH_DIR"

echo "Generating iOS icons from: $SOURCE_ICON"

# Tạo icon 1024x1024 cho App Store (upscale từ 512)
echo "Creating 1024x1024 App Icon..."
sips -z 1024 1024 "$SOURCE_ICON" --out "$OUTPUT_DIR/AppIcon-512@2x.png" > /dev/null 2>&1

# Tạo splash icon (120x120 để hiển thị trên splash screen)
echo "Creating Splash icons..."
sips -z 120 120 "$SOURCE_ICON" --out "$SPLASH_DIR/splash-2732x2732.png" > /dev/null 2>&1
cp "$SPLASH_DIR/splash-2732x2732.png" "$SPLASH_DIR/splash-2732x2732-1.png"
cp "$SPLASH_DIR/splash-2732x2732.png" "$SPLASH_DIR/splash-2732x2732-2.png"

echo ""
echo "Done! Files created:"
echo "  - $OUTPUT_DIR/AppIcon-512@2x.png (1024x1024)"
echo "  - $SPLASH_DIR/splash-2732x2732*.png (120x120)"
echo ""
echo "Note: The modern iOS icon format uses a single 1024x1024 image."
echo "      iOS automatically generates all other sizes."
