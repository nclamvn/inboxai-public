#!/bin/bash

# Script tạo Android App Icons từ 1 ảnh gốc
# Usage: ./scripts/generate-android-icons.sh [path/to/icon.png]

SOURCE_ICON=${1:-"public/icons/icon-512x512.png"}
ANDROID_RES_DIR="android/app/src/main/res"

if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found: $SOURCE_ICON"
    echo "Usage: ./scripts/generate-android-icons.sh path/to/icon.png"
    exit 1
fi

echo "Generating Android icons from: $SOURCE_ICON"

# Generate launcher icons for each density
generate_icon() {
    local DENSITY=$1
    local SIZE=$2
    local OUTPUT_DIR="$ANDROID_RES_DIR/mipmap-$DENSITY"
    mkdir -p "$OUTPUT_DIR"

    sips -z $SIZE $SIZE "$SOURCE_ICON" --out "$OUTPUT_DIR/ic_launcher.png" > /dev/null 2>&1
    sips -z $SIZE $SIZE "$SOURCE_ICON" --out "$OUTPUT_DIR/ic_launcher_round.png" > /dev/null 2>&1
    sips -z $SIZE $SIZE "$SOURCE_ICON" --out "$OUTPUT_DIR/ic_launcher_foreground.png" > /dev/null 2>&1

    echo "Created: mipmap-$DENSITY (${SIZE}x${SIZE})"
}

# Generate for each density
generate_icon "mdpi" "48"
generate_icon "hdpi" "72"
generate_icon "xhdpi" "96"
generate_icon "xxhdpi" "144"
generate_icon "xxxhdpi" "192"

# Generate splash logo for drawable
generate_splash() {
    local DENSITY=$1
    local SIZE=$2
    local OUTPUT_DIR="$ANDROID_RES_DIR/drawable-$DENSITY"

    if [ "$DENSITY" = "default" ]; then
        OUTPUT_DIR="$ANDROID_RES_DIR/drawable"
    fi

    mkdir -p "$OUTPUT_DIR"
    sips -z $SIZE $SIZE "$SOURCE_ICON" --out "$OUTPUT_DIR/splash_logo.png" > /dev/null 2>&1
}

# Splash logos
generate_splash "default" "192"
echo "Created: drawable/splash_logo.png (192x192)"

generate_splash "mdpi" "48"
generate_splash "hdpi" "72"
generate_splash "xhdpi" "96"
generate_splash "xxhdpi" "144"
generate_splash "xxxhdpi" "192"
echo "Created: drawable-*/splash_logo.png"

echo ""
echo "Done! Android icons generated successfully."
echo ""
echo "Next steps:"
echo "  1. npx cap sync android"
echo "  2. npx cap open android"
