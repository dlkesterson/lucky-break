import { defineConfig } from "vite";
import { URL, fileURLToPath } from "node:url";

const resolveFromRoot = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, import.meta.url));

const isProduction = process.env.NODE_ENV === "production";

export default defineConfig({
    appType: "spa",
    base: isProduction ? "/lucky-break/" : "/",
    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            input: resolveFromRoot("./src/app/main.ts")
        }
    },
    resolve: {
        alias: {
            "app": resolveFromRoot("./src/app"),
            "physics": resolveFromRoot("./src/physics"),
            "render": resolveFromRoot("./src/render"),
            "audio": resolveFromRoot("./src/audio"),
            "util": resolveFromRoot("./src/util"),
            "cli": resolveFromRoot("./src/cli"),
            "input": resolveFromRoot("./src/input"),
            "types": resolveFromRoot("./src/types"),
            "scenes": resolveFromRoot("./src/scenes"),
            "game": resolveFromRoot("./src/game")
        }
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
