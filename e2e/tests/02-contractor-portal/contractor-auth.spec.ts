import { test, expect } from '@playwright/test';
import { getContractorUser, loginAsContractor } from '../helpers/auth';
import { trackErrors } from '../helpers/api';

test('contractor portal: unauthenticated visitor is redirected to login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('Contractor Portal')).toBeVisible();
  await expect(page.getByLabel('Email Address')).toBeVisible();
});

test('contractor portal: login works with valid credentials', async ({ page }) => {
  const errors = trackErrors(page);
  const user = getContractorUser();
  await loginAsContractor(page, user);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
});

test('contractor portal: invalid login fails gracefully', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill('alpha.supervisor@alpha-field.example.com');
  await page.getByLabel('Password').fill('wrong-password-123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByText(/Invalid credentials|Invalid email or password/i)).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/); // stayed on login, no crash
});
