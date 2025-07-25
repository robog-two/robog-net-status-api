import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import Handlebars from "handlebars";

const app = new Hono();

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

app.get("/", async (c) => {
  const html = await renderTemplate("index.hbs", {
    percentUpNow: 100,
  });
  return c.html(html);
});

app.get("*", serveStatic({ root: "./static/" }));

Deno.serve(app.fetch);
