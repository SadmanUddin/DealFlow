import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "dealflow-production-csp",
      apply: "build",
      transformIndexHtml() {
        if (command !== "build") return;
        const endpoint = loadEnv(mode, process.cwd()).VITE_API_BASE_URL?.trim();
        const url = new URL(
          endpoint || "http://localhost:3000/api",
          "https://frontend.invalid",
        );
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        ) {
          throw new Error(
            "VITE_API_BASE_URL must be an HTTP(S) URL without credentials",
          );
        }
        const api = url.hostname === "frontend.invalid" ? "" : ` ${url.origin}`;
        const content = [
          "default-src 'none'",
          "script-src 'self'",
          "style-src 'self'",
          "style-src-attr 'unsafe-inline'",
          "font-src 'self'",
          `img-src 'self' data: blob:${api}`,
          `connect-src 'self'${api}`,
          "base-uri 'none'",
          "form-action 'self'",
          "object-src 'none'",
        ].join("; ");
        return [
          {
            tag: "meta",
            attrs: { "http-equiv": "Content-Security-Policy", content },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react-runtime";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ["sb-1nhquhijrhum.vercel.run"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
}));
