import { describe, expect, it } from "vitest";

import {
  ILLUSTRATION_VERSION,
  illustrationFileId,
  illustrationForNotionPage,
  manifestFromFilenames,
  serializeIllustrationManifest,
} from "@/lib/illustrations";

const NOTION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const FILE_ID = "aaaaaaaabbbbccccddddeeeeeeeeeeee";

describe("illustrationFileId", () => {
  it("strips dashes and lowercases a Notion page id", () => {
    expect(illustrationFileId(NOTION_ID)).toBe(FILE_ID);
    expect(illustrationFileId(FILE_ID.toUpperCase())).toBe(FILE_ID);
  });

  it("is null for seeds and for anything that is not 32 hex characters", () => {
    expect(illustrationFileId(null)).toBeNull();
    expect(illustrationFileId(undefined)).toBeNull();
    expect(illustrationFileId("")).toBeNull();
    expect(illustrationFileId("sample-dish:番茄炒蛋")).toBeNull();
    expect(illustrationFileId("../secret")).toBeNull();
  });
});

describe("illustrationForNotionPage", () => {
  const manifest = {
    [FILE_ID]: [240, 480, 960] as const,
  };

  it("uses the brush fallback when the Notion id is null or not in the manifest", () => {
    expect(illustrationForNotionPage(null, manifest)).toBeNull();
    expect(
      illustrationForNotionPage(
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        manifest,
      ),
    ).toBeNull();
  });

  it("points srcset at the normalized Notion page id", () => {
    const art = illustrationForNotionPage(NOTION_ID, manifest);
    expect(art).toEqual({
      src: `/illustrations/${FILE_ID}-480.webp?v=${ILLUSTRATION_VERSION}`,
      srcSet: [
        `/illustrations/${FILE_ID}-240.webp?v=${ILLUSTRATION_VERSION} 240w`,
        `/illustrations/${FILE_ID}-480.webp?v=${ILLUSTRATION_VERSION} 480w`,
        `/illustrations/${FILE_ID}-960.webp?v=${ILLUSTRATION_VERSION} 960w`,
      ].join(", "),
      sizes: "(min-width: 2560px) 280px, (min-width: 1024px) 220px, 50vw",
      thumb: `/illustrations/${FILE_ID}-240.webp?v=${ILLUSTRATION_VERSION}`,
    });
  });
});

describe("manifestFromFilenames", () => {
  it("lists an id only when 240, 480, and 960 all exist", () => {
    const manifest = manifestFromFilenames([
      `${FILE_ID}-240.webp`,
      `${FILE_ID}-480.webp`,
      `${FILE_ID}-960.webp`,
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-480.webp",
      "notes.txt",
      "../secret-480.webp",
    ]);
    expect(manifest).toEqual({ [FILE_ID]: [240, 480, 960] });
    expect(serializeIllustrationManifest(manifest)).toBe(
      `{
  "${FILE_ID}": [
    240,
    480,
    960
  ]
}
`,
    );
  });
});
