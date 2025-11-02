import { Container, Graphics, Text } from 'pixi.js';
import type { Scene, SceneContext } from 'render/scene-manager';
import type { GameSceneServices } from 'app/scene-services';
import type { UiSceneTransitionAction } from 'app/events';
import { GameTheme, onThemeChange } from 'render/theme';
import type { FateLedgerSnapshot, FateLedgerEntry } from 'app/fate-ledger';

const MAX_DISPLAY_ENTRIES = 10;

const hexToNumber = (hex: string): number => Number.parseInt(hex.replace('#', ''), 16);

const formatDuration = (durationMs: number): string => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return '0s';
    }

    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) {
        parts.push(`${hours}h`);
    }
    if (minutes > 0 || hours > 0) {
        parts.push(`${minutes}m`);
    }
    parts.push(`${seconds}s`);
    return parts.join(' ');
};

const trimTrailingZeros = (value: string): string => value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

const formatSigned = (value: number): string => {
    const normalized = Number.isFinite(value) ? value : 0;
    const precision = Math.abs(normalized) >= 10 ? 1 : 2;
    const formatted = trimTrailingZeros(normalized.toFixed(precision));
    if (normalized > 0) {
        return `+${formatted}`;
    }
    if (normalized < 0) {
        return formatted;
    }
    return '0';
};

const formatTimestamp = (timestamp: number): string => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '—';
    }
    const iso = new Date(timestamp).toISOString();
    return iso.replace('T', ' ').slice(0, 16);
};

const formatEntry = (entry: FateLedgerEntry, index: number): string => {
    if (entry.kind !== 'idle-roll') {
        return '';
    }
    const timestamp = formatTimestamp(entry.timestamp);
    const duration = formatDuration(entry.durationMs);
    const entropy = formatSigned(entry.entropyEarned);
    const dust = trimTrailingZeros(entry.certaintyDustEarned.toFixed(2));
    const note = entry.notes ? ` — ${entry.notes}` : '';
    return `${index.toString().padStart(2, '0')}. ${timestamp} · ${duration} · ΔEntropy ${entropy} · Dust ${dust}${note}`;
};

const buildSummary = (snapshot: FateLedgerSnapshot): string => {
    const lines = [
        `Logged Rolls: ${snapshot.totalIdleRolls}`,
        `Accumulated Idle Time: ${formatDuration(snapshot.totals.durationMs)}`,
        `Entropy Earned: ${formatSigned(snapshot.totals.entropyEarned)}`,
        `Certainty Dust: ${trimTrailingZeros(snapshot.totals.certaintyDustEarned.toFixed(2))}`,
    ];

    if (snapshot.latestEntryTimestamp) {
        lines.push(`Last Entry: ${formatTimestamp(snapshot.latestEntryTimestamp)}`);
    }

    return lines.join('\n');
};

