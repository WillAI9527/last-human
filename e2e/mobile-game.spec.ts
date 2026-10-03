import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const SHOTS = "/opt/cursor/artifacts/screenshots";

async function expectTappable(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const result = await locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const height = viewport?.height ?? window.innerHeight;
    const width = viewport?.width ?? window.innerWidth;
    const cx = Math.min(width - 1, Math.max(0, rect.left + rect.width / 2));
    const cy = Math.min(top + height - 1, Math.max(top, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(cx, cy);
    const shell = document.querySelector(".lh-game-shell");
    const shellStyle = shell ? getComputedStyle(shell) : null;
    return {
      fullyInside:
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= top - 1 &&
        rect.left >= left - 1 &&
        rect.bottom <= top + height + 1 &&
        rect.right <= left + width + 1,
      hit: !!hit && (hit === el || el.contains(hit)),
      shellHeight: shellStyle?.height ?? "",
      shellPosition: shellStyle?.position ?? "",
      viewportHeight: height,
      bottom: rect.bottom,
      right: rect.right,
      hitTag: hit?.tagName ?? "",
      hitTestId: hit?.getAttribute("data-testid") ?? "",
    };
  });
  expect(result.fullyInside, JSON.stringify(result)).toBe(true);
  expect(result.hit, JSON.stringify(result)).toBe(true);
  expect(result.shellPosition).toBe("fixed");
  const shellPx = Number.parseFloat(result.shellHeight);
  expect(Math.abs(shellPx - result.viewportHeight)).toBeLessThan(2);
  return result;
}

