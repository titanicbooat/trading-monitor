import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return proxy(req);
}

export async function POST(req: NextRequest) {
  return proxy(req);
}

export async function PUT(req: NextRequest) {
  return proxy(req);
}

export async function DELETE(req: NextRequest) {
  return proxy(req);
}

async function proxy(req: NextRequest) {
  const backendUrl = req.headers.get("x-backend-url");
  if (!backendUrl) {
    return NextResponse.json(
      { detail: "Missing x-backend-url header" },
      { status: 400 }
    );
  }

  // Extract the path after /api/proxy/
  const url = new URL(req.url);
  const proxyPath = url.pathname.replace(/^\/api\/proxy/, "");
  const target = `${backendUrl}/api${proxyPath}${url.search}`;

  // Forward headers (strip hop-by-hop and our custom header)
  const headers = new Headers();
  const authorization = req.headers.get("authorization");
  if (authorization) headers.set("Authorization", authorization);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
    });

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "Backend unreachable" },
      { status: 502 }
    );
  }
}
