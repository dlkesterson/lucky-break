import { HudApp } from './HudApp';
import { BiasPhaseApp } from './scenes/BiasPhaseApp';
import { LoadoutSelectionApp } from './scenes/LoadoutSelectionApp';
import { GameOverApp } from './scenes/GameOverApp';
import { PauseApp } from './scenes/PauseApp';
import { FateLedgerApp } from './scenes/FateLedgerApp';

export const UiRoot = (): JSX.Element => (
  <>
    <HudApp />
    <BiasPhaseApp />
    <LoadoutSelectionApp />
    <PauseApp />
    <GameOverApp />
    <FateLedgerApp />
  </>
);
