import app from "./app";
import { logger } from "./lib/logger";
import { startSubmissionRecovery } from "./lib/generation-recovery";
import { startAccountMaintenance } from "./lib/data-retention";
import { startDailyCreditIssuance } from "./lib/daily-credits";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const stopRecovery = startSubmissionRecovery();
  server.once("close", stopRecovery);
  const stopMaintenance = startAccountMaintenance();
  server.once("close", stopMaintenance);
  const stopDailyCredits = startDailyCreditIssuance((error) => {
    logger.error({ err: error }, "Daily credit issuance failed");
  });
  server.once("close", stopDailyCredits);
});
