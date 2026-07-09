import { test, expect } from '@playwright/test';
import { connectToMode, loginOnPwa, getContractorUser } from '../helpers/auth';
import { WO2_ID } from '../helpers/test-data';

test('mobile PWA: Accept button only appears for pending work orders (assignment_status is read correctly)', async ({ page }) => {
  // Root cause fixed: WorkOrderDetail.tsx read `w.status` (a field the backend
  // never returns -- the column is `assignment_status`), so the local `st`
  // variable was always '' and the Accept button showed for every work order
  // regardless of its real state. WO2 (alpha.tech1) is seeded 'in_progress',
  // so Accept must NOT appear, and the status chip must show the real status,
  // not the 'open' fallback.
  await connectToMode(page, 'Contractor Portal');
  await loginOnPwa(page, 'alpha.tech1@alpha-field.example.com', getContractorUser().password);
  await page.goto(`/wo/${WO2_ID}`);

  await expect(page.getByText('in progress', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByText('open', { exact: true })).toHaveCount(0);
});