async function castVote(page: Page, scene: "vote" | "badge", seat: number) {
  await page.goto(`/zh/preview/roundtable?scene=${scene}`);
  const names = ["伊尔莎局长", "菲利克斯", "克拉拉", "玛尔塔", "老汉斯", "维克多医生"];
  await expect(page.getByText(`3号 · 克拉拉`).first()).toBeVisible();
  await page.getByTestId(`seat-${seat}`).tap();
  await expect(page.locator(".lh-vote-progress")).toHaveCount(0);
  const confirm = page.getByTestId("action-confirm");
  await expect(confirm).toHaveText(`确认投 ${seat + 1}号 · ${names[seat]}`);
  const paint = await confirm.evaluate((el) => {
    const style = getComputedStyle(el);
    const bar = el.closest(".lh-vote-bar");
    const barStyle = bar ? getComputedStyle(bar) : null;
    return {
      background: style.backgroundColor,
      position: barStyle?.position ?? "",
      paddingBottom: barStyle?.paddingBottom ?? "",
    };
  });
  expect(paint.background).toBe("rgb(179, 38, 43)");
  expect(paint.position).toBe("absolute");
  expect(paint.paddingBottom.endsWith("px")).toBe(true);
  const selected = page.getByTestId(`seat-${seat}`).locator(".wc-player-card");
  const other = page.getByTestId(`seat-${seat === 0 ? 1 : 0}`).locator(".wc-player-card");
  await expect(selected).toHaveClass(/lh-seat-selected/);
  const frame = await selected.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(frame).toContain("rgb(242, 237, 228)");
  await expect.poll(async () => other.evaluate((el) => Number.parseFloat(getComputedStyle(el).opacity))).toBeLessThan(0.5);
  await expect(confirm).toBeEnabled();
  await expectTappable(confirm);
  const width = page.viewportSize()?.width ?? 0;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/mobile-${scene}-confirm-${width}.png`, fullPage: false });
  if (width === 390 && scene === "vote") {
    await page.screenshot({ path: `${SHOTS}/mobile-vote-bar-390.png`, fullPage: false });
  }
  await confirm.tap();
  await expect(page.getByTestId("game-shell")).toHaveAttribute("data-cast-seat", String(seat));
  await expect(page.locator(".lh-action-receipt")).toContainText(`✓ 已投 ${seat + 1}号`);
}

test("casts a day vote by tapping confirm", async ({ page }) => {
  await castVote(page, "vote", 0);
});

test("casts a sheriff vote by tapping confirm", async ({ page }) => {
  await castVote(page, "badge", 1);
});

test("keeps send visible for a long message with the keyboard open", async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.visualViewport;
    if (!real) return;
    const listeners = new Set<(event: Event) => void>();
    const proxy = {
      get height() {
        const inset = Number((window as Window & { __lhKeyboardInset?: number }).__lhKeyboardInset || 0);
        return Math.max(220, real.height - inset);
      },
      get width() { return real.width; },
      get offsetTop() { return 0; },
      get offsetLeft() { return real.offsetLeft; },
      get pageTop() { return real.pageTop; },
      get pageLeft() { return real.pageLeft; },
      get scale() { return real.scale; },
      addEventListener(_type: string, fn: EventListener) {
        listeners.add(fn as (event: Event) => void);
        real.addEventListener("resize", fn);
      },
      removeEventListener(_type: string, fn: EventListener) {
        listeners.delete(fn as (event: Event) => void);
        real.removeEventListener("resize", fn);
      },
    };
    (window as Window & { __lhDispatchViewport?: () => void }).__lhDispatchViewport = () => {
      const event = new Event("resize");
      listeners.forEach((fn) => fn(event));
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => proxy });
  });

  await page.goto("/zh/preview/roundtable?scene=keyboard");
  const editor = page.locator(".ProseMirror");
  await editor.waitFor();
  await page.evaluate(() => {
    (window as Window & { __lhKeyboardInset?: number }).__lhKeyboardInset = 320;
    (window as Window & { __lhDispatchViewport?: () => void }).__lhDispatchViewport?.();
  });

  await editor.tap();
  const longMessage = "W".repeat(240);
  await page.keyboard.insertText(longMessage);
  const send = page.getByTestId("speech-send");
  await expect(send).toBeEnabled();

  const layout = await page.evaluate(() => {
    const input = document.querySelector(".wc-composer-row .wc-input-box");
    const button = document.querySelector("[data-testid='speech-send']");
    if (!input || !button) return null;
    const inputStyle = getComputedStyle(input);
    const buttonStyle = getComputedStyle(button);
    return {
      inputFlexGrow: inputStyle.flexGrow,
      inputMinWidth: inputStyle.minWidth,
      sendFlexShrink: buttonStyle.flexShrink,
    };
  });
  expect(layout).not.toBeNull();
  expect(Number(layout?.inputFlexGrow)).toBeGreaterThan(0);
  expect(layout?.inputMinWidth).toBe("0px");
  expect(layout?.sendFlexShrink).toBe("0");
  await expectTappable(send);
  await expect(page.locator(".lh-roundtable--strip")).toBeVisible();
  await expect(page.locator(".wc-history-item")).toHaveCount(2);

  const width = page.viewportSize()?.width ?? 0;
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/mobile-send-${width}.png`, fullPage: false });
  if (width === 390) {
    await page.screenshot({ path: `${SHOTS}/mobile-keyboard-390.png`, fullPage: false });
  }

  await send.tap();
  await expect.poll(async () => editor.innerText()).toMatch(/^\s*$/);
});

test("night cards and the centre line do not name a role", async ({ page }) => {
  await page.goto("/zh/preview/roundtable?scene=night");
  await expect(page.getByText("夜色中有人在行动…").first()).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("预言家请睁眼");
  expect(body).not.toContain("女巫正在决定");
  expect(body).not.toContain("狼人请睁眼");
  expect(body).toContain("夜色中有人在行动…");
  const phase = await page.locator(".lh-phase-bar").innerText();
  expect(phase).not.toContain("轮到你了：轮到你");
  expect((phase.match(/夜晚/g) ?? []).length).toBe(1);
  if ((page.viewportSize()?.width ?? 0) === 390) {
    await mkdir(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/mobile-night-public-390.png`, fullPage: false });
  }
});

test("shows the full model id in the seat detail card", async ({ page }) => {
  await page.goto("/zh/preview/roundtable?scene=day");
  if ((page.viewportSize()?.width ?? 0) === 390) {
    await mkdir(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/mobile-day-speech-390.png`, fullPage: false });
  }
  await page.getByTestId("seat-0").tap();
  const model = page.getByTestId("seat-model-id");
  await expect(model).toHaveText("deepseek/deepseek-v3.2");
  await expect(page.locator(".lh-model-badge").first()).toHaveAttribute("aria-label", "deepseek/deepseek-v3.2");
  if ((page.viewportSize()?.width ?? 0) === 390) {
    await mkdir(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/mobile-seat-model.png`, fullPage: false });
  }
});
