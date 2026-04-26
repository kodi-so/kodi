export const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024 // 2 MB

export const ALLOWED_IMAGE_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type AllowedImageUploadType = (typeof ALLOWED_IMAGE_UPLOAD_TYPES)[number]

export const ACCEPTED_IMAGE_UPLOAD_TYPES = ALLOWED_IMAGE_UPLOAD_TYPES.join(',')

export const IMAGE_EXTENSION_BY_UPLOAD_TYPE: Record<AllowedImageUploadType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function isAllowedImageUploadType(
  contentType: string
): contentType is AllowedImageUploadType {
  return (ALLOWED_IMAGE_UPLOAD_TYPES as readonly string[]).includes(contentType)
}
