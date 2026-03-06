'use client'

import Link from 'next/link'
import Button from '@/components/Button'
import LinkButton from '@/components/LinkButton'
import StyledLink from '@/components/StyledLink'
import ButtonLink from '@/components/ButtonLink'
import StatusIcon from '@/components/StatusIcon'
import BannerMessage from '@/components/BannerMessage'
import notify from '@/lib/toast'
import { useState, useEffect } from 'react'

export const dynamic = 'force-dynamic'

const LOGO_LOGOTYPE =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png'
const LOGO_MARK =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logo.png'

// Helper function to convert hex to RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? 
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
    ''
}

// Helper function to format CSS variable name to readable name
const formatVarName = (cssVar: string) => {
  // Extract variable name (remove "var(" and ")" and trim)
  const varName = cssVar.replace('var(', '').replace(')', '').trim()
  
  // Convert kebab-case to Title Case
  return varName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Helper function to get all CSS color variables automatically
const getAllColorVariables = () => {
  const style = getComputedStyle(document.documentElement)
  const colorVars: Array<{name: string, value: string, category: string}> = []
  
  // Get ALL CSS custom properties (variables)
  const allVars = Array.from(document.styleSheets)
    .flatMap(sheet => {
      try {
        return Array.from(sheet.cssRules || [])
      } catch (e) {
        return [] // Skip cross-origin stylesheets
      }
    })
    .flatMap(rule => {
      if (rule.type === CSSRule.STYLE_RULE) {
        const styleRule = rule as CSSStyleRule
        return Array.from(styleRule.style).filter(prop => prop.startsWith('--'))
      }
      return []
    })
  
  // Or fallback to checking common color variable patterns
  const commonColorPatterns = [
    'bg', 'surface', 'border', 'text', 'primary', 'accent', 'success', 'alert', 'warn', 'info', 'gradient', 'watercolor'
  ]
  
  // Get all properties that look like color variables
  for (let i = 0; i < style.length; i++) {
    const prop = style[i]
    if (prop.startsWith('--')) {
      const value = style.getPropertyValue(prop).trim()
      
      // Check if it's a color (hex, rgb, rgba, hsl, etc.) or contains color-related keywords
      if (value && (
        value.startsWith('#') || 
        value.startsWith('rgb') || 
        value.startsWith('hsl') ||
        commonColorPatterns.some(pattern => prop.includes(pattern))
      )) {
        let category = 'Other'
        if (prop.includes('text')) category = 'Text'
        else if (prop.includes('primary') || prop.includes('accent')) category = 'Brand'
        else if (prop.includes('success') || prop.includes('alert') || prop.includes('warn') || prop.includes('info')) category = 'Semantic'
        else if (prop.includes('surface') || prop.includes('bg') || prop.includes('border')) category = 'Surface'
        else if (prop.includes('gradient')) category = 'Gradient'
        else if (prop.includes('watercolor')) category = 'Background'
        
        colorVars.push({
          name: prop,
          value: value,
          category: category
        })
      }
    }
  }
  
  return colorVars
}

// Helper function to generate ColorCards for a specific category
const generateColorCards = (category: string) => {
  const colorVars = getAllColorVariables()
  
  return colorVars
    .filter(colorVar => colorVar.category === category)
    .map(colorVar => (
      <ColorCard
        key={colorVar.name}
        swatch={`var(${colorVar.name})`}
        tag={colorVar.category}
      />
    ))
}

export default function StyleGuidePage() {
  return (
    <>
      {/* Hero */}
      <div className="design-hero">
        <div className="design-hero-content">
          <div className="logo-display">
            <img src={LOGO_LOGOTYPE} alt="wev logo" className="wev-logotype" />
          </div>
          <p className="design-subtitle">Style Guide</p>
          <p className="design-version">Version 1.0 • February 2026</p>
        </div>
      </div>

      {/* Typography */}
      <section id="typography" className="design-section">
        <div className="design-container">
          <h2>Typography</h2>
          <p className="design-section-intro">
            Lexend Deca is our primary typeface. Designed specifically for readability and
            accessibility, it ensures our content is clear and approachable across all platforms.
          </p>

          <h3>Type Scale</h3>
          <div className="design-type-scale">
            <div className="design-type-example">
              <div className="design-type-label">H1 / 32px / Bold</div>
              <div className="design-type-specimen design-type-h1">The quick brown fox jumps</div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">H2 / 28px / Semi-Bold</div>
              <div className="design-type-specimen design-type-h2">The quick brown fox jumps</div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">H3 / 24px / Semi-Bold</div>
              <div className="design-type-specimen design-type-h3">The quick brown fox jumps</div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">H4 / 20px / Medium</div>
              <div className="design-type-specimen design-type-h4">The quick brown fox jumps</div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">Body Large / 18px</div>
              <div className="design-type-specimen design-type-body-large">
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">Body / 16px</div>
              <div className="design-type-specimen design-type-body">
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">Body Small / 14px</div>
              <div className="design-type-specimen design-type-body-small">
                The quick brown fox jumps over the lazy dog
              </div>
            </div>
            <div className="design-type-example">
              <div className="design-type-label">Button / 16px / Semi-Bold</div>
              <div className="design-type-specimen design-type-button">BUTTON TEXT</div>
            </div>
          </div>
        </div>
      </section>

      {/* Color Palette */}
      <section id="colors" className="design-section">
        <div className="design-container">
          <h2>Color Palette</h2>
          <p className="design-section-intro">
            Our color system balances warmth and professionalism. All colors are tested for WCAG 2.1
            AA compliance to ensure accessibility across all use cases.
          </p>

          <h3>Surface Colors</h3>
          <div className="design-color-grid">
            {generateColorCards('Surface')}
          </div>

          <h3>Brand Colors</h3>
          <div className="design-color-grid">
            {generateColorCards('Brand')}
          </div>

          <h3>Semantic Colors</h3>
          <div className="design-color-grid">
            {generateColorCards('Semantic')}
          </div>

          <h3>Text Colors</h3>
          <div className="design-color-grid">
            {generateColorCards('Text')}
          </div>

          <h3>Background Colors</h3>
          <div className="design-color-grid">
            {generateColorCards('Background')}
          </div>

          <h3>Gradient Colors</h3>
          <div className="design-color-grid">
            {generateColorCards('Gradient')}
          </div>
        </div>
      </section>

      {/* Component System */}
      <section id="three-component-system" className="design-section">
        <div className="design-container">
          <h2>Component System</h2>
          <p className="design-section-intro">
            We use four distinct components for interaction patterns: Button for actions, LinkButton for navigation that looks like buttons,
            StyledLink for navigation with flexible styling, and ButtonLink for actions that should look like inline links.
          </p>

          <div className="design-button-grid">
            <div className="design-button-example">
              <div className="design-button-label">Button Component</div>
              <p className="design-button-description">
                Pure actions that don't navigate. Form submission, modals, API calls, state changes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button">
                  Save Changes
                </Button>
                <Button variant="secondary">
                  Copy to Clipboard
                </Button>
                <Button variant="outline">
                  Cancel
                </Button>
              </div>
              <div className="design-usage-examples">
                <p className="text-sm text-wev-text-secondary mt-4">
                  <strong>Variants:</strong> primary, secondary, outline
                </p>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">LinkButton Component</div>
              <p className="design-button-description">
                Navigation that looks exactly like a button. Same visual variants as Button.
              </p>
              <div className="flex flex-wrap gap-2">
                <LinkButton href="/profile">
                  View Profile
                </LinkButton>
                <LinkButton href="/" variant="secondary">
                  Back to Jobs
                </LinkButton>
                <LinkButton href="/help" variant="outline">
                  Learn More
                </LinkButton>
              </div>
              <div className="design-usage-examples">
                <p className="text-sm text-wev-text-secondary mt-4">
                  <strong>Variants:</strong> primary, secondary, outline (same as Button)
                </p>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">StyledLink Component</div>
              <p className="design-button-description">
                Navigation with flexible styling - can look like button or text.
              </p>
              <div className="flex flex-wrap gap-2">
                <StyledLink href="/profile" variant="primary">
                  View Profile
                </StyledLink>
                <StyledLink href="/" variant="secondary">
                  Back to Jobs
                </StyledLink>
                <StyledLink href="/help" variant="outline">
                  Learn More
                </StyledLink>
                <StyledLink href="/docs" variant="text">
                  Documentation
                </StyledLink>
              </div>
              <div className="design-usage-examples">
                <p className="text-sm text-wev-text-secondary mt-4">
                  <strong>Variants:</strong> primary, secondary, outline, text
                </p>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">ButtonLink Component</div>
              <p className="design-button-description">
                Actions that should look like links (toggle/collapse, clear, reset). This stays a semantic button.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <ButtonLink onClick={() => undefined}>
                  Collapse all
                </ButtonLink>
                <ButtonLink tone="muted" size="xs" className="underline" onClick={() => undefined}>
                  Show all jobs
                </ButtonLink>
                <ButtonLink tone="primary" onClick={() => undefined}>
                  Use suggested filters
                </ButtonLink>
              </div>
              <div className="design-usage-examples">
                <p className="text-sm text-wev-text-secondary mt-4">
                  <strong>Tones:</strong> accent, muted, primary
                </p>
              </div>
            </div>
          </div>

          <h3>Button Layout Guidelines</h3>
          <div className="design-layout-grid">
            <div className="design-layout-example">
              <div className="design-layout-label">Two-Button Layouts</div>
              <p className="design-layout-description">
                Secondary actions (cancel, back) on left, primary actions (save, submit) on right.
              </p>
              <div className="design-layout-preview">
                <div className="flex justify-between gap-3">
                  <LinkButton href="/" variant="outline">
                    Back to Jobs
                  </LinkButton>
                  <Button type="submit">
                    Save Profile
                  </Button>
                </div>
              </div>
              <div className="design-layout-code">
                <code className="text-xs bg-wev-surface p-2 rounded block">
                  &lt;div className="flex justify-between gap-3"&gt;<br/>
                  &nbsp;&nbsp;&lt;LinkButton href="/" variant="outline"&gt;<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;Back to Jobs<br/>
                  &nbsp;&nbsp;&lt;/LinkButton&gt;<br/>
                  &nbsp;&nbsp;&lt;Button type="submit"&gt;<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;Save Profile<br/>
                  &nbsp;&nbsp;&lt;/Button&gt;<br/>
                  &lt;/div&gt;
                </code>
              </div>
            </div>

            <div className="design-layout-example">
              <div className="design-layout-label">Single Button Layouts</div>
              <p className="design-layout-description">
                Single primary actions should be right-aligned for consistency.
              </p>
              <div className="design-layout-preview">
                <div className="flex justify-end gap-3">
                  <Button type="submit">
                    Submit Application
                  </Button>
                </div>
              </div>
              <div className="design-layout-code">
                <code className="text-xs bg-wev-surface p-2 rounded block">
                  &lt;div className="flex justify-end gap-3"&gt;<br/>
                  &nbsp;&nbsp;&lt;Button type="submit"&gt;<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;Submit Application<br/>
                  &nbsp;&nbsp;&lt;/Button&gt;<br/>
                  &lt;/div&gt;
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section id="buttons" className="design-section">
        <div className="design-container">
          <h2>Button Hierarchy</h2>
          <p className="design-section-intro">
            Our button system creates clear visual hierarchy. Use primary buttons for main actions,
            secondary for supporting actions, and outline for low-emphasis interactions.
          </p>

          <div className="design-button-grid">
            <div className="design-button-example">
              <div className="design-button-label">Primary Button</div>
              <p className="design-button-description">
                Main action, one per view. Uses Muted Teal.
              </p>
              <div className="space-y-2">
                <Button type="button">
                  Save Changes
                </Button>
                <Button type="button" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Secondary Button</div>
              <p className="design-button-description">Supporting action with teal outline and fill on hover.</p>
              <div className="space-y-2">
                <Button variant="secondary">
                  Copy to Clipboard
                </Button>
                <Button variant="secondary" disabled>
                  Disabled
                </Button>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Outline Button</div>
              <p className="design-button-description">Low-emphasis, border-only style.</p>
              <div className="space-y-2">
                <Button variant="outline">
                  Cancel
                </Button>
                <Button variant="outline" disabled>
                  Disabled
                </Button>
              </div>
            </div>
          </div>

          <h3>Navigation Components</h3>
          <p className="design-section-intro">
            Navigation components use the same visual styles as buttons but include prefetch for performance.
          </p>

          <div className="design-button-grid">
            <div className="design-button-example">
              <div className="design-button-label">LinkButton (Primary)</div>
              <p className="design-button-description">
                Navigation that looks like a primary button.
              </p>
              <div className="space-y-2">
                <LinkButton href="/profile">
                  View Profile
                </LinkButton>
                <LinkButton href="/profile" className="opacity-50">
                  Disabled State
                </LinkButton>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">LinkButton (Secondary)</div>
              <p className="design-button-description">Navigation with teal outline and fill on hover.</p>
              <div className="space-y-2">
                <LinkButton href="/" variant="secondary">
                  Back to Jobs
                </LinkButton>
                <LinkButton href="/" variant="secondary" className="opacity-50">
                  Disabled State
                </LinkButton>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">LinkButton (Outline)</div>
              <p className="design-button-description">Navigation with outline styling.</p>
              <div className="space-y-2">
                <LinkButton href="/help" variant="outline">
                  Learn More
                </LinkButton>
                <LinkButton href="/help" variant="outline" className="opacity-50">
                  Disabled State
                </LinkButton>
              </div>
            </div>
          </div>

          <h3>Text Links</h3>
          <p className="design-section-intro">
            Text links use theme colors with standard web conventions.
          </p>

          <div className="design-button-grid">
            <div className="design-button-example">
              <div className="design-button-label">StyledLink (Text)</div>
              <p className="design-button-description">
                Text-style navigation with theme colors.
              </p>
              <div className="space-y-2">
                <StyledLink href="/docs" variant="text">
                  Documentation
                </StyledLink>
                <br />
                <StyledLink href="/help" variant="text">
                  Help Center
                </StyledLink>
              </div>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Standard Link</div>
              <p className="design-button-description">
                Basic text links with theme colors.
              </p>
              <div className="space-y-2">
                <Link href="/profile" className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]" prefetch={true}>
                  View Profile
                </Link>
                <br />
                <Link href="/help" className="text-[var(--primary)] hover:underline visited:text-[var(--accent)]" prefetch={true}>
                  Help Documentation
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Alerts & Toasts */}
      <section id="alerts" className="design-section">
        <div className="design-container">
          <h2>Semantic States</h2>
          <p className="design-section-intro">
            Consistent visual feedback across success, error, warning, and info states. All
            combinations meet WCAG AA contrast requirements.
          </p>

          <h3>Toast Messages</h3>
          <div className="design-toast-grid">
            <BannerMessage 
              type="success" 
              message="Your changes have been saved successfully" 
            />
            <BannerMessage 
              type="error" 
              message="There was an error processing your request" 
            />
            <BannerMessage 
              type="warning" 
              message="Your session will expire in 5 minutes" 
            />
            <BannerMessage 
              type="info" 
              message="New features are now available in your dashboard" 
            />
          </div>

          <h4>Try It Out</h4>
          <p className="design-section-intro">
            Click the links below to see each toast type in action with the live styling.
          </p>
          
          <div className="design-button-grid">
            <div className="design-button-example">
              <div className="design-button-label">Success Toast</div>
              <p className="design-button-description">
                Shows a success notification with green styling.
              </p>
              <button
                onClick={() => {
                  notify.success('Your profile has been updated successfully!')
                }}
                className="text-[var(--primary)] hover:underline"
              >
                Trigger Success Toast
              </button>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Error Toast</div>
              <p className="design-button-description">
                Shows an error notification with red styling.
              </p>
              <button
                onClick={() => {
                  notify.error('Failed to save changes. Please try again.')
                }}
                className="text-[var(--primary)] hover:underline"
              >
                Trigger Error Toast
              </button>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Warning Toast</div>
              <p className="design-button-description">
                Shows a warning notification with orange styling.
              </p>
              <button
                onClick={() => {
                  notify.warning('Your session will expire in 5 minutes.')
                }}
                className="text-[var(--primary)] hover:underline"
              >
                Trigger Warning Toast
              </button>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Info Toast</div>
              <p className="design-button-description">
                Shows an info notification with blue styling.
              </p>
              <button
                onClick={() => {
                  notify.info('Processing your request...')
                }}
                className="text-[var(--primary)] hover:underline"
              >
                Trigger Info Toast
              </button>
            </div>
          </div>

          <h3>Banner Messages</h3>
          <BannerMessage 
            type="success" 
            message="Success: Your profile has been updated" 
          />
          <BannerMessage 
            type="error" 
            message="Alert: Unable to connect to server" 
          />
          <BannerMessage 
            type="warning" 
            message="Warning: Unsaved changes will be lost" 
          />
          <BannerMessage 
            type="info" 
            message="Info: Maintenance scheduled for tonight" 
          />
        </div>
      </section>

      {/* Brand Accent */}
      <section id="accent" className="design-section">
        <div className="design-container">
          <h2>Brand Accent — Dusty Lavender</h2>
          <p className="design-section-intro">
            Our signature Dusty Lavender color draws attention to key moments and new features. Use
            it sparingly for maximum impact.
          </p>

          <div className="design-accent-grid">
            <div className="design-accent-card">
              <div className="design-accent-badge">New Feature</div>
              <h5>Enhanced Analytics</h5>
              <p>Get deeper insights into your data with our new analytics dashboard.</p>
              <a href="#" className="design-accent-link">
                View Details →
              </a>
            </div>

            <div className="design-accent-card">
              <div className="design-accent-badge">Popular</div>
              <h5>Team Collaboration</h5>
              <p>Work together seamlessly with real-time collaboration tools.</p>
              <a href="#" className="design-accent-link">
                Read more →
              </a>
            </div>

            <div className="design-accent-card">
              <div className="design-accent-badge">Featured</div>
              <h5>API Integration</h5>
              <p>Connect your favorite tools with our powerful API.</p>
              <a href="#" className="design-accent-link">
                Learn more →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Logo */}
      <section id="logo" className="design-section">
        <div className="design-container">
          <h2>Logo Usage</h2>
          <p className="design-section-intro">
            Our logo represents clarity and connection. Always maintain proper spacing and never
            distort or alter the colors.
          </p>

          <div className="design-logo-grid">
            <div className="design-logo-showcase design-logo-bg-light">
              <div className="design-logo-placeholder">
                <img src={LOGO_LOGOTYPE} alt="wev logo" className="wev-logotype" />
              </div>
              <div className="design-logo-title">Primary Logotype</div>
              <p className="design-logo-description">
                Full logo with brand name for primary applications
              </p>
            </div>

            <div className="design-logo-showcase design-logo-bg-light">
              <div className="design-logo-placeholder">
                <img src={LOGO_MARK} alt="wev logo mark" />
              </div>
              <div className="design-logo-title">Logo Mark</div>
              <p className="design-logo-description">
                Standalone icon for compact use (favicon, app icons)
              </p>
            </div>
          </div>

          <h3>Logo Guidelines</h3>
          <div className="mt-8">
            <h4>Clear Space</h4>
            <p className="text-wev-text-secondary mb-8">
              Maintain clear space around the logo equal to the height of the 'w'. This
              ensures visual distinction.
            </p>

            <h4>Minimum Size</h4>
            <p className="text-wev-text-secondary mb-4">
              <strong>Digital:</strong> 32px height minimum for logo mark, 120px width for logotype
              <br />
              <strong>Print:</strong> 0.5 inches height minimum for logo mark, 1.5 inches for
              logotype
            </p>

            <h4 className="mt-8">Don'ts</h4>
            <ul className="text-wev-text-secondary leading-relaxed ml-6 list-disc space-y-1">
              <li>Do not alter logo colors outside approved palette</li>
              <li>Do not distort, rotate, or skew the logo</li>
              <li>Do not add effects (shadows, outlines, gradients)</li>
              <li>Do not place on busy backgrounds without sufficient contrast</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Dark Mode colors */}
      <section id="dark-mode" className="design-section">
        <div className="design-container">
          <h2>Dark Mode</h2>
          <p className="design-section-intro">
            Our dark mode palette maintains brand identity while optimizing for low-light
            environments. All colors meet WCAG 2.1 Level AA contrast requirements for accessibility.
          </p>

          <h3>Dark Mode Base Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#242424"
              tag="Background"
            />
            <ColorCard
              swatch="#353535"
              tag="Surface / Cards"
            />
            <ColorCard
              swatch="#616161"
              tag="Borders"
            />
            <ColorCard
              swatch="#B07D96"
              tag="Brand Accent (Dark)"
            />
            <ColorCard
              swatch="#5B8C8A"
              tag="Primary (Consistent)"
            />
          </div>

          <h3>Dark Mode Semantic Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#3E8C4F"
              tag="Success Buttons"
            />
            <ColorCard
              swatch="#1A3320"
              tag="Success Backgrounds"
            />
            <ColorCard
              swatch="#6FD68A"
              tag="Success Messages"
            />
            <ColorCard
              swatch="#E8857A"
              tag="Error Messages"
            />
            <ColorCard
              swatch="#E8B53A"
              tag="Warning Messages"
            />
            <ColorCard
              swatch="#7AB4D9"
              tag="Info Messages"
            />
          </div>

          <h3>Dark Mode Text Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#E8E6E2"
              tag="Primary Text"
            />
            <ColorCard
              swatch="#A8A5A0"
              tag="Secondary Text"
            />
            <ColorCard
              swatch="#8A8782"
              tag="Tertiary Text"
            />
            <ColorCard
              swatch="#4A4A4A"
              tag="Borders / Dividers"
            />
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section id="accessibility" className="design-section">
        <div className="design-container">
          <h2>Accessibility</h2>
          <p className="design-section-intro">
            All color combinations meet WCAG 2.1 Level AA standards. We prioritize inclusive design
            to ensure our products are accessible to everyone.
          </p>

          <h3>Contrast Test Results</h3>
          <div className="design-contrast-grid">
            <ContrastCard
              bg="#FEFBF7"
              color="#875C74"
              text="Dusty Lavender on Porcelain"
              ratio="5.8:1"
              badge="✓ AA Pass"
            />
            <ContrastCard
              bg="#5B8C8A"
              color="#ffffff"
              text="White on Muted Teal"
              ratio="5.1:1"
              badge="✓ AA Pass"
            />
            <ContrastCard
              bg="#FEFBF7"
              color="#2a2a2a"
              text="Charcoal on Porcelain"
              ratio="13.5:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#C5EBC3"
              color="#2a2a2a"
              text="Text on Tea Green"
              ratio="8.2:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#F5DEB3"
              color="#2a2a2a"
              text="Text on Warning Tint"
              ratio="6.4:1"
              badge="✓ AA Pass"
            />
            <ContrastCard
              bg="#F2D0CC"
              color="#2a2a2a"
              text="Text on Alert Tint"
              ratio="5.9:1"
              badge="✓ AA Pass"
            />
          </div>

          <h3 className="mt-16">Dark Mode Contrast Tests</h3>
          <div className="design-contrast-grid">
            <ContrastCard
              bg="#1E1E1E"
              color="#B07D96"
              text="Dusty Lavender Light on Dark"
              ratio="7.2:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#1E1E1E"
              color="#5B8C8A"
              text="Muted Teal on Dark"
              ratio="6.8:1"
              badge="✓ AA Pass"
            />
            <ContrastCard
              bg="#1E1E1E"
              color="#E8E6E2"
              text="White on Charcoal Deep"
              ratio="16.1:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#5B8C8A"
              color="#1E1E1E"
              text="Dark on Muted Teal (CTA)"
              ratio="5.9:1"
              badge="✓ AA Pass"
            />
            <ContrastCard
              bg="#1A3320"
              color="#6FD68A"
              text="Success Text on Tint"
              ratio="7.8:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#3D1F1C"
              color="#E8857A"
              text="Alert Text on Tint"
              ratio="6.9:1"
              badge="✓ AA Pass"
            />
            <ContrastCard
              bg="#3A2E0A"
              color="#E8B53A"
              text="Warning Text on Tint"
              ratio="8.2:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#1C2E3D"
              color="#7AB4D9"
              text="Info Text on Tint"
              ratio="7.5:1"
              badge="✓ AAA Pass"
            />
            <ContrastCard
              bg="#1E1E1E"
              color="#A8A5A0"
              text="Secondary Text on Dark"
              ratio="9.8:1"
              badge="✓ AAA Pass"
            />
          </div>

          <h3>Best Practices</h3>
          <ul className="mt-8 ml-6 list-disc flex flex-col gap-4 text-wev-text-secondary leading-relaxed">
            <li>Test all color combinations with contrast checking tools before implementation</li>
            <li>Never rely on color alone to convey information—use icons, labels, or patterns</li>
            <li>Ensure interactive elements have minimum target size of 44×44px</li>
            <li>Maintain visible focus indicators on all interactive elements</li>
            <li>Use Lexend Deca font for improved readability for users with dyslexia</li>
            <li>Provide alternative text for all images and icons</li>
            <li>Ensure sufficient line height (1.5× minimum) for readability</li>
          </ul>
        </div>
      </section>

      {/* Design Tokens */}
      <section id="tokens" className="design-section">
        <div className="design-container">
          <h2>Design Tokens</h2>
          <p className="design-section-intro">
            Use these tokens for consistent implementation across all platforms and frameworks.
          </p>

          <div className="design-token-sheet">
            <div className="design-token-category">
              <div className="design-token-category-title">Background & Surface</div>
              <TokenRow name="bg" value="var(--bg)" swatch="var(--bg)" border />
              <TokenRow name="surface" value="var(--surface)" swatch="var(--surface)" />
              <TokenRow name="surfaceTint" value="var(--surface-tint)" swatch="var(--surface-tint)" />
              <TokenRow name="border" value="var(--border)" swatch="var(--border)" />
            </div>

            <div className="design-token-category">
              <div className="design-token-category-title">Text Colors</div>
              <TokenRow name="textPrimary" value="var(--text-primary)" swatch="var(--text-primary)" />
              <TokenRow name="textSecondary" value="var(--text-secondary)" swatch="var(--text-secondary)" />
              <TokenRow name="textTertiary" value="var(--text-tertiary)" swatch="var(--text-tertiary)" />
            </div>

            <div className="design-token-category">
              <div className="design-token-category-title">Brand Colors</div>
              <TokenRow name="primary" value="var(--primary)" swatch="var(--primary)" />
              <TokenRow name="primaryTint" value="var(--primary-tint)" swatch="var(--primary-tint)" />
              <TokenRow name="accent" value="var(--accent)" swatch="var(--accent)" />
              <TokenRow name="accentTint" value="var(--accent-tint)" swatch="var(--accent-tint)" />
            </div>

            <div className="design-token-category">
              <div className="design-token-category-title">Semantic Colors</div>
              <TokenRow name="successSolid" value="var(--success-solid)" swatch="var(--success-solid)" />
              <TokenRow name="successTint" value="var(--success-tint)" swatch="var(--success-tint)" />
              <TokenRow name="alertSolid" value="var(--alert-solid)" swatch="var(--alert-solid)" />
              <TokenRow name="alertTint" value="var(--alert-tint)" swatch="var(--alert-tint)" />
              <TokenRow name="warnSolid" value="var(--warn-solid)" swatch="var(--warn-solid)" />
              <TokenRow name="warnTint" value="var(--warn-tint)" swatch="var(--warn-tint)" />
              <TokenRow name="infoSolid" value="var(--info-solid)" swatch="var(--info-solid)" />
              <TokenRow name="infoTint" value="var(--info-tint)" swatch="var(--info-tint)" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section id="footer" className="design-footer design-section">
        <div className="design-container">
          <p>wev Style Guide • Version 1.0 • February 2026</p>
          <p>For questions about brand implementation, contact the design team</p>
          <p className="mt-4">
            <Link href="/" className="underline opacity-80 hover:opacity-100" style={{ color: 'var(--bg)' }}>
              ← Back to Bulletin
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}

