import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureStylePresetImageStored, getStylePresetAssetUrl, STYLE_PRESETS } from './stylePresets'
import { storeImage } from './db'

vi.mock('./db', () => ({
  storeImage: vi.fn(async () => 'preset-image-id'),
}))

describe('style presets', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds public asset URLs for bundled preset images', () => {
    expect(getStylePresetAssetUrl(STYLE_PRESETS[0]!)).toBe('/style-presets/clean-tech.png')
  })

  it('loads a preset image and stores it as a preset image', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['preset-bytes'], { type: 'image/png' }), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureStylePresetImageStored('clean-tech')

    expect(fetchMock).toHaveBeenCalledWith('/style-presets/clean-tech.png', expect.objectContaining({
      cache: 'force-cache',
    }))
    expect(storeImage).toHaveBeenCalledWith('data:image/png;base64,cHJlc2V0LWJ5dGVz', 'preset')
    expect(result).toMatchObject({
      imageId: 'preset-image-id',
      preset: expect.objectContaining({ id: 'clean-tech' }),
      dataUrl: 'data:image/png;base64,cHJlc2V0LWJ5dGVz',
    })
  })

  it('uses the same storage path on repeated preset selections', async () => {
    const storeImageMock = vi.mocked(storeImage)
    storeImageMock.mockResolvedValue('same-hash-id')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['same-image'], { type: 'image/png' }), {
      status: 200,
    })))

    const first = await ensureStylePresetImageStored('bright-retail')
    const second = await ensureStylePresetImageStored('bright-retail')

    expect(first.imageId).toBe('same-hash-id')
    expect(second.imageId).toBe('same-hash-id')
    expect(storeImageMock).toHaveBeenCalledTimes(2)
    expect(storeImageMock).toHaveBeenNthCalledWith(1, expect.any(String), 'preset')
    expect(storeImageMock).toHaveBeenNthCalledWith(2, expect.any(String), 'preset')
  })
})
