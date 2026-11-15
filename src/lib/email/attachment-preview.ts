export const rasterPreviewTypes = ['image/gif', 'image/jpeg', 'image/png', 'image/webp'] as const
export type RasterPreviewType = typeof rasterPreviewTypes[number]

export function isRasterPreviewType(value: string): value is RasterPreviewType {
  return (rasterPreviewTypes as readonly string[]).includes(value)
}
