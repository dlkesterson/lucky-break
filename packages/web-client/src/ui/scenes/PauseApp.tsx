import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toggleTheme, getThemeLabel } from 'render/theme';

import { PauseView } from './PauseView';
import { useGameTheme } from '../hooks/useGameTheme';
import { useStagePointerBlocker } from '../hooks/useStagePointerBlocker';
import { useHud } from '../state/game-bridge';
import { usePauseUi } from '../state/pause-bridge';

export const PauseApp = (): JSX.Element | null => {
  const { t } = useTranslation();
  const { theme, name: themeName } = useGameTheme();
  const { visible, suspended, snapshot } = usePauseUi();
  const { coins, entropyActions, attemptEntropyAction, settings, updateSettings } = useHud();
  const [pendingAction, setPendingAction] = useState<'resume' | 'quit' | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const isActive = visible && !suspended && snapshot !== null;
  const legendItems = snapshot?.legendItems ?? [];

  const resolveDialogContainer = useCallback(() => overlayRef.current?.ownerDocument ?? null, []);
  useStagePointerBlocker(isActive, resolveDialogContainer);

  useEffect(() => {
    if (!visible || suspended) {
      setPendingAction(null);
    }
  }, [visible, suspended, snapshot]);

  const overlayStyle = useMemo(
    () =>
      ({
        '--pause-bg-from': theme.background.from,
        '--pause-bg-to': theme.background.to,
        '--pause-panel-fill': theme.hud.panelFill,
        '--pause-panel-line': theme.hud.panelLine,
        '--pause-text-primary': theme.hud.textPrimary,
        '--pause-text-secondary': theme.hud.textSecondary,
        '--pause-accent': theme.accents.combo,
      }) as CSSProperties,
    [theme],
  );

  const scorePanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(30, 22, 52, 0.78), rgba(18, 12, 36, 0.66))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const storePanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(40, 28, 70, 0.72), rgba(18, 10, 32, 0.62))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const legendPanelStyle = useMemo(
    () =>
      ({
        background: 'linear-gradient(150deg, rgba(32, 24, 58, 0.68), rgba(20, 12, 36, 0.56))',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      }) as CSSProperties,
    [],
  );

  const themeLabel = useMemo(
    () => t('pause.themeToggle', { theme: getThemeLabel(themeName) }),
    [t, themeName],
  );

  const resetPendingIfVisible = () => {
    if (!visible) {
      setPendingAction(null);
    }
  };

  const volumePercent = useMemo(() => {
    if (!Number.isFinite(settings.masterVolume)) {
      return 0;
    }
    const clamped = Math.max(0, Math.min(1, settings.masterVolume));
    return Math.round(clamped * 100);
  }, [settings.masterVolume]);

  const handleVolumeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      const nextValue = Number(event.currentTarget.value);
      if (!Number.isFinite(nextValue) || !updateSettings) {
        return;
      }
      const normalized = Math.max(0, Math.min(100, nextValue)) / 100;
      updateSettings({
        masterVolume: normalized,
        ...(normalized > 0 && settings.muted ? { muted: false } : {}),
      });
    },
    [settings.muted, updateSettings],
  );

  const handleMuteToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (!updateSettings) {
        return;
      }
      updateSettings({ muted: event.currentTarget.checked });
    },
    [updateSettings],
  );

  const handleEntropyAction = useCallback(
    (action: string) => {
      if (!attemptEntropyAction) {
        return;
      }
      attemptEntropyAction(action as any); // Type cast needed since view uses generic string
    },
    [attemptEntropyAction],
  );

  const handleThemeToggle = useCallback(() => {
    toggleTheme();
  }, []);

  if (!isActive || !snapshot) {
    return null;
  }

  const titleLabel = snapshot?.title ?? t('pause.title');
  const descriptionLabel = t('pause.description');
  const resumeLabel =
    pendingAction === 'resume'
      ? t('pause.resumePending')
      : (snapshot?.resumeLabel ?? t('pause.resumeLabel'));
  const quitLabel = pendingAction === 'quit' ? t('pause.quitPending') : snapshot.quitLabel;

  const handleResume = async (
    event?: MouseEvent<HTMLDivElement | HTMLButtonElement>,
  ): Promise<void> => {
    event?.stopPropagation();
    if (pendingAction) {
      return;
    }
    try {
      setPendingAction('resume');
      await snapshot.onResume();
    } catch (error) {
      console.error('Failed to resume from pause overlay', error);
      setPendingAction(null);
      resetPendingIfVisible();
    } finally {
      setPendingAction(null);
    }
  };

  const handleQuit = snapshot.onQuit
    ? async (event?: MouseEvent<HTMLButtonElement>): Promise<void> => {
        event?.stopPropagation();
        if (!snapshot.onQuit || pendingAction) {
          return;
        }
        try {
          setPendingAction('quit');
          await snapshot.onQuit();
        } catch (error) {
          console.error('Failed to quit from pause overlay', error);
          setPendingAction(null);
          resetPendingIfVisible();
        } finally {
          setPendingAction(null);
        }
      }
    : null;

  return (
    <PauseView
      visible={isActive}
      title={titleLabel}
      description={descriptionLabel}
      score={snapshot?.score ?? 0}
      coins={coins}
      entropyActions={entropyActions}
      legendTitle={snapshot?.legendTitle ?? null}
      legendItems={legendItems}
      resumeLabel={resumeLabel}
      quitLabel={quitLabel}
      pending={pendingAction}
      theme={theme}
      themeLabel={themeLabel}
      volumePercent={volumePercent}
      muted={settings.muted}
      overlayStyle={overlayStyle}
      scorePanelStyle={scorePanelStyle}
      storePanelStyle={storePanelStyle}
      legendPanelStyle={legendPanelStyle}
      onResume={handleResume}
      onQuit={handleQuit}
      onVolumeChange={handleVolumeChange}
      onMuteToggle={handleMuteToggle}
      onThemeToggle={handleThemeToggle}
      onEntropyAction={handleEntropyAction}
      overlayRef={overlayRef}
    />
  );
};
