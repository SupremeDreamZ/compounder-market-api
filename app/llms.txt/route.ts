import { LLMS_TEXT } from "@/lib/discovery";

export const dynamic = "force-static";

export async function GET() {
  return new Response(LLMS_TEXT, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
