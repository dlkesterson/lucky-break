import { HudApp } from './HudApp';
import { MainMenuApp } from './scenes/MainMenuApp';
import { BiasPhaseApp } from './scenes/BiasPhaseApp';
import { LoadoutSelectionApp } from './scenes/LoadoutSelectionApp';
import { GameOverApp } from './scenes/GameOverApp';
import { PauseApp } from './scenes/PauseApp';
import { FateLedgerApp } from './scenes/FateLedgerApp';

export const UiRoot = (): JSX.Element => (
  <>
    <HudApp />
    <MainMenuApp />
    <BiasPhaseApp />
    <LoadoutSelectionApp />
    <PauseApp />
    <GameOverApp />
    <FateLedgerApp />
  </>
);
