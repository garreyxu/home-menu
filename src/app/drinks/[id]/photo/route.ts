import { requireApiSession } from "@/lib/auth/require-session";
import { readDrinkPhoto } from "@/server/drinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: RouteContext<"/drinks/[id]/photo">,
): Promise<Response> {
  const denied = await requireApiSession();
  if (denied) return denied;
  const { id } = await context.params;
  const photo = await readDrinkPhoto(id);
  if (!photo) {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.contentType,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
