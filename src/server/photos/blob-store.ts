import { del, put } from "@vercel/blob";

import type { PhotoStore } from "@/server/photos/store";

export function privateBlobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.BLOB_STORE_ID?.trim(),
  );
}

function blobAuth(): { token?: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? { token } : {};
}

/** Private Vercel Blob. The browser never receives the blob URL. */
export function createBlobPhotoStore(): PhotoStore {
  return {
    async put(key, bytes, contentType) {
      await put(key, Buffer.from(bytes), {
        access: "private",
        contentType,
        allowOverwrite: true,
        addRandomSuffix: false,
        ...blobAuth(),
      });
    },
    async delete(key) {
      await del(key, blobAuth());
    },
  };
}
