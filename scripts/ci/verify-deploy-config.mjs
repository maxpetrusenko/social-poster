import { readFileSync } from "node:fs";

const workflowPath = ".github/workflows/fast-coolify-deploy.yml";
const deployScriptPath = "scripts/ci/coolify-image-deploy.sh";
const workflow = readFileSync(workflowPath, "utf8");
const deployScript = readFileSync(deployScriptPath, "utf8");

const failures = [];

function requireIncludes(sourceName, source, needle, reason) {
  if (!source.includes(needle)) {
    failures.push(`${sourceName}: missing ${JSON.stringify(needle)} (${reason})`);
  }
}

function requireExcludes(sourceName, source, needle, reason) {
  if (source.includes(needle)) {
    failures.push(`${sourceName}: found forbidden ${JSON.stringify(needle)} (${reason})`);
  }
}

function requireMatches(sourceName, source, pattern, reason) {
  if (!pattern.test(source)) {
    failures.push(`${sourceName}: missing pattern ${pattern} (${reason})`);
  }
}

function requireLineLimit(sourceName, source, maxLines) {
  const lines = source.split("\n").length;
  if (lines > maxLines) {
    failures.push(`${sourceName}: ${lines} lines exceeds ${maxLines}`);
  }
}

requireLineLimit(workflowPath, workflow, 500);
requireLineLimit(deployScriptPath, deployScript, 500);

for (const job of ["gate:", "build:", "deploy:", "canary:", "rollback:", "report:"]) {
  requireIncludes(workflowPath, workflow, `  ${job}`, `required deploy pipeline job ${job}`);
}

requireIncludes(workflowPath, workflow, "permissions:\n  contents: read", "least-privilege workflow default");
requireMatches(
  workflowPath,
  workflow,
  /build:[\s\S]*permissions:[\s\S]*packages: write/,
  "only the image build job should get package write access",
);
requireIncludes(workflowPath, workflow, "environment:\n      name: production", "GitHub production environment marker");
requireIncludes(
  workflowPath,
  workflow,
  "PRODUCTION_URL: https://smmagent.app",
  "public canaries and deploy reports must use the canonical app domain",
);
requireExcludes(
  workflowPath,
  workflow,
  "PRODUCTION_URL: https://smmagent.com",
  "the unavailable .com hostname must not be the production canary target",
);
requireExcludes(
  workflowPath,
  workflow,
  "PRODUCTION_URL: https://social.maxpetrusenko.com",
  "legacy callback host must not remain the production canary target",
);
requireIncludes(workflowPath, workflow, "READ_PREVIOUS_IMAGE_TAG: \"true\"", "deploy captures previous image for rollback");
requireIncludes(workflowPath, workflow, "BACKUP_SQLITE_BEFORE_DEPLOY: \"true\"", "deploy backs up SQLite before image change");
requireIncludes(workflowPath, workflow, "run: bash scripts/ci/coolify-image-deploy.sh", "deploy and rollback use shared Coolify helper");
requireIncludes(workflowPath, workflow, "Public Production Canary", "public post-deploy canary is required");
requireIncludes(workflowPath, workflow, "schedule drift is", "public canary must reject scheduler drift");
requireIncludes(workflowPath, workflow, "needs.canary.result == 'failure'", "rollback must be tied to canary failure");
requireIncludes(workflowPath, workflow, "previous_image_tag != needs.deploy.outputs.image_tag", "rollback must not redeploy the same image");
requireIncludes(workflowPath, workflow, "actions/upload-artifact@v4", "deploy report artifact must be uploaded");
requireIncludes(workflowPath, workflow, "retention-days: 30", "deploy reports need a useful retention window");

requireIncludes(deployScriptPath, deployScript, "COOLIFY_SSH_KNOWN_HOSTS", "optional pinned SSH host key support");
requireIncludes(deployScriptPath, deployScript, "READ_PREVIOUS_IMAGE_TAG", "previous image capture switch");
requireIncludes(deployScriptPath, deployScript, "skipped_same_image", "same-image deploys should be health-checked no-ops");
requireIncludes(deployScriptPath, deployScript, "FORCE_REDEPLOY_SAME_IMAGE", "same-image deploy bypass switch");
requireIncludes(deployScriptPath, deployScript, "VERIFY_PUBLIC", "rollback can verify public health");
requireIncludes(deployScriptPath, deployScript, "backup_sqlite_database", "SQLite backup helper is required");
requireIncludes(deployScriptPath, deployScript, "assert_private_health", "same-image no-ops still need private health verification");
requireIncludes(deployScriptPath, deployScript, "better-sqlite3", "SQLite backup must use the database backup API");
requireIncludes(deployScriptPath, deployScript, "/data/backups", "SQLite backups must land on the persistent data volume");
requireIncludes(deployScriptPath, deployScript, "docker_registry_image_tag", "Coolify image tag patch");
requireIncludes(deployScriptPath, deployScript, "curl --connect-timeout", "curl calls must have connect timeouts");
requireIncludes(deployScriptPath, deployScript, "--max-time", "curl calls must have max timeouts");
requireIncludes(deployScriptPath, deployScript, "ServerAliveInterval=15", "SSH keepalive guard");
requireIncludes(deployScriptPath, deployScript, "ServerAliveCountMax=2", "SSH dead-connection guard");
requireIncludes(deployScriptPath, deployScript, "http://127.0.0.1:8000/api/v1", "Coolify API must stay on private SSH path");
requireIncludes(deployScriptPath, deployScript, "drift != 0", "public app health must reject scheduler drift");

if (failures.length > 0) {
  console.error("Deploy workflow regression check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Deploy workflow regression check passed.");
