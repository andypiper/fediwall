import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import viteCompression from "vite-plugin-compression";
import gitDescribe from "git-describe";
import viteLegacy from "@vitejs/plugin-legacy";

let version: string | undefined;

try {
    const gitInfo = gitDescribe.gitDescribeSync();
    if (gitInfo.tag) {
        version = `${gitInfo.tag}`;
        if (gitInfo.distance)
            version += `-${gitInfo.distance}+${gitInfo.hash}`;
    }
} catch { ; }

// https://vitejs.dev/config/
export default defineConfig({
    base: "./",
    define: {
        __VERSION__: JSON.stringify(version ?? "")
    },
    plugins: [
        vue(),
        viteCompression(),
        viteLegacy({
            targets: 'last 2 versions and not dead, > 0.2%, Firefox ESR, Android >= 7'
        }),
    ],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url))
        }
    },
    css: {
        preprocessorOptions: {
            scss: {
                // Bootstrap 5.3 still uses legacy @import, global built-ins and the
                // old if() syntax — all deprecated in Dart Sass 2.x but still working.
                // Silence those warnings so the build output stays clean; they are
                // Bootstrap's to fix, not ours.
                silenceDeprecations: [
                    'import',
                    'global-builtin',
                    'color-functions',
                    'if-function',
                ],
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    "vue-core": ["vue", "@vueuse/core"],
                    "bootstrap": ["bootstrap"],
                    "icons": [
                        "@fortawesome/fontawesome-svg-core",
                        "@fortawesome/free-solid-svg-icons",
                        "@fortawesome/vue-fontawesome",
                    ],
                    "dompurify": ["dompurify", "vue-dompurify-html"],
                },
            },
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
    },
});