export const createFateLedgerScene = (
    context: SceneContext<GameSceneServices>,
): Scene<undefined, GameSceneServices> => {
    let container: Container | null = null;
    let overlay: Graphics | null = null;
    let panel: Graphics | null = null;
    let titleText: Text | null = null;
    let summaryText: Text | null = null;
    let entriesText: Text | null = null;
    let hintText: Text | null = null;
    let unsubscribeTheme: (() => void) | null = null;
    let unsubscribeLedger: (() => void) | null = null;

    interface LayoutMetrics {
        readonly width: number;
        readonly height: number;
        readonly panelWidth: number;
        readonly panelHeight: number;
        readonly panelX: number;
        readonly panelY: number;
    }

    let layout: LayoutMetrics | null = null;

    const emitSceneEvent = (action: UiSceneTransitionAction) => {
        context.bus.publish('UiSceneTransition', {
            scene: 'fate-ledger',
            action,
        });
    };

    const pushIdleAudioState = () => {
        context.audioState$.next({
            combo: 0,
            activePowerUps: [],
            lookAheadMs: context.scheduler.lookAheadMs,
        });
    };

    const setInteraction = (enabled: boolean) => {
        if (!container) {
            return;
        }
        container.eventMode = enabled ? 'static' : 'none';
        container.interactiveChildren = enabled;
        container.cursor = enabled ? 'pointer' : 'default';
        context.renderStageSoon();
    };

    const repaintPanel = () => {
        if (!layout || !overlay || !panel) {
            return;
        }
        overlay.clear();
        overlay.rect(0, 0, layout.width, layout.height);
        overlay.fill({ color: hexToNumber(GameTheme.background.to), alpha: 0.82 });

        panel.clear();
        panel.roundRect(layout.panelX, layout.panelY, layout.panelWidth, layout.panelHeight, 32)
            .fill({ color: hexToNumber(GameTheme.hud.panelFill), alpha: 0.96 })
            .stroke({ color: hexToNumber(GameTheme.hud.panelLine), width: 5, alignment: 0.5 });
    };

    const applyTheme = () => {
        repaintPanel();

        if (titleText) {
            titleText.style = {
                ...titleText.style,
                fill: hexToNumber(GameTheme.hud.accent),
                fontFamily: GameTheme.font,
            };
        }

        if (summaryText) {
            summaryText.style = {
                ...summaryText.style,
                fill: hexToNumber(GameTheme.hud.textPrimary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (entriesText) {
            entriesText.style = {
                ...entriesText.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
        }

        if (hintText) {
            hintText.style = {
                ...hintText.style,
                fill: hexToNumber(GameTheme.hud.textSecondary),
                fontFamily: GameTheme.monoFont,
            };
        }

        context.renderStageSoon();
    };

    const handleClose = (event?: { stopPropagation?: () => void }) => {
        event?.stopPropagation?.();
        context.popScene();
    };

    const updateEntries = (snapshot: FateLedgerSnapshot) => {
        if (!summaryText || !entriesText) {
            return;
        }

        summaryText.text = buildSummary(snapshot);

        if (snapshot.entries.length === 0) {
            entriesText.text = 'No idle rolls recorded yet. Complete idle simulations to chronicle your fate.';
            updateLayout();
            return;
        }

        const visibleEntries = snapshot.entries.slice(0, MAX_DISPLAY_ENTRIES);
        entriesText.text = visibleEntries.map((entry, index) => formatEntry(entry, index + 1)).join('\n');
        updateLayout();
    };

    const updateLayout = () => {
        if (!layout || !titleText || !summaryText || !entriesText || !hintText) {
            return;
        }

        const padding = Math.max(28, Math.min(layout.panelWidth, layout.panelHeight) * 0.06);
        const contentWidth = Math.max(220, layout.panelWidth - padding * 2);

        titleText.position.set(layout.panelX + layout.panelWidth / 2, layout.panelY + padding);

        summaryText.position.set(layout.panelX + padding, layout.panelY + padding + 64);
        summaryText.style = {
            ...summaryText.style,
            wordWrap: true,
            wordWrapWidth: contentWidth,
        };

        entriesText.position.set(layout.panelX + padding, summaryText.position.y + summaryText.height + 24);
        entriesText.style = {
            ...entriesText.style,
            wordWrap: true,
            wordWrapWidth: contentWidth,
        };

        const panelBottom = layout.panelY + layout.panelHeight;
        hintText.position.set(layout.panelX + layout.panelWidth / 2, panelBottom - padding);
    };

    return {
        init() {
            container = new Container();
            container.on('pointertap', handleClose);

            const { width, height } = context.designSize;
            const panelWidth = Math.min(width * 0.82, 920);
            const panelHeight = Math.min(height * 0.78, 620);
            const panelX = (width - panelWidth) / 2;
            const panelY = (height - panelHeight) / 2;
            layout = { width, height, panelWidth, panelHeight, panelX, panelY } satisfies LayoutMetrics;

            overlay = new Graphics();
            overlay.eventMode = 'none';

            panel = new Graphics();
            panel.eventMode = 'none';

            titleText = new Text({
                text: 'FATE LEDGER',
                style: {
                    align: 'center',
                    fontSize: 48,
                    fontWeight: '800',
                    letterSpacing: 2,
                    fill: hexToNumber(GameTheme.hud.accent),
                },
            });
            titleText.anchor.set(0.5, 0);

            summaryText = new Text({
                text: '',
                style: {
                    align: 'left',
                    fontSize: 22,
                    lineHeight: 30,
                    fill: hexToNumber(GameTheme.hud.textPrimary),
                },
            });

            entriesText = new Text({
                text: '',
                style: {
                    align: 'left',
                    fontSize: 20,
                    lineHeight: 28,
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                },
            });

            hintText = new Text({
                text: 'Tap anywhere to close',
                style: {
                    align: 'center',
                    fontSize: 18,
                    fill: hexToNumber(GameTheme.hud.textSecondary),
                },
            });
            hintText.anchor.set(0.5, 1);

            container.addChild(overlay, panel, titleText, summaryText, entriesText, hintText);
            context.addToLayer('hud', container);

            setInteraction(true);
            repaintPanel();
            updateLayout();

            unsubscribeTheme = onThemeChange(() => {
                applyTheme();
                updateLayout();
            });
            applyTheme();

            unsubscribeLedger = context.fateLedger.subscribe((snapshot) => {
                updateEntries(snapshot);
                context.renderStageSoon();
            });

            updateEntries(context.fateLedger.getSnapshot());
            pushIdleAudioState();
            emitSceneEvent('enter');
        },
        update() {
            /* no-op */
        },
        destroy() {
            unsubscribeLedger?.();
            unsubscribeLedger = null;
            unsubscribeTheme?.();
            unsubscribeTheme = null;

            if (container) {
                container.off('pointertap', handleClose);
                setInteraction(false);
                context.removeFromLayer(container);
                container.destroy({ children: true });
            }

            container = null;
            overlay = null;
            panel = null;
            titleText = null;
            summaryText = null;
            entriesText = null;
            hintText = null;
            layout = null;

            pushIdleAudioState();
            emitSceneEvent('exit');
            context.renderStageSoon();
        },
        suspend() {
            setInteraction(false);
            pushIdleAudioState();
            emitSceneEvent('suspend');
        },
        resume() {
            setInteraction(true);
            pushIdleAudioState();
            emitSceneEvent('resume');
        },
    };
};
