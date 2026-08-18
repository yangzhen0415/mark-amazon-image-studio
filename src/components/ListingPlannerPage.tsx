import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createInputImageFromFile, ensureImageCached, useStore } from '../store'
import { getAmazonPlannerProfile, validateApiProfile } from '../lib/apiProfiles'
import { DEFAULT_AMAZON_PROMPT_DRAFT } from '../lib/amazonPrompt'
import { callAmazonPlannerApi, type PlannerApiResult } from '../lib/listingPlannerApi'
import { DEFAULT_LISTING_IMAGE_COUNT } from '../lib/listingPlanner'
import {
  AMAZON_MARKETPLACES,
  DEFAULT_AMAZON_MARKETPLACE_ID,
  getAmazonMarketplace,
  normalizeAmazonMarketplaceId,
  type AmazonMarketplaceId,
} from '../lib/amazonMarketplaces'
import { prepareReferenceImagePayload } from '../lib/referenceImagePayload'
import type { InputImage } from '../types'
import { CloseIcon, CopyIcon, PhotoIcon, PlusIcon, TrashIcon } from './icons'

const MAX_SOURCE_IMAGES = 10
const LISTING_PLANNER_DRAFT_KEY = 'amazon-listing-planner-draft'
const LEGACY_LISTING_PLANNER_DRAFT_KEY = 'amazon-jp-listing-planner-draft'
const PLANNER_MODEL_FALLBACKS = ['gpt-5.6-sol', 'gpt-4.1', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4o-mini']

type ListingPlannerDraftSnapshot = {
  sourceText: string
  sourceImageIds: string[]
  listing: string
  marketplaceId: AmazonMarketplaceId
}

function extractSection(markdown: string, heading: RegExp) {
  const match = markdown.match(heading)
  if (!match || match.index === undefined) return ''
  const start = match.index + match[0].length
  const nextHeadingIndex = markdown.slice(start).search(/\n#{1,6}\s+/)
  const end = nextHeadingIndex >= 0 ? start + nextHeadingIndex : markdown.length
  return markdown.slice(start, end).trim()
}

function getWorkbenchListingTransferText(markdown: string) {
  const title = extractSection(markdown, /^#\s*Title[^\n]*\n/im) || extractSection(markdown, /^#\s*New Title[^\n]*\n/im) || extractSection(markdown, /^#\s*Main Title[^\n]*\n/im)
  const bulletsRaw = extractSection(markdown, /^#\s*Bullet Points[^\n]*\n/im)
  const bullets = bulletsRaw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)、])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5)

  if (!title && bullets.length === 0) return markdown.trim()

  return [
    '# Title <= 75 + 125 characters',
    title || '未提取到标题',
    '',
    '# Bullet Points x5',
    ...bullets.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n').trim()
}

function isModelUnavailableError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return /model|not.*available|not.*found|does not exist|不可用|可用模型|模型范围|不存在|404/i.test(message)
}

type ListingPlannerPageProps = {
  onOpenWorkbench?: () => void
}

