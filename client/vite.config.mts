import { ProxyOptions, defineConfig, splitVendorChunkPlugin } from "vite";
import { Config } from "../server/src/config";


const proxyConfig: Record<string, ProxyOptions> = {
    "/api": {
        target: `http://${Config.host}:${Config.port}`,
        changeOrigin: true,
        secure: false
    },
    "/play": {
        target: `http://${Config.host}:${Config.port}`,
        changeOrigin: true,
        secure: false,
        ws: true
    },
    "/team_v2": {
        target: `http://${Config.host}:${Config.port}`,
        changeOrigin: true,
        secure: false,
        ws: true
    }
}

export default defineConfig(() => {
    return {
        esbuild: {
            jsxFactory: 'h',
            jsxFragment: 'Fragment'
        },
        plugins: [
            splitVendorChunkPlugin()
        ],
        resolve: {
            extensions: ['.js', '.ts'],
        },
        server: {
            port: 3000,
            strictPort: true,
            host: "0.0.0.0",
            proxy: proxyConfig
        },
        preview: {
            port: 3000,
            strictPort: true,
            host: "0.0.0.0",
            proxy: proxyConfig
        }
    };
});
