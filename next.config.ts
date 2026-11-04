import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import {
  manifestFromFilenames,
  serializeIllustrationManifest,
} from "./src/lib/illustrations";

function refreshIllustrationManifest(): void {
  const dir = path.join(process.cwd(), "public", "illustrations");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    names = [];
  }
  const next = serializeIllustrationManifest(manifestFromFilenames(names));
  const file = path.join(
    process.cwd(),
    "src",
    "generated",
    "illustrations.json",
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current !== next) fs.writeFileSync(file, next);
}

refreshIllustrationManifest();

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],
  async headers() {
    return [
      {
        source: "/illustrations/:path*",
        headers: [
          {
            key: "cache-control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/frames/:path*",
        headers: [
          {
            key: "cache-control",
            value: "public, max-age=86400",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
