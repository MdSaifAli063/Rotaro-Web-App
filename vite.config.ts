import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const optionalUnzipperS3Stub = {
  name: "optional-unzipper-s3-stub",
  enforce: "pre" as const,
  resolveId(source: string) {
    if (source === "@aws-sdk/client-s3") {
      return "\0optional-unzipper-s3-stub";
    }
  },
  load(id: string) {
    if (id === "\0optional-unzipper-s3-stub") {
      return "export {};";
    }
  },
};

export default defineConfig({
  plugins: [
    optionalUnzipperS3Stub,
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    nitro({
      preset: "vercel",
      vercel: {
        functions: {
          runtime: "nodejs22.x",
        },
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: "./src/server.ts",
        },
      },
    },
  },
});
