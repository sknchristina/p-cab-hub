import type { Config } from "@netlify/functions";

/**
 * 주 1회 사이트를 재빌드한다.
 * 재빌드 과정에서 scripts/build.mjs 가 Notion DB를 다시 읽어 숫자·문헌목록을 갱신한다.
 *
 * 필요한 환경변수
 *   BUILD_HOOK_URL   Netlify 빌드 훅 URL
 *                    (Project configuration → Build & deploy → Build hooks 에서 생성)
 *
 * 스케줄: 매주 월요일 08:00 KST = 일요일 23:00 UTC
 */
export default async (req: Request) => {
  const hook = Netlify.env.get("BUILD_HOOK_URL");
  if (!hook) {
    console.error("BUILD_HOOK_URL 이 설정되지 않아 재빌드를 건너뜁니다.");
    return;
  }

  const res = await fetch(hook, { method: "POST" });
  const { next_run } = await req.json().catch(() => ({ next_run: "unknown" }));

  console.log(
    res.ok
      ? `주간 재빌드를 요청했습니다. 다음 실행 예정: ${next_run}`
      : `재빌드 요청 실패 (${res.status}). 다음 실행 예정: ${next_run}`
  );
};

export const config: Config = {
  schedule: "0 23 * * 0",
};
