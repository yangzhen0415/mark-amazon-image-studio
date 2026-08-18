import type { CustomStyleReference, StyleReferenceEditState } from '../types'
import { storeImage } from './db'
import type { StylePreset } from './stylePresets'

const STYLE_REFERENCE_SIZE = 1024
const FALLBACK_PALETTE = ['#FFFFFF', '#E5E7EB', '#111827', '#2563EB', '#16A34A', '#F97316']
const FORBIDDEN_STYLE_TEXT_PATTERN = /amazon|brand|logo|price|discount|coupon|qr|barcode|review|rating|stars?|sale|\$|¥|€|£|\d+\s*%/gi
const CJK_PATTERN = /[\u3400-\u9fff\u3040-\u30ff\uff00-\uffef]/g
const PRESET_RENDER_TITLES: Record<string, string> = {
  'clean-tech': 'Clean tech style',
  'natural-warm': 'Natural warm style',
  'premium-contrast': 'Premium contrast style',
  'bright-retail': 'Bright retail style',
}

export const DEFAULT_STYLE_REFERENCE_EDIT_STATE: StyleReferenceEditState = {
  title: 'Custom style',
  palette: FALLBACK_PALETTE,
  typography: 'Clean sans editorial',
  lighting: 'Soft balanced studio light',
  material: 'Smooth product-grade surfaces',
  density: 'rich',
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const text = value?.trim() ?? ''
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toUpperCase()
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toUpperCase()}`
  return fallback
}

export function sanitizeStyleReferenceText(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? '')
    .replace(CJK_PATTERN, ' ')
    .replace(FORBIDDEN_STYLE_TEXT_PATTERN, ' ')
    .replace(/[^\w\s.,:/#&+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || fallback).slice(0, 72)
}

export function sanitizeStyleReferenceEditState(
  value: Partial<StyleReferenceEditState> | null | undefined,
): StyleReferenceEditState {
  const paletteSource = Array.isArray(value?.palette) ? value.palette : []
  return {
    title: sanitizeStyleReferenceText(value?.title, DEFAULT_STYLE_REFERENCE_EDIT_STATE.title),
    palette: Array.from({ length: 6 }, (_, index) =>
      normalizeHexColor(paletteSource[index], FALLBACK_PALETTE[index] ?? '#FFFFFF'),
    ),
    typography: sanitizeStyleReferenceText(value?.typography, DEFAULT_STYLE_REFERENCE_EDIT_STATE.typography),
    lighting: sanitizeStyleReferenceText(value?.lighting, DEFAULT_STYLE_REFERENCE_EDIT_STATE.lighting),
    material: sanitizeStyleReferenceText(value?.material, DEFAULT_STYLE_REFERENCE_EDIT_STATE.material),
    density: value?.density === 'minimal' ? 'minimal' : 'rich',
  }
}

export function createStyleReferenceEditStateFromPreset(preset: StylePreset): StyleReferenceEditState {
  return sanitizeStyleReferenceEditState({
    title: PRESET_RENDER_TITLES[preset.id] ?? preset.label,
    palette: preset.palette,
    typography: preset.id === 'premium-contrast' ? 'Elegant high-contrast serif mix' : 'Clean sans editorial',
    lighting: preset.id === 'natural-warm'
      ? 'Warm daylight and soft shadows'
      : preset.id === 'premium-contrast'
        ? 'Focused contrast and premium highlights'
        : 'Bright balanced studio light',
    material: preset.id === 'clean-tech'
      ? 'Glass, satin metal, crisp panels'
      : preset.id === 'bright-retail'
        ? 'Glossy retail panels and color blocks'
        : 'Tactile surfaces and refined textures',
    density: 'rich',
  })
}

export function getCustomStyleReferenceDescription(editState: StyleReferenceEditState): string {
  const safe = sanitizeStyleReferenceEditState(editState)
  return `${safe.typography} / ${safe.lighting} / ${safe.material}`
}

export function getCustomStyleReferenceVisualMeta(customStyle: CustomStyleReference) {
  const editState = sanitizeStyleReferenceEditState(customStyle.editState)
  return {
    label: customStyle.title || editState.title,
    description: getCustomStyleReferenceDescription(editState),
    palette: editState.palette,
  }
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  let lineY = y
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, lineY)
      line = word
      lineY += 34
    } else {
      line = testLine
    }
  }
  if (line) ctx.fillText(line, x, lineY)
}

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = 'rgba(17, 24, 39, 0.12)'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, width, height)
}

export function renderStyleReferenceDataUrl(input: StyleReferenceEditState): string {
  if (typeof document === 'undefined') throw new Error('当前环境不支持 Canvas 风格图渲染')
  const editState = sanitizeStyleReferenceEditState(input)
  const canvas = document.createElement('canvas')
  canvas.width = STYLE_REFERENCE_SIZE
  canvas.height = STYLE_REFERENCE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')

  const [background, soft, accent, ink, muted, highlight] = editState.palette
  ctx.fillStyle = background
  ctx.fillRect(0, 0, STYLE_REFERENCE_SIZE, STYLE_REFERENCE_SIZE)

  const gradient = ctx.createLinearGradient(0, 0, STYLE_REFERENCE_SIZE, STYLE_REFERENCE_SIZE)
  gradient.addColorStop(0, soft)
  gradient.addColorStop(0.55, background)
  gradient.addColorStop(1, accent)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, STYLE_REFERENCE_SIZE, STYLE_REFERENCE_SIZE)

  drawPanel(ctx, 72, 72, 880, 170, 'rgba(255,255,255,0.76)')
  ctx.fillStyle = ink
  ctx.font = '700 54px Arial, Helvetica, sans-serif'
  ctx.fillText('STYLE REFERENCE', 112, 146)
  ctx.font = '500 28px Arial, Helvetica, sans-serif'
  drawText(ctx, editState.title, 114, 196, 720)

  const swatchWidth = 132
  editState.palette.forEach((color, index) => {
    const x = 72 + index * 148
    ctx.fillStyle = color
    ctx.fillRect(x, 292, swatchWidth, 150)
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.14)'
    ctx.lineWidth = 2
    ctx.strokeRect(x, 292, swatchWidth, 150)
    ctx.fillStyle = index === 2 || index === 3 ? background : ink
    ctx.font = '700 22px Arial, Helvetica, sans-serif'
    ctx.fillText(`C${index + 1}`, x + 18, 336)
  })

  drawPanel(ctx, 72, 488, 416, 214, 'rgba(255,255,255,0.78)')
  ctx.fillStyle = ink
  ctx.font = '700 25px Arial, Helvetica, sans-serif'
  ctx.fillText('TYPE SAMPLE', 108, 546)
  ctx.font = '700 44px Arial, Helvetica, sans-serif'
  ctx.fillText('Feature clarity', 108, 604)
  ctx.font = '500 25px Arial, Helvetica, sans-serif'
  drawText(ctx, editState.typography, 108, 652, 340)

  drawPanel(ctx, 536, 488, 416, 214, 'rgba(255,255,255,0.72)')
  ctx.fillStyle = accent
  ctx.fillRect(576, 536, 118, 118)
  ctx.fillStyle = highlight
  ctx.fillRect(634, 572, 168, 94)
  ctx.fillStyle = muted
  ctx.fillRect(746, 524, 126, 150)
  ctx.fillStyle = ink
  ctx.font = '700 25px Arial, Helvetica, sans-serif'
  ctx.fillText('MATERIAL', 576, 724)

  drawPanel(ctx, 72, 746, 880, 206, 'rgba(255,255,255,0.78)')
  ctx.fillStyle = ink
  ctx.font = '700 26px Arial, Helvetica, sans-serif'
  ctx.fillText('LIGHTING', 112, 810)
  ctx.font = '500 25px Arial, Helvetica, sans-serif'
  drawText(ctx, editState.lighting, 112, 852, 340)
  ctx.font = '700 26px Arial, Helvetica, sans-serif'
  ctx.fillText(editState.density === 'minimal' ? 'MINIMAL INFO' : 'RICH INFO', 548, 810)
  ctx.font = '500 25px Arial, Helvetica, sans-serif'
  drawText(ctx, editState.material, 548, 852, 330)

  return canvas.toDataURL('image/png')
}

export async function ensureCustomStyleReferenceImageStored(
  editState: StyleReferenceEditState,
): Promise<{ imageId: string; dataUrl: string; editState: StyleReferenceEditState }> {
  const safeEditState = sanitizeStyleReferenceEditState(editState)
  const dataUrl = renderStyleReferenceDataUrl(safeEditState)
  const imageId = await storeImage(dataUrl, 'style-custom')
  return { imageId, dataUrl, editState: safeEditState }
}
