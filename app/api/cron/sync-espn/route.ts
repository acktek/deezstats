import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// This endpoint is deprecated - redirect to the new sync endpoint
export async function GET(request: NextRequest) {
  // Forward the request to the new sync endpoint
  const baseUrl = request.nextUrl.origin;
  const response = await fetch(`${baseUrl}/api/cron/sync`, {
    headers: {
      authorization: request.headers.get("authorization") || "",
      cookie: request.headers.get("cookie") || "",
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
