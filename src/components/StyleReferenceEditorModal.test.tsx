import { describe, expect, it } from 'vitest'
import { STYLE_REFERENCE_TEXT_OPTIONS } from './StyleReferenceEditorModal'

const CJK_PATTERN = /[\u3400-\u9fff\u3040-\u30ff\uff00-\uffef]/

describe('StyleReferenceEditorModal options', () => {
  it('keeps option values in English while exposing Chinese explanations', () => {
    const typography = STYLE_REFERENCE_TEXT_OPTIONS.typography[0]
    const lighting = STYLE_REFERENCE_TEXT_OPTIONS.lighting[1]
    const material = STYLE_REFERENCE_TEXT_OPTIONS.material[1]

    expect(typography?.value).toBe('Clean sans editorial')
    expect(typography?.value).not.toMatch(CJK_PATTERN)
    expect(typography?.labelZh).toContain('干净现代')
    expect(typography?.descriptionZh).toContain('适合科技')

    expect(lighting?.value).toBe('Warm daylight and soft shadows')
    expect(lighting?.value).not.toMatch(CJK_PATTERN)
    expect(lighting?.labelZh).toContain('暖色自然光')

    expect(material?.value).toBe('Glass, satin metal, crisp panels')
    expect(material?.value).not.toMatch(CJK_PATTERN)
    expect(material?.descriptionZh).toContain('科技')
  })
})
