import { test, expect } from '@playwright/test'

/**
 * E2E tests for tooltip positioning
 * These tests verify that tooltips appear in the correct location on both desktop and mobile
 * 
 * CRITICAL: These tests prevent regressions where tooltips appear:
 * - At the tap/click location instead of above the element
 * - Below the element instead of above
 * - In the middle of the screen
 */

test.describe('Tooltip Positioning', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a page with tooltips (adjust URL as needed)
    await page.goto('/')
    
    // Wait for job cards to load
    await page.waitForSelector('[data-testid="job-card"]', { timeout: 10000 })
  })

  test('desktop: tooltip appears above element on hover', async ({ page }) => {
    // Find a pill with a tooltip
    const valuePill = page.locator('text=/\\d+\\/\\d+ values/').first()
    const pillBox = await valuePill.boundingBox()
    
    if (!pillBox) throw new Error('Pill not found')
    
    // Hover over the pill
    await valuePill.hover()
    
    // Wait for tooltip to appear
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    const tooltip = page.locator('.tippy-box').first()
    const tooltipBox = await tooltip.boundingBox()
    
    if (!tooltipBox) throw new Error('Tooltip not found')
    
    // Tooltip should be ABOVE the pill (tooltip bottom < pill top)
    expect(tooltipBox.y + tooltipBox.height).toBeLessThan(pillBox.y)
    
    // Tooltip should be horizontally aligned with pill (roughly centered)
    const pillCenter = pillBox.x + pillBox.width / 2
    const tooltipCenter = tooltipBox.x + tooltipBox.width / 2
    expect(Math.abs(pillCenter - tooltipCenter)).toBeLessThan(50) // Within 50px
  })

  test('mobile: tooltip appears above element on tap', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    const valuePill = page.locator('text=/\\d+\\/\\d+ values/').first()
    const pillBox = await valuePill.boundingBox()
    
    if (!pillBox) throw new Error('Pill not found')
    
    // Tap the pill
    await valuePill.tap()
    
    // Wait for tooltip
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    const tooltip = page.locator('.tippy-box').first()
    const tooltipBox = await tooltip.boundingBox()
    
    if (!tooltipBox) throw new Error('Tooltip not found')
    
    // Tooltip should be ABOVE the pill
    expect(tooltipBox.y + tooltipBox.height).toBeLessThan(pillBox.y)
    
    // Tooltip should NOT be at tap location (middle of screen)
    const screenCenter = 667 / 2
    expect(Math.abs(tooltipBox.y - screenCenter)).toBeGreaterThan(100)
  })

  test('mobile: tooltip dismisses on tap outside', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    const valuePill = page.locator('text=/\\d+\\/\\d+ values/').first()
    await valuePill.tap()
    
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    // Tap outside
    await page.tap('body', { position: { x: 10, y: 10 } })
    
    // Tooltip should disappear
    await expect(page.locator('.tippy-box')).toBeHidden()
  })

  test('mobile: tooltip dismisses on tap tooltip itself', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    const valuePill = page.locator('text=/\\d+\\/\\d+ values/').first()
    await valuePill.tap()
    
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    // Tap the tooltip
    await page.locator('.tippy-box').first().tap()
    
    // Tooltip should disappear
    await expect(page.locator('.tippy-box')).toBeHidden()
  })

  test('mobile: tooltip dismisses on ESC key', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    const valuePill = page.locator('text=/\\d+\\/\\d+ values/').first()
    await valuePill.tap()
    
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    // Press ESC
    await page.keyboard.press('Escape')
    
    // Tooltip should disappear
    await expect(page.locator('.tippy-box')).toBeHidden()
  })

  test('multiple tooltips do not interfere with each other', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Open first tooltip
    const valuePill = page.locator('text=/\\d+\\/\\d+ values/').first()
    const valuePillBox = await valuePill.boundingBox()
    await valuePill.tap()
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    const firstTooltipBox = await page.locator('.tippy-box').first().boundingBox()
    
    if (!valuePillBox || !firstTooltipBox) throw new Error('Elements not found')
    
    // First tooltip should be above its pill
    expect(firstTooltipBox.y + firstTooltipBox.height).toBeLessThan(valuePillBox.y)
    
    // Close first tooltip
    await page.tap('body', { position: { x: 10, y: 10 } })
    await expect(page.locator('.tippy-box')).toBeHidden()
    
    // Open second tooltip (match percentage)
    const matchPercentage = page.locator('text=/\\d+%/').first()
    const matchBox = await matchPercentage.boundingBox()
    await matchPercentage.tap()
    await page.waitForSelector('.tippy-box', { state: 'visible' })
    
    const secondTooltipBox = await page.locator('.tippy-box').first().boundingBox()
    
    if (!matchBox || !secondTooltipBox) throw new Error('Elements not found')
    
    // Second tooltip should also be correctly positioned
    expect(secondTooltipBox.y + secondTooltipBox.height).toBeLessThan(matchBox.y)
  })
})
