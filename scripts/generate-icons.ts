import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

// Icon sizes needed for PWA
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const APPLE_ICON_SIZE = 180

// Simple icon SVG - Mail with Sparkle
const createSimpleIconSVG = (size: number) => {
  const padding = size * 0.15
  const iconArea = size - padding * 2

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0F172A"/>
      <stop offset="100%" style="stop-color:#1E3A8A"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>

  <g transform="translate(${padding}, ${padding})">
    <!-- Mail envelope -->
    <rect
      x="${iconArea * 0.08}"
      y="${iconArea * 0.22}"
      width="${iconArea * 0.7}"
      height="${iconArea * 0.5}"
      rx="${iconArea * 0.06}"
      fill="none"
      stroke="white"
      stroke-width="${iconArea * 0.055}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- Mail flap -->
    <polyline
      points="${iconArea * 0.08},${iconArea * 0.28} ${iconArea * 0.43},${iconArea * 0.5} ${iconArea * 0.78},${iconArea * 0.28}"
      fill="none"
      stroke="white"
      stroke-width="${iconArea * 0.055}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />

    <!-- AI Sparkle star -->
    <g transform="translate(${iconArea * 0.58}, ${iconArea * 0.08})">
      <!-- 4-point star -->
      <path
        d="M ${iconArea * 0.17} ${iconArea * 0.08}
           Q ${iconArea * 0.17} ${iconArea * 0.17} ${iconArea * 0.25} ${iconArea * 0.17}
           Q ${iconArea * 0.17} ${iconArea * 0.17} ${iconArea * 0.17} ${iconArea * 0.26}
           Q ${iconArea * 0.17} ${iconArea * 0.17} ${iconArea * 0.09} ${iconArea * 0.17}
           Q ${iconArea * 0.17} ${iconArea * 0.17} ${iconArea * 0.17} ${iconArea * 0.08}
           Z"
        fill="#FBBF24"
      />
      <!-- Small star -->
      <circle cx="${iconArea * 0.06}" cy="${iconArea * 0.05}" r="${iconArea * 0.025}" fill="#FCD34D"/>
      <circle cx="${iconArea * 0.28}" cy="${iconArea * 0.02}" r="${iconArea * 0.02}" fill="#FDE68A"/>
    </g>
  </g>
</svg>
`
}

// Favicon SVG (simpler for small sizes)
const createFaviconSVG = (size: number) => {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#111827"/>
  <g transform="translate(${size * 0.15}, ${size * 0.2})">
    <rect
      x="0"
      y="${size * 0.1}"
      width="${size * 0.55}"
      height="${size * 0.4}"
      rx="${size * 0.05}"
      fill="none"
      stroke="white"
      stroke-width="${size * 0.06}"
    />
    <polyline
      points="0,${size * 0.15} ${size * 0.275},${size * 0.32} ${size * 0.55},${size * 0.15}"
      fill="none"
      stroke="white"
      stroke-width="${size * 0.06}"
      stroke-linecap="round"
    />
    <circle cx="${size * 0.55}" cy="${size * 0.08}" r="${size * 0.08}" fill="#FBBF24"/>
  </g>
</svg>
`
}

async function generateIcons() {
  const outputDir = path.join(process.cwd(), 'public', 'icons')

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log('🎨 Generating PWA icons...\n')

  // Generate standard icons
  for (const size of ICON_SIZES) {
    const svg = createSimpleIconSVG(size)
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`)

    await sharp(Buffer.from(svg))
      .png()
      .toFile(outputPath)

    console.log(`✅ Generated: icon-${size}x${size}.png`)
  }

  // Generate Apple touch icon
  const appleSvg = createSimpleIconSVG(APPLE_ICON_SIZE)
  await sharp(Buffer.from(appleSvg))
    .png()
    .toFile(path.join(outputDir, 'apple-touch-icon.png'))
  console.log(`✅ Generated: apple-touch-icon.png`)

  // Generate favicon (32x32)
  const faviconSvg = createFaviconSVG(32)
  await sharp(Buffer.from(faviconSvg))
    .png()
    .toFile(path.join(outputDir, 'favicon-32x32.png'))
  console.log(`✅ Generated: favicon-32x32.png`)

  // Generate favicon.ico (16x16)
  const favicon16Svg = createFaviconSVG(16)
  await sharp(Buffer.from(favicon16Svg))
    .png()
    .toFile(path.join(outputDir, 'favicon-16x16.png'))
  console.log(`✅ Generated: favicon-16x16.png`)

  // Also save the SVG for reference
  fs.writeFileSync(
    path.join(outputDir, 'icon.svg'),
    createSimpleIconSVG(512)
  )
  console.log(`✅ Generated: icon.svg`)

  console.log('\n🎉 All icons generated successfully!')
  console.log(`📁 Output directory: ${outputDir}`)
}

generateIcons().catch(console.error)
