import { get } from "@vercel/blob";
import { eq } from "drizzle-orm";

import { requireApiSession } from "@/lib/auth/require-session";
import { getDb } from "@/server/db";
import { dishes } from "@/server/db/schema";

const DISH_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await context.params;
  if (!DISH_ID.test(id)) return notFound();

  try {
    const [dish] = await getDb()
      .select({ photoKey: dishes.photoKey })
      .from(dishes)
      .where(eq(dishes.id, id))
      .limit(1);
    if (!dish?.photoKey || dish.photoKey.includes("://")) return notFound();

    const result = await get(dish.photoKey, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream)
      return notFound();
    const contentType = result.blob.contentType;
    if (!ALLOWED_TYPES.has(contentType)) return notFound();

    return new Response(result.stream, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "content-disposition": "inline",
      },
    });
  } catch {
    return notFound();
  }
}
