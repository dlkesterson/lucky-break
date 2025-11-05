import { HudApp } from './HudApp';
import { BiasPhaseApp } from './scenes/BiasPhaseApp';
import { LoadoutSelectionApp } from './scenes/LoadoutSelectionApp';

export const UiRoot = (): JSX.Element => (
  <>
    <HudApp />
    <BiasPhaseApp />
    <LoadoutSelectionApp />
  </>
);
