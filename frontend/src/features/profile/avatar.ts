import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import type { UserProfile } from '@/lib/api'

const BUCKET = 'avatars'
const SIZE = 256 // shown at most ~72px, so this is sharp on a 3x screen
const MAX_INPUT = 30 * 1024 * 1024 // a big phone photo; what is uploaded is ~15 KB

class AvatarError extends Error {
  code: 'unsupported' | 'too_large' | 'failed'
  constructor(code: 'unsupported' | 'too_large' | 'failed') {
    super(code)
    this.code = code
  }
}

export const avatarErrorMessage = (err: unknown) =>
  err instanceof AvatarError && err.code === 'unsupported'
    ? 'Choose a photo (JPG, PNG, WebP or iPhone HEIC).'
    : err instanceof AvatarError && err.code === 'too_large'
      ? 'That photo is too large. Try another.'
      : 'Could not update your photo. Please try again.'

/** True for a picture we stored (the profile otherwise holds the Google photo, or nothing) */
export const isCustomAvatar = (url: string | null | undefined) => !!url && url.includes(`/storage/v1/object/public/${BUCKET}/`)

const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)

/** Opens any photo, including an iPhone's HEIC (which only Safari can open by itself: it is converted here first) */
async function decode(file: File): Promise<ImageBitmap> {
  const open = (b: Blob) => createImageBitmap(b, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(b))
  try {
    return await open(file)
  } catch {
    if (!isHeic(file)) throw new AvatarError('unsupported')
  }
  try {
    const { default: heic2any } = await import('heic2any') // ~1 MB of decoder, fetched only for a HEIC the browser could not open
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    return await open(Array.isArray(out) ? out[0] : out)
  } catch {
    throw new AvatarError('unsupported')
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, quality))

/** Checks and opens the chosen photo, ready for the crop screen */
export async function openPhoto(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_INPUT) throw new AvatarError('too_large')
  if ((!file.type.startsWith('image/') && !isHeic(file)) || file.type === 'image/svg+xml') throw new AvatarError('unsupported')
  return decode(file)
}

/** The chosen square of the photo (source pixels), 256px, as WebP (JPEG where the browser cannot write WebP). Re-drawing drops EXIF, including location. */
export async function cropToBlob(bmp: ImageBitmap, area: { x: number; y: number; size: number }): Promise<{ blob: Blob; ext: 'webp' | 'jpg' }> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx || area.size <= 0) throw new AvatarError('failed')
  ctx.fillStyle = '#111318' // behind any transparency
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, area.x, area.y, area.size, area.size, 0, 0, SIZE, SIZE)
  const webp = await toBlob(canvas, 'image/webp', 0.86)
  if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp' }
  const jpg = await toBlob(canvas, 'image/jpeg', 0.88)
  if (!jpg) throw new AvatarError('failed')
  return { blob: jpg, ext: 'jpg' }
}

/** Every file in the user's folder except `keep`: one picture per user, so storage never grows */
async function clearOthers(userId: string, keep?: string) {
  const { data } = await supabase.storage.from(BUCKET).list(userId)
  const old = (data ?? []).filter((f) => f.name !== keep).map((f) => `${userId}/${f.name}`)
  if (old.length) await supabase.storage.from(BUCKET).remove(old)
}

/** Uploads to the user's own folder, points the profile at it, and removes the previous picture */
export async function saveAvatar(userId: string, { blob, ext }: { blob: Blob; ext: 'webp' | 'jpg' }): Promise<UserProfile> {
  const name = `${crypto.randomUUID().replace(/-/g, '')}.${ext}` // a fresh name each time, so no cache ever shows the old picture
  const path = `${userId}/${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
  if (error) throw new AvatarError('failed')
  let profile: UserProfile
  try {
    profile = (await api.setAvatar(name)).profile
  } catch {
    await supabase.storage.from(BUCKET).remove([path])
    throw new AvatarError('failed')
  }
  await clearOthers(userId, name).catch(() => {})
  return profile
}

/** Back to the Google photo (or the letter), and the stored picture is deleted */
export async function removeAvatar(userId: string): Promise<UserProfile> {
  const { profile } = await api.removeAvatar()
  await clearOthers(userId).catch(() => {})
  return profile
}
