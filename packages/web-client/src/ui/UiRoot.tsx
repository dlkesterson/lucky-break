import { DesignSystemProvider } from '@lucky-break/design-system';
import { HudApp } from './HudApp';
import { IntroOverlayApp } from './components/IntroOverlayApp';
import { MainMenuApp } from './scenes/MainMenuApp';
import { CasinoHubApp } from './scenes/CasinoHub';
import { LoadoutSelectionApp } from './scenes/LoadoutSelectionApp';
import { GameOverApp } from './scenes/GameOverApp';
import { PauseApp } from './scenes/PauseApp';
import { FateLedgerApp } from './scenes/FateLedgerApp';
import { useGameTheme } from './hooks/useGameTheme';

export const UiRoot = (): JSX.Element => {
  const { theme } = useGameTheme();

  return (
    <DesignSystemProvider theme={theme}>
      <HudApp />
      <IntroOverlayApp />
      <MainMenuApp />
      <CasinoHubApp />
      <LoadoutSelectionApp />
      <PauseApp />
      <GameOverApp />
      <FateLedgerApp />
    </DesignSystemProvider>
  );
};
