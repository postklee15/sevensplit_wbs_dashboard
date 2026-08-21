import { fetchWbsTasks } from "@/lib/notion";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const { databaseTitle, tasks } = await fetchWbsTasks();
    return (
      <Dashboard
        payload={{
          fetchedAt: new Date().toISOString(),
          databaseTitle,
          tasks,
        }}
      />
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return (
      <main className="error-page">
        <h1>노션 데이터를 불러오지 못했습니다</h1>
        <p>{message}</p>
        <p className="muted">
          Integration이 해당 데이터베이스에 연결돼 있는지, `.env`의 토큰이 유효한지 확인해 주세요.
        </p>
      </main>
    );
  }
}
