const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatWatTimestamp(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  const wat = new Date(Date.parse(value) + 60 * 60 * 1000);
  const day = String(wat.getUTCDate()).padStart(2, "0");
  const month = MONTHS[wat.getUTCMonth()];
  const year = wat.getUTCFullYear();
  const hour = String(wat.getUTCHours()).padStart(2, "0");
  const minute = String(wat.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hour}:${minute} WAT`;
}

function formatDuration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Not recorded";
  const seconds = Math.max(0, Number(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function roleLabel(value) {
  if (value === "rea_admin") return "REA Administrator";
  if (value === "consultant_admin") return "Consultant Admin";
  if (value === "field_officer") return "Field Officer";
  return String(value || "User").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function deviceLabel(row) {
  const parts = [row.latestDevice, row.latestBrowser, row.latestOs].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Not recorded";
}

export function isSessionActivityTableQuestion(question) {
  const text = String(question || "").toLowerCase();
  const asksForUsers = /\b(?:all|every)\b[\s\S]*\busers?\b|\bevery user's\b/.test(text);
  const asksForActivity = /\b(?:latest login|last login|last activity|session duration|device|inactivity)\b/.test(text);
  return asksForUsers && asksForActivity;
}

export function buildSessionActivityAnswer(question, databaseContext) {
  if (!isSessionActivityTableQuestion(question)) return null;
  const users = Array.isArray(databaseContext?.sessionActivity?.perUser)
    ? [...databaseContext.sessionActivity.perUser]
    : [];
  users.sort((left, right) => {
    const activityOrder = String(right.lastAuthenticatedActivity || right.latestLogin || "")
      .localeCompare(String(left.lastAuthenticatedActivity || left.latestLogin || ""));
    return activityOrder || String(left.name || "").localeCompare(String(right.name || ""));
  });

  const recorded = users.filter((user) => user.latestLogin).length;
  const missing = users.length - recorded;
  const recordedVerb = recorded === 1 ? "has" : "have";
  const missingSummary = missing
    ? ` The remaining ${missing} ${missing === 1 ? "user has" : "users have"} no recorded login timestamp.`
    : " Every registered user has a recorded login timestamp.";

  return {
    answer: users.length
      ? `${recorded} of ${users.length} registered users ${recordedVerb} recorded login history.${missingSummary} The full reference is shown below.`
      : "No registered users are available in the current Veritas production snapshot.",
    table: {
      caption: "User session activity",
      columns: [
        "User",
        "Role / Consultant",
        "Latest login (WAT)",
        "Last activity (WAT)",
        "Observed duration",
        "Device",
        "Inactivity",
      ],
      rows: users.map((user) => [
        user.name || "Unnamed user",
        `${roleLabel(user.role)} — ${user.consultantFirm || "REA"}`,
        formatWatTimestamp(user.latestLogin),
        formatWatTimestamp(user.lastAuthenticatedActivity),
        formatDuration(user.latestObservedDurationSeconds),
        deviceLabel(user),
        user.inactivityClassification || "Not classified",
      ]),
    },
    note: "Session duration is the observed span from login to the latest authenticated activity or recorded session end; it does not prove continuous work.",
  };
}