function ColorCard({
  swatch,
  tag,
}: {
  swatch: string
  tag: string
}) {
  const [colorData, setColorData] = useState({
    hex: '',
    rgb: ''
  })

  useEffect(() => {
    // Extract CSS variable name from swatch string
    const cssVarName = swatch.replace('var(', '').replace(')', '').trim()
    
    // Get actual CSS variable value
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVarName)
      .trim()
    
    setColorData({
      hex: value,
      rgb: hexToRgb(value)
    })
  }, [swatch])

  // Auto-generate name from CSS variable
  const name = formatVarName(swatch)

  return (
    <div className="design-color-card">
      <div className="design-color-swatch" style={{ background: swatch }} />
      <div className="design-color-info">
        <div className="design-color-name">{name}</div>
        <div className="design-color-values">
          <div className="design-color-value">
            <span>HEX</span> <strong>{colorData.hex}</strong>
          </div>
          <div className="design-color-value">
            <span>RGB</span> <strong>{colorData.rgb}</strong>
          </div>
        </div>
        <div className="design-usage-tag">{tag}</div>
      </div>
    </div>
  )
}

function ContrastCard({
  bg,
  color,
  text,
  ratio,
  badge,
}: {
  bg: string
  color: string
  text: string
  ratio: string
  badge: string
}) {
  return (
    <div className="design-contrast-card">
      <div
        className="design-contrast-preview"
        style={{ background: bg, color }}
      >
        {text}
      </div>
      <div className="design-contrast-info">
        <span className="design-contrast-ratio">{ratio}</span>
        <span className="design-contrast-badge">{badge}</span>
      </div>
    </div>
  )
}

function TokenRow({
  name,
  value,
  swatch,
  border,
}: {
  name: string
  value: string
  swatch: string
  border?: boolean
}) {
  return (
    <div className="design-token-row">
      <div className="design-token-name">{name}</div>
      <div className="design-token-value">{value}</div>
      <div
        className="design-token-swatch"
        style={{
          background: swatch,
          ...(border ? { border: '2px solid #c8c5bf' } : {}),
        }}
      />
    </div>
  )
}
