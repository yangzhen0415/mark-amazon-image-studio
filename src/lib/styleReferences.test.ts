import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ensureCustomStyleReferenceImageStored,
  renderStyleReferenceDataUrl,
  sanitizeStyleReferenceEditState,
} from './styleReferences'
import { storeImage } from './db'

vi.mock('./db', () => ({
  storeImage: vi.fn(async () => 'custom-style-image-id'),
}))

function stubCanvas() {
  const textCalls: string[] = []
  const gradient = { addColorStop: vi.fn() }
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn((text: string) => {
      textCalls.push(text)
    }),
    measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
    createLinearGradient: vi.fn(() => gradient),
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => 'data:image/png;base64,rendered-style'),
  }
  vi.stubGlobal('document', {
    createElement: vi.fn(() => canvas),
  })
  return { canvas, ctx, textCalls }
}

describe('editable style references', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('sanitizes unsafe user text and normalizes six palette colors', () => {
    const safe = sanitizeStyleReferenceEditState({
      title: '测试 Amazon $99 QR sale',
      palette: ['ffffff', '#abc123', 'bad'],
      typography: 'Brand logo price 中文',
      lighting: 'Warm daylight',
      material: 'QR coupon barcode',
      density: 'minimal',
    })

    expect(safe.title).not.toMatch(/测试|Amazon|\$|QR|sale/i)
    expect(safe.typography).not.toMatch(/Brand|logo|price|中文/i)
    expect(safe.material).not.toMatch(/QR|coupon|barcode/i)
    expect(safe.palette).toHaveLength(6)
    expect(safe.palette[0]).toBe('#FFFFFF')
    expect(safe.palette[1]).toBe('#ABC123')
    expect(safe.palette[2]).toBe('#111827')
    expect(safe.density).toBe('minimal')
  })

  it('renders a 1024 PNG data URL without unsafe text', () => {
    const { canvas, textCalls } = stubCanvas()

    const dataUrl = renderStyleReferenceDataUrl({
      title: 'Amazon 测试 $99',
      palette: ['#FFFFFF', '#E5E7EB', '#111827', '#2563EB', '#16A34A', '#F97316'],
      typography: 'Clean sans',
      lighting: 'Soft light',
      material: 'Logo QR price',
      density: 'rich',
    })

    expect(canvas.width).toBe(1024)
    expect(canvas.height).toBe(1024)
    expect(dataUrl).toBe('data:image/png;base64,rendered-style')
    expect(textCalls.join(' ')).not.toMatch(/Amazon|测试|\$99|Logo|QR|price/i)
  })

  it('stores editable style references as style-custom images', async () => {
    stubCanvas()

    const result = await ensureCustomStyleReferenceImageStored({
      title: 'Retail panels',
      palette: ['#FFFFFF', '#E5E7EB', '#111827', '#2563EB', '#16A34A', '#F97316'],
      typography: 'Clean sans',
      lighting: 'Soft light',
      material: 'Gloss panels',
      density: 'rich',
    })

    expect(storeImage).toHaveBeenCalledWith('data:image/png;base64,rendered-style', 'style-custom')
    expect(result).toMatchObject({
      imageId: 'custom-style-image-id',
      dataUrl: 'data:image/png;base64,rendered-style',
    })
  })
})
