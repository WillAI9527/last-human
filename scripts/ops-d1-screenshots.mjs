import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.OPS_BASE_URL || "http://127.0.0.1:3000";
const out = path.resolve("docs/screenshots/ops-d1");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function shot(page, name) {
  await page.screenshot({ path: path.join(out, name), fullPage: true });
  console.log("wrote", name);
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "zh-CN" });
await desktop.goto(`${base}/zh?view=empty`, { waitUntil: "networkidle" });
await desktop.getByRole("heading", { name: "添加你的第一个账号" }).waitFor();
await shot(desktop, "01-account-1440.png");

await desktop.getByLabel("昵称").fill("小满");
await desktop.getByLabel("主页链接").fill("https://example.com/xiaoman");
await desktop.getByRole("button", { name: "下一步" }).click();
await desktop.getByText("这个账号现在最想达成什么？").waitFor();
await shot(desktop, "02-questions-1440.png");

await desktop.getByRole("button", { name: "涨粉" }).click();
await desktop.getByRole("button", { name: "下一步" }).first().click();
await desktop.getByRole("button", { name: "跳过" }).first().click();
await desktop.getByRole("button", { name: "跳过" }).first().click();
await desktop.getByRole("button", { name: "下一步" }).click();
await desktop.getByRole("button", { name: "生成分析" }).click();
await desktop.getByText("无法读取，请上传截图").first().waitFor();
await shot(desktop, "03-analysis-1440.png");
await desktop.getByRole("button", { name: "保存到账号" }).click();
await desktop.getByRole("button", { name: "下一步" }).click();

await desktop.getByLabel("竞品名称").fill("对照号");
await desktop.getByLabel("竞品链接").fill("https://example.com/other");
await desktop.getByRole("button", { name: "生成对比" }).click();
await desktop.getByText("定位").waitFor();
await shot(desktop, "04-competitor-1440.png");
await desktop.getByRole("button", { name: "下一步" }).click();

await desktop.getByRole("button", { name: "生成文案" }).click();
await desktop.getByLabel("正文").waitFor();
await shot(desktop, "05-copy-1440.png");
await desktop.getByRole("button", { name: "发布", exact: true }).click();
await desktop.getByRole("dialog").waitFor();
await desktop.getByRole("button", { name: "Close" }).click().catch(() => {});
await shot(desktop, "06-publish-dialog-1440.png");
await desktop.getByRole("button", { name: "确认发布" }).click();
await desktop.getByText("这条内容已标记为已发布").waitFor();
await desktop.getByRole("button", { name: "Close" }).click().catch(() => {});
await shot(desktop, "07-published-1440.png");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
await mobile.goto(`${base}/zh?view=empty`, { waitUntil: "networkidle" });
await mobile.getByRole("heading", { name: "添加你的第一个账号" }).waitFor();
await shot(mobile, "01-account-390.png");
await mobile.close();
await desktop.close();
await browser.close();
