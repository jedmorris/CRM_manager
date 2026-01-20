# Gmail Pub/Sub Setup

> Configure Google Cloud Pub/Sub for Gmail push notifications to enable real-time email automations.

## Overview

Gmail automations require Google Cloud Pub/Sub to receive real-time notifications when emails arrive. Without this, Gmail-triggered automations won't work.

**Architecture:**
```
New email arrives in Gmail
        ↓
Gmail API pushes to Pub/Sub topic
        ↓
Pub/Sub pushes to your webhook endpoint
        ↓
/api/webhooks/automation processes the email
        ↓
Automation action executes
```

---

## Prerequisites

- Google Cloud Platform account
- GCP project with billing enabled
- Gmail API enabled
- Pub/Sub API enabled

---

## Step 1: Create a Pub/Sub Topic

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create one)
3. Navigate to **Pub/Sub** → **Topics**
4. Click **Create Topic**
5. Name it: `gmail-automations`
6. Note the full topic name: `projects/YOUR_PROJECT_ID/topics/gmail-automations`

---

## Step 2: Grant Gmail Publish Permissions

Gmail needs permission to publish to your topic.

1. Go to your topic's **Permissions** tab
2. Click **Add Principal**
3. Add: `gmail-api-push@system.gserviceaccount.com`
4. Role: **Pub/Sub Publisher**
5. Click **Save**

---

## Step 3: Create a Push Subscription

1. Go to **Pub/Sub** → **Subscriptions**
2. Click **Create Subscription**
3. Configure:
   - **Subscription ID**: `gmail-automations-push`
   - **Topic**: Select `gmail-automations`
   - **Delivery type**: Push
   - **Endpoint URL**: `https://YOUR_DOMAIN/api/webhooks/automation`
   - **Acknowledgement deadline**: 60 seconds
4. Click **Create**

### For Local Development

Use a tunnel service like ngrok:
```bash
ngrok http 3000
```
Then use the ngrok URL as your endpoint:
`https://abc123.ngrok.io/api/webhooks/automation`

---

## Step 4: Update Environment Variables

Add to your `.env.local`:

```env
# Google Cloud Pub/Sub
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-automations

# Webhook URL for Gmail push (your production domain)
GMAIL_PUBSUB_WEBHOOK_URL=https://YOUR_DOMAIN/api/webhooks/automation
```

---

## Step 5: Configure Vercel (Production)

For production on Vercel, the push subscription endpoint should be your Vercel deployment URL:

```
https://your-app.vercel.app/api/webhooks/automation
```

---

## Step 6: Set Up Watch Renewal Cron

Gmail watches expire after 7 days. Add a cron job to renew them.

### Option A: Vercel Cron (Recommended)

Create `webapp/vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/renew-gmail-watches",
      "schedule": "0 0 * * *"
    }
  ]
}
```

Add `CRON_SECRET` to your Vercel environment variables for security.

### Option B: External Cron Service

Use a service like [cron-job.org](https://cron-job.org) to call:
```
GET https://YOUR_DOMAIN/api/cron/renew-gmail-watches
Authorization: Bearer YOUR_CRON_SECRET
```

Schedule: Daily at midnight (0 0 * * *)

---

## Verification

### Test the Pub/Sub Connection

1. Create a Gmail automation in the app
2. Send a test email to trigger it
3. Check the automation logs in the dashboard
4. Check server logs for: `Gmail push notification for: your@email.com`

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No notifications received | Topic permissions | Verify `gmail-api-push@system.gserviceaccount.com` has Publisher role |
| 403 on webhook | Subscription endpoint | Verify the URL is publicly accessible |
| Watch expires | Cron not running | Check Vercel cron logs or external cron service |
| `No profile found` | google_email mismatch | Ensure OAuth stores the correct email |

---

## Environment Variables Summary

| Variable | Description | Example |
|----------|-------------|---------|
| `GMAIL_PUBSUB_TOPIC` | Full Pub/Sub topic path | `projects/myproject/topics/gmail-automations` |
| `GMAIL_PUBSUB_WEBHOOK_URL` | Your webhook endpoint | `https://myapp.vercel.app/api/webhooks/automation` |
| `CRON_SECRET` | Secret for cron authentication | Random 32+ char string |
| `GOOGLE_CLIENT_ID` | OAuth client ID | From GCP Console |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret | From GCP Console |

---

## Security Notes

1. **Webhook authentication**: Consider adding signature verification for Pub/Sub pushes
2. **CRON_SECRET**: Always set this in production to prevent unauthorized cron triggers
3. **HTTPS required**: Pub/Sub push only works over HTTPS

---

## References

- [Gmail API Push Notifications](https://developers.google.com/gmail/api/guides/push)
- [Pub/Sub Push Subscriptions](https://cloud.google.com/pubsub/docs/push)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
