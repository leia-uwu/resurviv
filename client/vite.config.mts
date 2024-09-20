import { defineConfig } from "vite";
import { Config } from "../server/src/config";
import { GIT_VERSION } from "../server/src/utils/gitRevision";

export default defineConfig(({ mode }) => {
    return {
        base: "",
        build: {
            sourcemap: true,
            chunkSizeWarningLimit: 2000,
            rollupOptions: {
                output: {
                    assetFileNames(assetInfo) {
                        if (assetInfo.name?.endsWith(".css")) {
                            return "css/[name]-[hash][extname]";
                        }
                        return "assets/[name]-[hash][extname]";
                    },
                    entryFileNames: "js/app-[hash].js",
                    chunkFileNames: "js/[name]-[hash].js",
                    manualChunks(id, _chunkInfo) {
                        if (id.includes("node_modules")) {
                            return "vendor";
                        }
                        if (id.includes("shared")) {
                            return "shared";
                        }
                    },
                },
            },
        },
        resolve: {
            extensions: [".js", ".ts"],
        },
        define: {
            GAME_REGIONS: {
                ...Config.regions,
                ...(mode === "development"
                    ? {
                          local: {
                              https: false,
                              address: `${Config.devServer.host}:${Config.devServer.port}`,
                              l10n: "index-local",
                          },
                      }
                    : {}),
            },
            GIT_VERSION: JSON.stringify(GIT_VERSION),
        },
        plugins: [
            /*
            mode !== "development"
                ? stripBlockPlugin({
                      start: "STRIP_FROM_PROD_CLIENT:START",
                      end: "STRIP_FROM_PROD_CLIENT:END",
                  })
                : undefined,
                */
        ],
        json: {
            stringify: true,
        },
        server: {
            port: 3000,
            strictPort: true,
            host: "0.0.0.0",
            proxy: {
                "/api": {
                    target: `http://${Config.apiServer.host}:${Config.apiServer.port}`,
                    changeOrigin: true,
                    secure: false,
                },
                "/team_v2": {
                    target: `http://${Config.apiServer.host}:${Config.apiServer.port}`,
                    changeOrigin: true,
                    secure: false,
                    ws: true,
                },
            },
        },
        preview: {
            port: 3000,
            strictPort: true,
            host: "0.0.0.0",
            proxy: {
                "/api": {
                    target: `http://${Config.apiServer.host}:${Config.apiServer.port}`,
                    changeOrigin: true,
                    secure: false,
                },
                "/team_v2": {
                    target: `http://${Config.apiServer.host}:${Config.apiServer.port}`,
                    changeOrigin: true,
                    secure: false,
                    ws: true,
                },
            },
        },
    };
});
