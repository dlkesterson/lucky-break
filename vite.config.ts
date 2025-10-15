import { defineConfig } from "vite";
import { URL, fileURLToPath } from "node:url";

const resolveFromRoot = (relativePath: string) =>
    fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
    appType: "spa",
    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            input: resolveFromRoot("./src/app/main.ts")
        }
    },
    resolve: {
        alias: {
            "@app": resolveFromRoot("./src/app"),
            "@physics": resolveFromRoot("./src/physics"),
            "@render": resolveFromRoot("./src/render"),
            "@audio": resolveFromRoot("./src/audio"),
            "@util": resolveFromRoot("./src/util"),
            "@cli": resolveFromRoot("./src/cli")
        }
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
