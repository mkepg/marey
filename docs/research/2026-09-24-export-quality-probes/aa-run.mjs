import { chromium } from "playwright";
const variants = {
  swiftshader: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle"] },
  headlessDefault: { args: [] },
  headedGpu: { args: [], headless: false },
};
for (const [name, launch] of Object.entries(variants)) {
  const browser = await chromium.launch({ headless: true, ...launch });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.goto("http://localhost:5199/");
  const res = await page.evaluate(async () => {
    const m = await import("/.visual-check/probe/aa.ts");
    return {
      "1x": await m.run({ antialias: true, extractResolution: 1 }),
      "2x-down": await m.run({ antialias: true, extractResolution: 2 }),
    };
  });
  console.log(name, JSON.stringify(res));
  await browser.close();
}
