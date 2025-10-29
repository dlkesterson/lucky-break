import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ReplayBiasChoiceEvent } from '../../src/app/replay-buffer';
import {
    gotoLuckyBreak,
    drainEvents,
    installEventHarness,
    skipLevel,
    startGameplay,
    waitForSceneTransition,
    getBiasPhaseState,
    commitBiasSelection,
    getRoundMachineSnapshot,
    getRuntimeModifiers,
    getRuntimeState,
    getReplaySnapshot,
} from './utils/harness';

type ModifierSnapshot = Awaited<ReturnType<typeof getRuntimeModifiers>>;

const waitForPreloader = async (page: Page) => {
    await page.waitForSelector('.lb-preloader[data-state="loading"]');
    await page.waitForSelector('canvas', { state: 'attached' });
    await expect(page.locator('.lb-preloader')).toHaveCount(0);
    await waitForSceneTransition(page, 'main-menu', 'enter');
};

const waitForGameplayFocus = async (page: Page) => {
    await expect.poll(async () => (await getRuntimeState(page)).currentScene).toBe('gameplay');
};

const enterFirstBiasPhase = async (page: Page) => {
    await gotoLuckyBreak(page);
    await waitForPreloader(page);

    await startGameplay(page);
    await waitForSceneTransition(page, 'gameplay', 'enter');

    await drainEvents(page);
    const levelCompleteEnter = waitForSceneTransition(page, 'level-complete', 'enter', { includeExisting: false });
    await skipLevel(page);
    await levelCompleteEnter;

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await drainEvents(page);
    const biasEnter = waitForSceneTransition(page, 'bias-phase', 'enter', { includeExisting: false });
    const levelCompleteExit = waitForSceneTransition(page, 'level-complete', 'exit', { includeExisting: false });
    await canvas.click();
    await Promise.all([biasEnter, levelCompleteExit]);
    await drainEvents(page);
};

const advanceToNextBiasPhase = async (page: Page) => {
    await drainEvents(page);
    const levelCompleteEnter = waitForSceneTransition(page, 'level-complete', 'enter', { includeExisting: false });
    await skipLevel(page);
    await levelCompleteEnter;

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await drainEvents(page);
    const biasEnter = waitForSceneTransition(page, 'bias-phase', 'enter', { includeExisting: false });
    const levelCompleteExit = waitForSceneTransition(page, 'level-complete', 'exit', { includeExisting: false });
    await canvas.click();
    await Promise.all([biasEnter, levelCompleteExit]);
    await drainEvents(page);
};

const commitBiasOption = async (page: Page, optionId: string) => {
    const biasExit = waitForSceneTransition(page, 'bias-phase', 'exit', { includeExisting: false });
    const committed = await commitBiasSelection(page, optionId);
    expect(committed).toBe(true);
    await biasExit;
    await waitForGameplayFocus(page);
    await drainEvents(page);
};

const modifiersDiffer = (before: ModifierSnapshot, after: ModifierSnapshot): boolean =>
    before.gravity !== after.gravity ||
    before.restitution !== after.restitution ||
    before.paddleWidthMultiplier !== after.paddleWidthMultiplier ||
    before.speedGovernorMultiplier !== after.speedGovernorMultiplier;

test.beforeEach(async ({ page }) => {
    await installEventHarness(page, { enableDeveloperCheats: true });
});

test('resolving a bias choice applies modifiers and resumes gameplay', async ({ page }) => {
    test.slow();

    await enterFirstBiasPhase(page);

    const biasState = await getBiasPhaseState(page);
    expect(biasState.options.length).toBeGreaterThanOrEqual(3);
    const selectedOption = biasState.options[0];
    expect(selectedOption).toBeDefined();

    const baselineRound = await getRoundMachineSnapshot(page);
    const baselineModifiers = await getRuntimeModifiers(page);

    await commitBiasOption(page, selectedOption.id);

    const afterRound = await getRoundMachineSnapshot(page);
    const afterModifiers = await getRuntimeModifiers(page);

    expect(afterRound.levelIndex).toBeGreaterThan(baselineRound.levelIndex);
    expect(afterRound.difficultyMultiplier).not.toBe(baselineRound.difficultyMultiplier);
    expect(afterRound.powerUpChanceMultiplier).not.toBe(baselineRound.powerUpChanceMultiplier);
    expect(modifiersDiffer(baselineModifiers, afterModifiers)).toBe(true);
});

test('bias selections persist across rounds and record deterministic replays', async ({ page }) => {
    test.slow();

    await enterFirstBiasPhase(page);

    const firstBiasState = await getBiasPhaseState(page);
    const firstOption = firstBiasState.options[0];
    expect(firstOption).toBeDefined();

    const baselineBeforeFirst = await getRoundMachineSnapshot(page);
    const modifiersBeforeFirst = await getRuntimeModifiers(page);

    await commitBiasOption(page, firstOption.id);

    const afterFirstRound = await getRoundMachineSnapshot(page);
    const modifiersAfterFirst = await getRuntimeModifiers(page);

    expect(modifiersDiffer(modifiersBeforeFirst, modifiersAfterFirst)).toBe(true);
    expect(afterFirstRound.difficultyMultiplier).not.toBe(baselineBeforeFirst.difficultyMultiplier);
    expect(afterFirstRound.powerUpChanceMultiplier).not.toBe(baselineBeforeFirst.powerUpChanceMultiplier);

    await advanceToNextBiasPhase(page);

    const secondBiasState = await getBiasPhaseState(page);
    expect(secondBiasState.lastSelection?.id ?? null).toBe(firstOption.id);

    const baselineBeforeSecond = await getRoundMachineSnapshot(page);
    const modifiersBeforeSecond = await getRuntimeModifiers(page);

    const secondOption = secondBiasState.options[1] ?? secondBiasState.options[0];
    expect(secondOption).toBeDefined();

    await commitBiasOption(page, secondOption.id);

    const afterSecondRound = await getRoundMachineSnapshot(page);
    const modifiersAfterSecond = await getRuntimeModifiers(page);

    expect(afterSecondRound.levelIndex).toBeGreaterThan(afterFirstRound.levelIndex);
    expect(afterSecondRound.difficultyMultiplier).not.toBe(baselineBeforeSecond.difficultyMultiplier);
    expect(afterSecondRound.powerUpChanceMultiplier).not.toBe(baselineBeforeSecond.powerUpChanceMultiplier);
    expect(modifiersDiffer(modifiersBeforeSecond, modifiersAfterSecond)).toBe(true);

    const replay = await getReplaySnapshot(page);
    const recordedChoices = replay.events.filter((event): event is ReplayBiasChoiceEvent => event.type === 'bias-choice');
    expect(recordedChoices.map((event) => event.optionId)).toEqual(expect.arrayContaining([firstOption.id, secondOption.id]));

    await enterFirstBiasPhase(page);
    const repeatState = await getBiasPhaseState(page);
    expect(repeatState.options[0]?.id ?? null).toBe(firstOption.id);
});
