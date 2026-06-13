import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const resourcesPath = new URL("resources/resources.json", root);
const availabilityPath = new URL("reports/availability.json", root);
const readmePath = new URL("README.md", root);
const timeoutMs = Number(process.env.CHECK_TIMEOUT_MS ?? 15000);
const concurrency = Number(process.env.CHECK_CONCURRENCY ?? 4);
const maxAttempts = Number(process.env.CHECK_MAX_ATTEMPTS ?? 2);
const timeZone = process.env.CHECK_TIME_ZONE ?? "Asia/Shanghai";
const userAgent =
  "awesome-zhuiju-free-monitor/1.0 (+https://github.com/laoma2053/awesome-zhuiju-free)";

function statusFromResponse(status) {
  if (status >= 200 && status < 400) {
    return "reachable";
  }
  if ([401, 403, 405, 429].includes(status)) {
    return "restricted";
  }
  return "unreachable";
}

function displayStatus(status) {
  return {
    reachable: "🟢&#8288;可&#8288;访问",
    restricted: "🟡&#8288;访问&#8288;受限",
    unreachable: "🔴&#8288;无法&#8288;访问",
    unknown: "⚪&#8288;未&#8288;检测"
  }[status];
}

function displayDate(date) {
  return date.replaceAll("-", "&#8209;");
}

function dateInTimeZone(date, zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function checkResource(resource) {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(resource.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          range: "bytes=0-1023"
        }
      });

      await response.body?.cancel();
      const status = statusFromResponse(response.status);
      if (status === "unreachable" && response.status >= 500 && attempt < maxAttempts) {
        continue;
      }

      return {
        resource_id: resource.id,
        url: resource.url,
        status,
        http_status: response.status,
        final_url: response.url,
        response_ms: Date.now() - startedAt,
        checked_at: checkedAt,
        attempts: attempt,
        error: null
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    resource_id: resource.id,
    url: resource.url,
    status: "unreachable",
    http_status: null,
    final_url: null,
    response_ms: Date.now() - startedAt,
    checked_at: checkedAt,
    attempts: maxAttempts,
    error: lastError
  };
}

async function mapConcurrent(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await callback(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function replaceMarker(readme, type, resourceId, value) {
  const start = `<!-- ${type}:${resourceId} -->`;
  const end = `<!-- /${type}:${resourceId} -->`;
  const marker = `${start}${value}${end}`;
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "s"
  );

  if (!pattern.test(readme)) {
    throw new Error(`README marker missing: ${type}:${resourceId}`);
  }
  return readme.replace(pattern, marker);
}

const resourcesData = JSON.parse(await readFile(resourcesPath, "utf8"));
const featuredResources = resourcesData.resources.filter((resource) => resource.featured);
const results = await mapConcurrent(featuredResources, concurrency, checkResource);
const generatedAt = new Date().toISOString();
const generatedDate = dateInTimeZone(new Date(generatedAt), timeZone);

const availability = {
  version: 1,
  generated_at: generatedAt,
  checker: {
    environment: process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local",
    timeout_ms: timeoutMs,
    concurrency,
    max_attempts: maxAttempts,
    time_zone: timeZone
  },
  results
};

let readme = await readFile(readmePath, "utf8");
for (const result of results) {
  readme = replaceMarker(readme, "availability", result.resource_id, displayStatus(result.status));
  readme = replaceMarker(
    readme,
    "availability-date",
    result.resource_id,
    displayDate(generatedDate)
  );
}

await writeFile(availabilityPath, `${JSON.stringify(availability, null, 2)}\n`, "utf8");
await writeFile(readmePath, readme, "utf8");

for (const result of results) {
  const detail = result.http_status ?? result.error ?? "unknown";
  console.log(`${displayStatus(result.status).replaceAll(/&#\d+;/g, "")} ${result.resource_id}: ${detail}`);
}
