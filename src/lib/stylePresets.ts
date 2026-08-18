import { storeImage } from './db'

export interface StylePreset {
  id: string
  label: string
  description: string
  fileName: string
  palette: string[]
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'clean-tech',
    label: '清爽科技',
    description: '冷色光感、干净层级、精准标注，适合电子、工具、办公类产品。',
    fileName: 'clean-tech.png',
    palette: ['#F8FAFC', '#E0F2FE', '#38BDF8', '#0F172A', '#94A3B8', '#14B8A6'],
  },
  {
    id: 'natural-warm',
    label: '自然暖调',
    description: '柔和日光、自然材质、温暖背景，适合家居、母婴、户外生活类产品。',
    fileName: 'natural-warm.png',
    palette: ['#FFF8ED', '#F4D6A6', '#C58A45', '#2F3A2F', '#8FA478', '#E76F51'],
  },
  {
    id: 'premium-contrast',
    label: '高级对比',
    description: '深浅对比、金属质感、编辑感聚焦，适合高客单、礼品、精品配件。',
    fileName: 'premium-contrast.png',
    palette: ['#F5F5F4', '#D6D3D1', '#A8A29E', '#111827', '#C8A24A', '#7C2D12'],
  },
  {
    id: 'bright-retail',
    label: '明亮零售',
    description: '明快色块、清晰卖点区域、购物页友好，适合快消、厨房、运动配件。',
    fileName: 'bright-retail.png',
    palette: ['#FFFFFF', '#FEF3C7', '#F97316', '#2563EB', '#16A34A', '#111827'],
  },
]

export const DEFAULT_STYLE_PRESET_ID = STYLE_PRESETS[0]?.id ?? ''

function getBaseUrl() {
  const base = import.meta.env.BASE_URL || './'
  return base.endsWith('/') ? base : `${base}/`
}

export function getStylePresetById(id: string | null | undefined): StylePreset | null {
  if (!id) return null
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? null
}

export function getStylePresetAssetUrl(preset: Pick<StylePreset, 'fileName'>): string {
  return `${getBaseUrl()}style-presets/${preset.fileName}`
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000)
    binary += String.fromCharCode(...chunk)
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`
}

export async function loadStylePresetDataUrl(presetId: string, signal?: AbortSignal): Promise<string> {
  const preset = getStylePresetById(presetId)
  if (!preset) throw new Error('预设风格不存在')

  const response = await fetch(getStylePresetAssetUrl(preset), {
    cache: 'force-cache',
    signal,
  })
  if (!response.ok) {
    throw new Error(`预设风格图加载失败：HTTP ${response.status}`)
  }
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('预设风格图不是有效图片')
  return blobToDataUrl(blob)
}

export async function ensureStylePresetImageStored(presetId: string, signal?: AbortSignal): Promise<{
  preset: StylePreset
  imageId: string
  dataUrl: string
}> {
  const preset = getStylePresetById(presetId)
  if (!preset) throw new Error('预设风格不存在')

  const dataUrl = await loadStylePresetDataUrl(preset.id, signal)
  const imageId = await storeImage(dataUrl, 'preset')
  return { preset, imageId, dataUrl }
}
