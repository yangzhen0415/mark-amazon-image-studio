import { useEffect, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import AmazonPlanner from './components/AmazonPlanner'
import ListingPlannerPage from './components/ListingPlannerPage'
import ImageEditorPage from './components/ImageEditorPage'
import SyntheticPerformerTaggerPage from './components/SyntheticPerformerTaggerPage'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import { useGlobalClickSuppression } from './lib/clickSuppression'

export type AppView = 'home' | 'planner' | 'editor' | 'tagger'

function getAppViewFromHash(): AppView {
  const route = window.location.hash.replace(/^#\/?/, '')
  if (!route) return 'planner'
  if (route === 'home' || route === 'workbench') return 'home'
  if (route === 'planner' || route === 'listing-planner') return 'planner'
  if (route === 'editor' || route === 'seedream-pro') return 'editor'
  if (route === 'tagger') return 'tagger'
  return 'home'
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const [view, setView] = useState<AppView>(getAppViewFromHash)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()
    useStore.getState().setAppMode('gallery')
  }, [setSettings])

  useEffect(() => {
    const syncViewFromLocation = () => {
      if (window.location.hash.replace(/^#\/?/, '') === 'seedream-pro') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/editor`)
      }
      setView(getAppViewFromHash())
    }
    syncViewFromLocation()
    window.addEventListener('hashchange', syncViewFromLocation)
    window.addEventListener('popstate', syncViewFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncViewFromLocation)
      window.removeEventListener('popstate', syncViewFromLocation)
    }
  }, [])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  const navigate = (nextView: AppView) => {
    setView(nextView)
    if (nextView === 'planner') {
      const nextUrl = `${window.location.pathname}${window.location.search}`
      window.history.pushState(null, '', nextUrl)
      return
    }
    if (nextView === 'home' || nextView === 'editor' || nextView === 'tagger') {
      const route = nextView === 'home' ? 'workbench' : nextView
      const hash = `#/${route}`
      if (window.location.hash !== hash) window.location.hash = `/${route}`
      return
    }

    const nextUrl = `${window.location.pathname}${window.location.search}`
    window.history.pushState(null, '', nextUrl)
  }

  return (
    <>
      <Header activeView={view} onNavigate={navigate} />
      <main data-home-main data-drag-select-surface className={view === 'home' ? 'home-main-with-dock pb-48 lg:pb-10' : 'pb-10'}>
        <div className={`safe-area-x mx-auto lg:!px-6 ${view === 'editor' ? 'max-w-[96rem]' : 'max-w-7xl'}`}>
          {view === 'editor' && <ImageEditorPage />}
          {view === 'tagger' && <SyntheticPerformerTaggerPage />}
          {view === 'planner' && <ListingPlannerPage onOpenWorkbench={() => navigate('home')} />}
          <div className={view === 'home' ? '' : 'hidden'} aria-hidden={view !== 'home'}>
            <AmazonPlanner />
            <SearchBar />
            <TaskGrid />
          </div>
        </div>
      </main>
      {view === 'home' && <InputBar />}
      <DetailModal />
      <Lightbox />
      <SettingsModal scope={view === 'editor' ? 'editor' : 'home'} />
      <ConfirmDialog />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
