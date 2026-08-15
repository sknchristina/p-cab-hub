import type { Context, Config } from "@netlify/edge-functions";

export default async (req: Request, context: Context) => {
  const user = Netlify.env.get("SITE_USER");
  const pass = Netlify.env.get("SITE_PASSWORD");

  // 자격증명이 설정되지 않았으면 게이트를 통과시킨다(설정 누락으로 사이트가 잠기는 것을 방지)
  if (!user || !pass) return context.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      const gotUser = decoded.slice(0, idx);
      const gotPass = decoded.slice(idx + 1);
      if (gotUser === user && gotPass === pass) return context.next();
    } catch {
      // 잘못된 형식은 아래에서 재인증 요청으로 처리
    }
  }

  return new Response("인증이 필요합니다. / Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="P-CAB Intelligence Hub", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

export const config: Config = {
  path: "/*",
};
