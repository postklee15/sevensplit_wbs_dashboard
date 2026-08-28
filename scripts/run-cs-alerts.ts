import { listProfiles } from "../lib/aclStore";
import { runCsAlertJob } from "../lib/csAlerts";

async function main() {
  const firestoreToken = (process.env.FIRESTORE_TOKEN ?? "").trim();
  if (!firestoreToken) {
    throw new Error("FIRESTORE_TOKEN 이 없습니다.");
  }
  if (!(process.env.SLACK_BOT_TOKEN ?? "").trim()) {
    throw new Error("SLACK_BOT_TOKEN 이 없습니다.");
  }
  const users = await listProfiles(firestoreToken);
  const result = await runCsAlertJob({
    firestoreToken,
    users,
    dryRun: process.env.DRY_RUN === "1",
    force: process.env.FORCE === "1",
  });
  console.log(
    JSON.stringify(
      {
        dateKst: result.dateKst,
        dryRun: result.dryRun,
        weekend: result.weekend,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
        preview: result.preview,
      },
      null,
      2,
    ),
  );
  if (result.weekend && !result.dryRun) {
    console.log("주말에는 CS 알림을 보내지 않습니다.");
  }
  if (result.errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
