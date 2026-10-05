import { Icon } from '../lib/icons';
import actions from '../engine/actions';
export function MobileNav() {
  return (
    <nav id="mobile-nav" className="lg:hidden" aria-label="Primary tools">
      <button onClick={() => { actions.toggleDrawer('layers-drawer') }} data-drawer="layers-drawer" className="mobile-dock-item">
        <Icon name="layers-3" className="w-5 h-5" />
        <span>
          Map
        </span>
      </button>
      <button onClick={() => { actions.openStyleDrawerForActive() }} data-drawer="style-drawer" className="mobile-dock-item">
        <Icon name="palette" className="w-5 h-5" />
        <span>
          Style
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('draw-drawer') }} data-drawer="draw-drawer" className="mobile-dock-item mobile-draw-action">
        <Icon name="pen-tool" className="w-6 h-6" />
        <span>
          Draw
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('image-drawer') }} data-drawer="image-drawer" className="mobile-dock-item">
        <Icon name="image" className="w-5 h-5" />
        <span>
          Overlay
        </span>
      </button>
      <button onClick={() => { actions.toggleDrawer('export-drawer') }} data-drawer="export-drawer" className="mobile-dock-item">
        <Icon name="share" className="w-5 h-5" />
        <span>
          Export
        </span>
      </button>
    </nav>
  );
}
