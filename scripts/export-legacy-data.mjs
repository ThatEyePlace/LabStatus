import { writeFile } from "node:fs/promises";

const siteUrl = process.env.LEGACY_SITE_URL;
const pin = process.env.LEGACY_PIN;

if (!siteUrl || !pin) {
  throw new Error("LEGACY_SITE_URL and LEGACY_PIN are required");
}

const login = await fetch(new URL("/api/login", siteUrl), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ pin }),
});

if (!login.ok) {
  throw new Error(`Legacy login failed (${login.status})`);
}

const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
if (!cookie) {
  throw new Error("Legacy login did not return an authentication cookie");
}

const response = await fetch(new URL("/api/jobs", siteUrl), {
  headers: { cookie },
});

if (!response.ok) {
  throw new Error(`Legacy record export failed (${response.status})`);
}

const jobs = await response.json();
if (!Array.isArray(jobs)) {
  throw new Error("Legacy record export returned an unexpected response");
}

const sqlValue = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
};

const statements = ["BEGIN TRANSACTION;"];
for (const job of jobs) {
  statements.push(
    `INSERT OR IGNORE INTO jobs (id,first_initial,last_name,job_id,lab,status,created_at,updated_at,archived) VALUES (${[
      job.id,
      job.firstInitial,
      job.lastName,
      job.jobId,
      job.lab,
      job.status,
      job.createdAt,
      job.updatedAt,
      Number(job.archived ?? 0),
    ].map(sqlValue).join(",")});`,
  );

  for (const event of job.events ?? []) {
    statements.push(
      `INSERT OR IGNORE INTO job_events (id,job_id,status,created_at) VALUES (${[
        event.id,
        job.id,
        event.status,
        event.createdAt,
      ].map(sqlValue).join(",")});`,
    );
  }
}
statements.push("COMMIT;");

await writeFile("legacy-migration.sql", `${statements.join("\n")}\n`, "utf8");
console.log(`Prepared ${jobs.length} live LabStatus records for migration.`);
