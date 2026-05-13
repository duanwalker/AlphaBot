export const RUN_SCHEDULE_MINUTES = [555, 780, 970]; // 9:15, 13:00, 16:10 ET

function getEtParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function getEtOffsetMinutes(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });

  const tzPart = formatter.formatToParts(date).find((part) => part.type === "timeZoneName");
  const value = tzPart?.value || "GMT-5";
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);

  if (!match) {
    return -300;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function etDateToUtcMs(year, month, day, hour, minute) {
  const sample = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getEtOffsetMinutes(sample);
  return Date.UTC(year, month - 1, day, hour, minute) - offset * 60 * 1000;
}

export function getMostRecentScheduledRunUtc(now = new Date()) {
  const et = getEtParts(now);
  const currentMinutes = et.hour * 60 + et.minute;

  let runDay = { year: et.year, month: et.month, day: et.day };
  let runMinutes = RUN_SCHEDULE_MINUTES[0];

  for (const schedule of RUN_SCHEDULE_MINUTES) {
    if (schedule <= currentMinutes) {
      runMinutes = schedule;
    }
  }

  if (currentMinutes < RUN_SCHEDULE_MINUTES[0]) {
    const previous = new Date(Date.UTC(et.year, et.month - 1, et.day - 1));
    runDay = {
      year: previous.getUTCFullYear(),
      month: previous.getUTCMonth() + 1,
      day: previous.getUTCDate(),
    };
    runMinutes = RUN_SCHEDULE_MINUTES[RUN_SCHEDULE_MINUTES.length - 1];
  }

  const hours = Math.floor(runMinutes / 60);
  const minutes = runMinutes % 60;

  return etDateToUtcMs(runDay.year, runDay.month, runDay.day, hours, minutes);
}

export function isSnapshotStale(snapshot) {
  if (!snapshot?.timestamp) {
    return true;
  }

  const snapshotMs = new Date(snapshot.timestamp).getTime();
  if (Number.isNaN(snapshotMs)) {
    return true;
  }

  return snapshotMs < getMostRecentScheduledRunUtc();
}

export function getNextScheduledRunEt(now = new Date()) {
  const et = getEtParts(now);
  const currentMinutes = et.hour * 60 + et.minute;

  for (const schedule of RUN_SCHEDULE_MINUTES) {
    if (schedule > currentMinutes) {
      return schedule;
    }
  }

  return RUN_SCHEDULE_MINUTES[0];
}