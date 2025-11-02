import { defineConfig } from "vite";
import { URL, fileURLToPath } from "node:url";

const resolveFromPackage = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, import.meta.url));

const resolveFromCore = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, new URL("../core-domain/", import.meta.url)));

const resolveFromCli = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, new URL("../cli-sim/", import.meta.url)));

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
    appType: "spa",
    base: isProduction ? "/lucky-break/" : "/",
    build: {
        outDir: "dist",
        sourcemap: true
    },
    resolve: {
        alias: [
            { find: /^app\/state$/, replacement: resolveFromCore("./src/app/state.ts") },
            { find: /^app\/events$/, replacement: resolveFromCore("./src/app/events.ts") },
            { find: /^app\/replay-buffer$/, replacement: resolveFromCore("./src/app/replay-buffer.ts") },
            { find: "app", replacement: resolveFromPackage("./src/app") },
            { find: "physics", replacement: resolveFromCore("./src/physics") },
            { find: "render", replacement: resolveFromPackage("./src/render") },
            { find: "audio", replacement: resolveFromPackage("./src/audio") },
            { find: "util", replacement: resolveFromCore("./src/util") },
            { find: "cli", replacement: resolveFromCli("./src") },
            { find: "input", replacement: resolveFromPackage("./src/input") },
            { find: "types", replacement: resolveFromCore("./src/types") },
            { find: "scenes", replacement: resolveFromPackage("./src/scenes") },
            { find: "game", replacement: resolveFromCore("./src/game") },
            { find: /^config\/assets$/, replacement: resolveFromPackage("./src/config/assets.ts") },
            { find: "config", replacement: resolveFromCore("./src/config") }
        ]
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
