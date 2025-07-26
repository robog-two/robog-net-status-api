import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import Handlebars from "handlebars";
import { runChecks, UpReport } from "./checks.ts";
import servicesConf from "./services.conf.js";

const app = new Hono();

// Perform health checks every 5m

Deno.cron("Health Checks", "*/5 * * * *", async () => await runChecks());

// Helper functions for rendering templates ===================================
const hbsCache = new Map<string, HandlebarsTemplateDelegate>();
async function hbs(path: string, context: object): Promise<string> {
  path = await Deno.realPath(path);
  if (hbsCache.has(path)) {
    return (hbsCache.get(path)!)(context);
  } else {
    const compiled = Handlebars.compile(await Deno.readTextFile(path));
    hbsCache.set(path, compiled);
    return compiled(context);
  }
}

const styleTag = `<style>${Deno.readTextFileSync("static/styles.css")}</style>`;
async function renderTemplate(template: string, context: object) {
  return await hbs("views/base.hbs", {
    content: new Handlebars.SafeString(await hbs(`views/${template}`, context)),
    styles: new Handlebars.SafeString(styleTag),
  });
}

// Routes =====================================================================

function toUpState(stateBool: boolean | undefined): string {
  if (stateBool === true) return "up";
  if (stateBool === false) return "down";
  return "unknown";
}
app.get("/", async (c) => {
  const kv = await Deno.openKv();

  const services = await Promise.all(servicesConf.services.map(
    // Retrieve all db keys in parallel
    (service) =>
      (async () => ({
        id: service.id,
        online: await kv.get<boolean>(["is-online-now", service.id]) ?? false,
        timeline: (await kv.get<Array<UpReport>>(["timeline", service.id]))
          ?.value ??
          [],
      }))(), // IIFE to convert above code into a promise
  ));

  const servicesDisplay = [];
  for (const service of services) {
    const name = servicesConf.services.find((it) => it.id == service.id)?.name;
    let timeLengths: Array<{ upState: string; percent: number }> = [];
    if (service.timeline.length < 2) {
      timeLengths = [{
        percent: 100,
        upState: toUpState(service.timeline[0]?.isUp),
      }];
    } else {
      const oneDay = 86400000; // 24h in millis
      const now = new Date();
      const yesterday = new Date(now.valueOf() - oneDay);

      const startingState = service.timeline.findLast((it) =>
        it.time < yesterday
      )?.isUp ?? undefined;

      const reportsInWindow: Array<
        UpReport | { isUp: undefined; time: Date }
      > = [
        {
          isUp: startingState,
          time: yesterday,
        },
        ...service.timeline.filter((it) => it.time >= yesterday),
        {
          isUp: service.timeline[-1]?.isUp,
          time: now,
        },
      ];

      for (let i = 0; i < reportsInWindow.length - 1; i++) {
        const report = reportsInWindow[i];
        const nextReport = reportsInWindow[i + 1];

        timeLengths.push({
          upState: toUpState(report.isUp),
          percent: ((nextReport.time.valueOf() - report.time.valueOf()) /
            86400000) * 100,
        });
      }
    }
    servicesDisplay.push({
      name,
      timeLengths,
    });
  }

  const html = await renderTemplate("index.hbs", {
    percentUpNow: Math.round(
      (
        services.filter((it) => it.online).length / services.length // proportion that is-online-now
      ) * 100,
    ),
    services: servicesDisplay,
  });
  return c.html(html);
});

app.get("*", serveStatic({ root: "./static/" }));

Deno.serve(app.fetch);
