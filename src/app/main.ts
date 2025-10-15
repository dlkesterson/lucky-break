import { createPreloader } from './preloader';
import { createStage } from '@render/stage';
import { Text } from 'pixi.js';

export interface LuckyBreakOptions {
    readonly container?: HTMLElement;
}

export function bootstrapLuckyBreak(options: LuckyBreakOptions = {}): void {
    const container = options.container ?? document.body;

    const preloader = createPreloader({
        container,
        onStart: async () => {
            // Initialize the game
            const stage = await createStage({ parent: container });
            const text = new Text({ text: 'Game Started!', style: { fill: 0xffffff, fontSize: 24 } });
            stage.layers.hud.addChild(text);
            text.x = 50;
            text.y = 50;
        }
    });

    preloader.prepare().catch(console.error);
}

const container = document.getElementById('app');
if (container) {
    bootstrapLuckyBreak({ container });
}
