# Email Testing Setup

The E2E tests support two email providers:

## Mailpit (Local Development) - Recommended

Mailpit is a local email testing tool that captures all emails sent by your app.

### Setup

1. **Install Mailpit**:
   ```bash
   # macOS
   brew install mailpit
   
   # Or download from https://github.com/axllent/mailpit/releases
   ```

2. **Start Mailpit**:
   ```bash
   mailpit
   ```
   
   Mailpit will run on:
   - SMTP: `localhost:1025` (for sending emails)
   - Web UI: `http://localhost:8025` (for viewing emails)

3. **Configure your `.env`**:
   ```bash
   E2E_EMAIL_PROVIDER=mailpit
   # MAILPIT_API_URL=http://localhost:8025 (optional, this is the default)
   ```

4. **Configure Supabase to use Mailpit**:
   
   In your Supabase project settings (or local Supabase config), set the SMTP server to:
   - Host: `localhost`
   - Port: `1025`
   - No authentication required

### Viewing Emails

Open `http://localhost:8025` in your browser to see all captured emails.

## MailSlurp (Staging/CI)

MailSlurp is a cloud email testing service for staging and CI environments.

### Setup

1. **Get an API key** from [mailslurp.com](https://www.mailslurp.com/)

2. **Configure your `.env`**:
   ```bash
   E2E_EMAIL_PROVIDER=mailslurp
   MAILSLURP_API_KEY=your-api-key-here
   ```

3. **Note**: MailSlurp has daily quotas on free plans (30 emails/day)

## Switching Between Providers

Simply change the `E2E_EMAIL_PROVIDER` environment variable:

```bash
# For local development
E2E_EMAIL_PROVIDER=mailpit

# For staging/CI
E2E_EMAIL_PROVIDER=mailslurp
```

The tests will automatically use the configured provider.
