import servicesConf from "./services.conf.js";

export type UpReport = {
  time: Date;
  isUp: boolean;
};

export async function runChecks(): Promise<void> {
  const kv = await Deno.openKv();

  console.log("Running checks", (new Date()).getMinutes());

  const promises: Array<Promise<[boolean, string]>> = [];
  for (const service of servicesConf.services) {
    for (const check of service.checks) {
      if (check.type === "http") {
        promises.push((async () => { // IIFE makes this code a self-contained Promise
          let success: boolean = false;
          try {
            success = (await fetch(check.endpoint)).ok;
          } catch (_) { /* failed check, do nothing */ }
          return [success, service.id];
        })());
      }
    }
  }

  const rawResults = await Promise.all(promises);
  const failures = new Map<string, boolean>();
  for (const result of rawResults) {
    if (!result[0]) {
      failures.set(result[1], false);
    }
  }

  for (const service of servicesConf.services) {
    const isUp = failures.get(service.id) ?? true;
    kv.set(["is-online-now", service.id], isUp);

    let res = { ok: false };

    while (!res.ok) {
      const timelineRes = await kv.get<Array<UpReport>>([
        "timeline",
        service.id,
      ]);
      const timeline: Array<UpReport> = timelineRes.value ?? [];

      if (timeline.length == 0 || timeline[-1]?.isUp != isUp) {
        timeline.push({
          time: new Date(),
          isUp,
        } as UpReport);
      }

      // update times in the database
      res = await kv.atomic()
        .check(timelineRes)
        .set(["timeline", service.id], timeline)
        .commit();
    }
  }
}
