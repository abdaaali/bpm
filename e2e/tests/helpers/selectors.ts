import type { Locator, Page } from '@playwright/test';

/**
 * Open an MUI `<Select>` by its trigger locator and pick the option whose
 * `data-value` matches `value`. MUI renders the option list in a portal, and
 * its backdrop intercepts the very next click unless explicitly closed —
 * pressing Escape after selecting is more reliable than waiting on the
 * close animation.
 */
export async function selectMuiDropdownByValue(page: Page, trigger: Locator, value: string) {
  await trigger.click();
  await page.locator(`li[data-value="${value}"]`).click();
  await page.keyboard.press('Escape');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
}
