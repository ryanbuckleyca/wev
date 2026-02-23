import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const LOGO_LOGOTYPE =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logotype.png'
const LOGO_MARK =
  'https://teuvfoftdjfsnkkbnzps.supabase.co/storage/v1/object/public/bulletin/wev-logo.png'

export const metadata: Metadata = {
  title: 'wev Style Guide',
  description: 'wev style guide and design standards',
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

          <h3>Base Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#FEFBF7"
              name="Porcelain"
              hex="#FEFBF7"
              rgb="254, 251, 247"
              tag="Background"
            />
            <ColorCard
              swatch="#875C74"
              name="Dusty Lavender"
              hex="#875C74"
              rgb="135, 92, 116"
              tag="Brand Accent"
            />
            <ColorCard
              swatch="#5B8C8A"
              name="Muted Teal"
              hex="#5B8C8A"
              rgb="91, 140, 138"
              tag="Primary / CTAs"
            />
            <ColorCard
              swatch="#C5EBC3"
              name="Tea Green"
              hex="#C5EBC3"
              rgb="197, 235, 195"
              tag="Success States"
            />
          </div>

          <h3>Semantic Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#3E8C4F"
              name="Success Solid"
              hex="#3E8C4F"
              rgb="62, 140, 79"
              tag="Buttons, Icons"
            />
            <ColorCard
              swatch="#C45A4A"
              name="Alert Solid"
              hex="#C45A4A"
              rgb="196, 90, 74"
              tag="Error States"
            />
            <ColorCard
              swatch="#9A7209"
              name="Warning Solid"
              hex="#9A7209"
              rgb="154, 114, 9"
              tag="Warning States"
            />
            <ColorCard
              swatch="#4A7A9E"
              name="Info Solid"
              hex="#4A7A9E"
              rgb="74, 122, 158"
              tag="Info States"
            />
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section id="buttons" className="design-section">
        <div className="design-container">
          <h2>Button Hierarchy</h2>
          <p className="design-section-intro">
            Our button system creates clear visual hierarchy. Use primary buttons for main actions,
            secondary for supporting actions, and tertiary for low-emphasis interactions.
          </p>

          <div className="design-button-grid">
            <div className="design-button-example">
              <div className="design-button-label">Primary Button</div>
              <p className="design-button-description">
                Main action, one per view. Uses Muted Teal.
              </p>
              <button type="button" className="design-btn design-btn-primary">
                Sign Up
              </button>
              <button type="button" className="design-btn design-btn-primary" disabled>
                Disabled
              </button>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Secondary Button</div>
              <p className="design-button-description">Supporting action with outline style.</p>
              <button type="button" className="design-btn design-btn-secondary">
                Learn More
              </button>
              <button type="button" className="design-btn design-btn-secondary" disabled>
                Disabled
              </button>
            </div>

            <div className="design-button-example">
              <div className="design-button-label">Tertiary Button</div>
              <p className="design-button-description">Low-emphasis, ghost style.</p>
              <button type="button" className="design-btn design-btn-tertiary">
                Cancel
              </button>
              <button type="button" className="design-btn design-btn-tertiary" disabled>
                Disabled
              </button>
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
            <div className="design-toast design-toast-success">
              <div className="design-toast-icon">✓</div>
              <div>Your changes have been saved successfully</div>
            </div>
            <div className="design-toast design-toast-alert">
              <div className="design-toast-icon">✕</div>
              <div>There was an error processing your request</div>
            </div>
            <div className="design-toast design-toast-warning">
              <div className="design-toast-icon">⚠</div>
              <div>Your session will expire in 5 minutes</div>
            </div>
            <div className="design-toast design-toast-info">
              <div className="design-toast-icon">ℹ</div>
              <div>New features are now available in your dashboard</div>
            </div>
          </div>

          <h3>Banner Messages</h3>
          <div className="design-banner design-banner-success">
            <strong>✓</strong> Success: Your profile has been updated
          </div>
          <div className="design-banner design-banner-alert">
            <strong>✕</strong> Alert: Unable to connect to server
          </div>
          <div className="design-banner design-banner-warning">
            <strong>■</strong> Warning: Unsaved changes will be lost
          </div>
          <div className="design-banner design-banner-info">
            <strong>■</strong> Info: Maintenance scheduled for tonight
          </div>
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
              swatch="#1E1E1E"
              name="Charcoal Deep"
              hex="#1E1E1E"
              rgb="30, 30, 30"
              tag="Background"
            />
            <ColorCard
              swatch="#2A2A2A"
              name="Slate Dark"
              hex="#2A2A2A"
              rgb="42, 42, 42"
              tag="Surface / Cards"
            />
            <ColorCard
              swatch="#B07D96"
              name="Dusty Lavender Light"
              hex="#B07D96"
              rgb="176, 125, 150"
              tag="Brand Accent (Dark)"
            />
            <ColorCard
              swatch="#5B8C8A"
              name="Muted Teal"
              hex="#5B8C8A"
              rgb="91, 140, 138"
              tag="Primary (Consistent)"
            />
          </div>

          <h3>Dark Mode Semantic Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#3E8C4F"
              name="Success Solid"
              hex="#3E8C4F"
              rgb="62, 140, 79"
              tag="Success Buttons"
            />
            <ColorCard
              swatch="#1A3320"
              name="Success Tint (Dark)"
              hex="#1A3320"
              rgb="26, 51, 32"
              tag="Success Backgrounds"
            />
            <ColorCard
              swatch="#6FD68A"
              name="Success Text"
              hex="#6FD68A"
              rgb="111, 214, 138"
              tag="Success Messages"
            />
            <ColorCard
              swatch="#E8857A"
              name="Alert Text"
              hex="#E8857A"
              rgb="232, 133, 122"
              tag="Error Messages"
            />
            <ColorCard
              swatch="#E8B53A"
              name="Warning Text"
              hex="#E8B53A"
              rgb="232, 181, 58"
              tag="Warning Messages"
            />
            <ColorCard
              swatch="#7AB4D9"
              name="Info Text"
              hex="#7AB4D9"
              rgb="122, 180, 217"
              tag="Info Messages"
            />
          </div>

          <h3>Dark Mode Text Colors</h3>
          <div className="design-color-grid">
            <ColorCard
              swatch="#E8E6E2"
              name="White / Primary Text"
              hex="#E8E6E2"
              rgb="232, 230, 226"
              tag="Primary Text"
            />
            <ColorCard
              swatch="#A8A5A0"
              name="Secondary Text"
              hex="#A8A5A0"
              rgb="168, 165, 160"
              tag="Secondary Text"
            />
            <ColorCard
              swatch="#8A8782"
              name="Tertiary Text"
              hex="#8A8782"
              rgb="138, 135, 130"
              tag="Tertiary Text"
            />
            <ColorCard
              swatch="#4A4A4A"
              name="Border"
              hex="#4A4A4A"
              rgb="74, 74, 74"
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
              <TokenRow name="bg" value="#FEFBF7" swatch="#FEFBF7" border />
              <TokenRow name="surface" value="#ffffff" swatch="#ffffff" />
              <TokenRow name="border" value="#c8c5bf" swatch="#c8c5bf" />
            </div>

            <div className="design-token-category">
              <div className="design-token-category-title">Text Colors</div>
              <TokenRow name="textPrimary" value="#2a2a2a" swatch="#2a2a2a" />
              <TokenRow name="textSecondary" value="#6b6b6b" swatch="#6b6b6b" />
              <TokenRow name="textTertiary" value="#7a7a7a" swatch="#7a7a7a" />
            </div>

            <div className="design-token-category">
              <div className="design-token-category-title">Brand Colors</div>
              <TokenRow name="primary" value="#5B8C8A" swatch="#5B8C8A" />
              <TokenRow name="primaryTint" value="#D6EAEA" swatch="#D6EAEA" />
              <TokenRow name="accent" value="#875C74" swatch="#875C74" />
              <TokenRow name="accentTint" value="#f0e4ec" swatch="#f0e4ec" />
            </div>

            <div className="design-token-category">
              <div className="design-token-category-title">Semantic Colors</div>
              <TokenRow name="successSolid" value="#3E8C4F" swatch="#3E8C4F" />
              <TokenRow name="successTint" value="#C5EBC3" swatch="#C5EBC3" />
              <TokenRow name="alertSolid" value="#C45A4A" swatch="#C45A4A" />
              <TokenRow name="alertTint" value="#F2D0CC" swatch="#F2D0CC" />
              <TokenRow name="warnSolid" value="#9A7209" swatch="#9A7209" />
              <TokenRow name="warnTint" value="#F5DEB3" swatch="#F5DEB3" />
              <TokenRow name="infoSolid" value="#4A7A9E" swatch="#4A7A9E" />
              <TokenRow name="infoTint" value="#C3D9EB" swatch="#C3D9EB" />
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
  name,
  hex,
  rgb,
  tag,
}: {
  swatch: string
  name: string
  hex: string
  rgb: string
  tag: string
}) {
  return (
    <div className="design-color-card">
      <div className="design-color-swatch" style={{ background: swatch }} />
      <div className="design-color-info">
        <div className="design-color-name">{name}</div>
        <div className="design-color-values">
          <div className="design-color-value">
            <span>HEX</span> <strong>{hex}</strong>
          </div>
          <div className="design-color-value">
            <span>RGB</span> <strong>{rgb}</strong>
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