export default function ListingPlannerPage({ onOpenWorkbench }: ListingPlannerPageProps) {
  const settings = useStore((s) => s.settings)
  const clearInputImages = useStore((s) => s.clearInputImages)
  const showToast = useStore((s) => s.showToast)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [sourceText, setSourceText] = useState('')
  const [sourceImages, setSourceImages] = useState<InputImage[]>([])
  const [listing, setListing] = useState('')
  const [marketplaceId, setMarketplaceId] = useState<AmazonMarketplaceId>(DEFAULT_AMAZON_MARKETPLACE_ID)
  const [isPlanning, setIsPlanning] = useState(false)
  const [error, setError] = useState('')
  const [isDraftReady, setIsDraftReady] = useState(false)

  const plannerProfile = getAmazonPlannerProfile(settings)
  const marketplace = getAmazonMarketplace(marketplaceId)
  const plannerProfileError = plannerProfile ? validateApiProfile(plannerProfile) : '未配置 AI 策划 API'
  const hasInput = Boolean(sourceText.trim() || sourceImages.length > 0)
  const canPlan = hasInput && !isPlanning && !plannerProfileError

  useEffect(() => {
    let cancelled = false

    const restoreDraft = async () => {
      try {
        const rawDraft = window.localStorage.getItem(LISTING_PLANNER_DRAFT_KEY) ?? window.localStorage.getItem(LEGACY_LISTING_PLANNER_DRAFT_KEY)
        if (!rawDraft) return
        const draft = JSON.parse(rawDraft) as Partial<ListingPlannerDraftSnapshot>
        if (typeof draft.sourceText !== 'string' && typeof draft.listing !== 'string' && !Array.isArray(draft.sourceImageIds)) return
        const imageIds = Array.isArray(draft.sourceImageIds)
          ? draft.sourceImageIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
          : []
        const restoredImages = await Promise.all(
          imageIds.slice(0, MAX_SOURCE_IMAGES).map(async (id) => {
            const dataUrl = await ensureImageCached(id)
            return dataUrl ? { id, dataUrl } : null
          }),
        )
        if (cancelled) return
        setSourceText(typeof draft.sourceText === 'string' ? draft.sourceText : '')
        setListing(typeof draft.listing === 'string' ? draft.listing : '')
        setMarketplaceId(normalizeAmazonMarketplaceId(draft.marketplaceId))
        setSourceImages(restoredImages.filter((image): image is InputImage => Boolean(image)))
      } catch {
        window.localStorage.removeItem(LISTING_PLANNER_DRAFT_KEY)
      } finally {
        if (!cancelled) setIsDraftReady(true)
      }
    }

    void restoreDraft()

    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!isDraftReady) return
    const hasDraft = Boolean(sourceText.trim() || sourceImages.length > 0 || listing.trim())
    if (!hasDraft) {
      window.localStorage.removeItem(LISTING_PLANNER_DRAFT_KEY)
      window.localStorage.removeItem(LEGACY_LISTING_PLANNER_DRAFT_KEY)
      return
    }
    const snapshot: ListingPlannerDraftSnapshot = {
      sourceText,
      sourceImageIds: sourceImages.map((image) => image.id),
      listing,
      marketplaceId,
    }
    window.localStorage.setItem(LISTING_PLANNER_DRAFT_KEY, JSON.stringify(snapshot))
  }, [isDraftReady, sourceText, sourceImages, listing, marketplaceId])

  const addFiles = async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!accepted.length) {
      showToast('请选择图片文件', 'error')
      return
    }
    const remaining = MAX_SOURCE_IMAGES - sourceImages.length
    if (remaining <= 0) {
      showToast(`资料图最多 ${MAX_SOURCE_IMAGES} 张`, 'error')
      return
    }

    const nextImages = [...sourceImages]
    for (const file of accepted.slice(0, remaining)) {
      const image = await createInputImageFromFile(file)
      if (image && !nextImages.some((item) => item.id === image.id)) nextImages.push(image)
    }
    setSourceImages(nextImages)
    showToast(`已添加 ${nextImages.length - sourceImages.length} 张资料图`, 'success')
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    await addFiles(event.target.files || [])
    event.target.value = ''
  }

  useEffect(() => {
    const handleWindowPaste = (event: globalThis.ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (!files.length) return
      event.preventDefault()
      void addFiles(files)
    }

    window.addEventListener('paste', handleWindowPaste)
    return () => window.removeEventListener('paste', handleWindowPaste)
  }, [sourceImages])

  const createListing = async () => {
    if (!hasInput) {
      showToast('请先粘贴阿里参数信息，或粘贴/上传参数截图', 'error')
      return
    }
    if (!plannerProfile) {
      setError('未配置 AI 策划 API。请到设置里配置 ChatGPT/OpenAI 策划模型。')
      showToast('AI 策划配置缺失', 'error')
      return
    }
    if (plannerProfileError) {
      setError(`AI 策划配置不完整：${plannerProfileError}`)
      showToast('AI 策划配置不完整', 'error')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setIsPlanning(true)
    setError('')
    try {
      const referencePayload = await prepareReferenceImagePayload(
        sourceImages.map((image) => image.dataUrl),
        { signal: controller.signal },
      )
      const models = [
        plannerProfile.model.trim(),
        ...PLANNER_MODEL_FALLBACKS,
      ].filter((model, index, array) => model && array.indexOf(model) === index)
      let result: PlannerApiResult | null = null
      let lastError: unknown = null
      let usedModel = ''
      for (const model of models) {
        try {
          result = await callAmazonPlannerApi({
            listingText: sourceText,
            baseDraft: DEFAULT_AMAZON_PROMPT_DRAFT,
            profile: plannerProfile,
            referenceImageDataUrls: referencePayload.dataUrls,
            model,
            mode: 'listing',
            marketplaceId,
            listingImageCount: DEFAULT_LISTING_IMAGE_COUNT,
            signal: controller.signal,
          })
          usedModel = model
          break
        } catch (err) {
          lastError = err
          if (controller.signal.aborted || !isModelUnavailableError(err)) throw err
        }
      }
      if (!result) {
        const detail = lastError instanceof Error ? lastError.message : String(lastError || 'AI 策划失败')
        throw new Error(`当前策划接口拒绝了这些模型：${models.join('、')}。\n\n最后错误：${detail}\n\n请在设置 AI 里把“策划模型”改成这个 localhost 接口实际支持的模型名，或让接口开放其中一个模型。`)
      }
      if (controller.signal.aborted) return
      const nextListing = result.parsed.listingCopyMarkdown?.trim()
      if (!nextListing) throw new Error('AI 没有返回 Listing 文案，请补充参数信息后重试。')
      setListing(nextListing)
      window.localStorage.setItem(
        LISTING_PLANNER_DRAFT_KEY,
        JSON.stringify({
          sourceText,
          sourceImageIds: sourceImages.map((image) => image.id),
          listing: nextListing,
          marketplaceId,
        } satisfies ListingPlannerDraftSnapshot),
      )
      showToast(usedModel && usedModel !== plannerProfile.model.trim() ? `${marketplace.label} Listing 已生成（自动改用 ${usedModel}）` : `${marketplace.label} Listing 已生成`, 'success')
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err instanceof Error ? err.message : String(err))
      showToast('生成 Listing 失败', 'error')
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setIsPlanning(false)
      }
    }
  }

  const stopPlanning = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsPlanning(false)
    showToast('已停止生成', 'info')
  }

  const copyListing = async () => {
    if (!listing.trim()) return
    await navigator.clipboard.writeText(listing)
    showToast('Listing 已复制', 'success')
  }

  const sendToWorkbench = () => {
    if (!listing.trim()) {
      showToast('请先生成 Listing', 'error')
      return
    }
    window.localStorage.setItem(
      LISTING_PLANNER_DRAFT_KEY,
      JSON.stringify({
        sourceText,
        sourceImageIds: sourceImages.map((image) => image.id),
        listing,
        marketplaceId,
      } satisfies ListingPlannerDraftSnapshot),
    )
    const workbenchListing = getWorkbenchListingTransferText(listing)
    clearInputImages()
    const transferPayload = JSON.stringify({ listing: workbenchListing, marketplaceId })
    sessionStorage.setItem('amazon-jp-listing-transfer', transferPayload)
    window.dispatchEvent(new CustomEvent('amazon-jp-listing-transfer', { detail: { listing: workbenchListing, marketplaceId } }))
    onOpenWorkbench?.()
    showToast('Listing 已传到图片工作台，请重新上传商品角度图', 'success')
  }

  return (
    <section data-no-drag-select className="mx-auto mt-6 max-w-6xl">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-950 dark:text-gray-50">Listing 策划</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">粘贴阿里巴巴/1688 参数、商品图或参数截图，按目标站点生成 Listing。生图参考图请到图片工作台重新上传，最多 3 张。</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="ios-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">参评图 / 参数信息</div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">可直接复制图片后在这里按 Ctrl+V，也可上传截图。</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex h-9 items-center gap-2 rounded-xl bg-gray-100 px-2.5 text-sm font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                <span className="text-xs text-gray-400">目标站点</span>
                <select
                  value={marketplaceId}
                  onChange={(event) => setMarketplaceId(normalizeAmazonMarketplaceId(event.target.value))}
                  className="h-7 bg-transparent text-sm font-semibold text-gray-900 outline-none dark:text-gray-100"
                >
                  {AMAZON_MARKETPLACES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="ios-button h-9 gap-2 px-3 text-sm font-medium">
                <PlusIcon className="h-4 w-4" />
                上传
              </button>
            </div>
          </div>

          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            className="ios-field h-48 w-full resize-y p-3 text-sm leading-relaxed text-gray-800 dark:text-gray-100"
            placeholder="粘贴阿里参数、OCR 文本、采购备注、核心关键词、商品限制信息..."
          />

          <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-gray-950">
            {sourceImages.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,80px)]">
                {sourceImages.map((image, index) => (
                  <div key={image.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
                    <img src={image.dataUrl} alt={`资料图 ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setSourceImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-red-500"
                      aria-label={`删除资料图 ${index + 1}`}
                    >
                      <CloseIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-32 w-full flex-col items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                <PhotoIcon className="mb-2 h-6 w-6 text-gray-400" />
                复制阿里图片/参数截图后按 Ctrl+V，或点击上传
              </button>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={createListing}
              disabled={!canPlan}
              className={`ios-button h-10 px-4 text-sm font-semibold ${canPlan ? 'ios-button-filled' : 'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06] dark:text-gray-600'}`}
            >
              {isPlanning ? '生成中...' : '生成 Listing'}
            </button>
            {isPlanning && (
              <button type="button" onClick={stopPlanning} className="h-10 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-600">
                停止
              </button>
            )}
            <button type="button" onClick={() => setShowSettings(true, 'api')} className="ios-button ios-button-plain h-10 px-3 text-sm font-medium">
              设置 AI
            </button>
            {isDraftReady && (sourceText.trim() || sourceImages.length > 0 || listing.trim()) && (
              <span data-testid="listing-draft-saved" className="text-xs font-medium text-emerald-600 dark:text-emerald-300">草稿已自动保存</span>
            )}
            {(sourceText || sourceImages.length > 0 || listing) && (
              <button
                type="button"
                onClick={() => {
                  window.localStorage.removeItem(LISTING_PLANNER_DRAFT_KEY)
                  window.localStorage.removeItem(LEGACY_LISTING_PLANNER_DRAFT_KEY)
                  setSourceText('')
                  setSourceImages([])
                  setListing('')
                  setMarketplaceId(DEFAULT_AMAZON_MARKETPLACE_ID)
                  setError('')
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <TrashIcon className="h-4 w-4" />
                清空
              </button>
            )}
          </div>

          <div className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            当前 AI：{plannerProfile ? `${plannerProfile.name} · ${plannerProfile.model}` : '未配置'}
            {plannerProfileError ? `（${plannerProfileError}）` : ''}
          </div>
          {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 dark:bg-red-400/10 dark:text-red-200">{error}</div>}
        </div>

        <div className="ios-surface p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{marketplace.label} Listing</div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">标题 75+125 / 五点约 350 字符 / Description-A+ · {marketplace.copyLanguage}</div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={copyListing} disabled={!listing.trim()} className="ios-button h-9 gap-1.5 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40">
                <CopyIcon className="h-4 w-4" />
                复制
              </button>
              <button type="button" onClick={sendToWorkbench} disabled={!listing.trim()} className="ios-button ios-button-filled h-9 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                传到图片工作台
              </button>
            </div>
          </div>
          <textarea
            value={listing || `生成后这里会显示${marketplace.label} Listing。确认文案后点“传到图片工作台”，再去上传商品各角度参考图。`}
            readOnly
            className="ios-field h-[620px] w-full resize-none p-3 font-mono text-xs leading-relaxed text-gray-700 dark:text-gray-200"
            spellCheck={false}
          />
        </div>
      </div>
    </section>
  )
}
