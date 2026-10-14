import actions from './engine/actions';
import { MapView } from './ui/MapView';
import { AppHeader } from './ui/AppHeader';
import { MobileHeader } from './ui/MobileHeader';
import { DesktopRail } from './ui/DesktopRail';
import { MobileNav } from './ui/MobileNav';
import { MobileSelectionBar } from './ui/MobileSelectionBar';
import { ExportDrawer } from './ui/drawers/ExportDrawer';
import { DrawDrawer } from './ui/drawers/DrawDrawer';
import { StyleDrawer } from './ui/drawers/StyleDrawer';
import { ImageDrawer } from './ui/drawers/ImageDrawer';
import { LayersDrawer } from './ui/drawers/LayersDrawer';
import { SettingsDrawer } from './ui/drawers/SettingsDrawer';
import { ChangelogDrawer } from './ui/drawers/ChangelogDrawer';
import { WelcomeModal } from './ui/WelcomeModal';
import { ShortcutSheet } from './ui/ShortcutSheet';
import { Toast } from './ui/Toast';
import { TutorialOverlay, TourSpot, TourCall, TutorialPill } from './ui/TutorialOverlay';

export default function App() {
  return (
    <>
      <a href="#map" id="skip-link">
        Skip to map
      </a>
      <div id="a11y-live" className="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
      <AppHeader />
      <MobileHeader />
      <MapView />
      <button id="sheet-backdrop" onClick={() => { actions.closeDrawers() }} aria-label="Close panel"></button>
      <DesktopRail />
      <MobileNav />
      <MobileSelectionBar />
      <ExportDrawer />
      <DrawDrawer />
      <StyleDrawer />
      <ImageDrawer />
      <LayersDrawer />
      <ChangelogDrawer />
      <WelcomeModal />
      <TutorialOverlay />
      <TourSpot />
      <TourCall />
      <TutorialPill />
      <ShortcutSheet />
      <SettingsDrawer />
      <Toast />
    </>
  );
}
