# Cal.com Integration

> Integrate Cal.com scheduling with the ClickUp CRM to automate meeting workflows.

## Overview

This integration enables two complementary workflows:

| Option | Name | Direction | Trigger | Use Case |
|--------|------|-----------|---------|----------|
| 1 | Active Assistant | User → Outbound | User asks Claude | Insert booking links into emails, check availability |
| 2 | Passive Pipeline | Inbound → CRM | Cal.com webhook | Auto-update tasks when meetings are booked |

**Recommendation**: Build both in parallel. Option 2 handles inbound bookings automatically. Option 1 enables outbound scheduling during conversations.

---

## Option 1: Active Assistant (Tool-Based)

### Philosophy
"I am in control. I tell the AI to schedule things."

### User Stories
- "Draft a follow-up to Mike and include my 30-minute booking link"
- "Check if I'm free next Tuesday afternoon"
- "What's my intro call link?"

### Tools to Implement

Add to `webapp/src/app/api/chat/route.ts`:

```typescript
// Tool 1: Get Event Types
{
  name: 'cal_get_event_types',
  description: 'Get all Cal.com event types (booking links) for the user',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

// Tool 2: Check Availability
{
  name: 'cal_check_availability',
  description: 'Check availability for a specific date range',
  input_schema: {
    type: 'object',
    properties: {
      event_type_id: {
        type: 'number',
        description: 'The event type ID to check availability for',
      },
      date_from: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD)',
      },
      date_to: {
        type: 'string',
        description: 'End date (YYYY-MM-DD)',
      },
    },
    required: ['event_type_id', 'date_from', 'date_to'],
  },
}

// Tool 3: Get Booking Link
{
  name: 'cal_get_booking_link',
  description: 'Get the public booking URL for an event type',
  input_schema: {
    type: 'object',
    properties: {
      event_type_slug: {
        type: 'string',
        description: 'The event type slug (e.g., "30min", "intro-call")',
      },
    },
    required: ['event_type_slug'],
  },
}
```

### Cal.com API Endpoints

| Operation | Endpoint | Method |
|-----------|----------|--------|
| List event types | `/api/v2/event-types` | GET |
| Check availability | `/api/v2/slots/available` | GET |
| Get user profile | `/api/v2/me` | GET |

### Auth Configuration

**Option A: API Key (Simpler)**
- User generates API key in Cal.com settings
- Store in `profiles.calcom_api_key`
- Add to `.env.local`: No additional env vars needed

**Option B: OAuth (Better UX)**
- Register app at cal.com/settings/developer
- Store `CALCOM_CLIENT_ID`, `CALCOM_CLIENT_SECRET` in `.env`
- OAuth flow similar to existing Google/ClickUp integrations

### Implementation Files

| File | Purpose |
|------|---------|
| `webapp/src/lib/calcom.ts` | Cal.com API client |
| `webapp/src/app/api/calcom/auth-url/route.ts` | OAuth initiation (if using OAuth) |
| `webapp/src/app/api/calcom/callback/route.ts` | OAuth callback (if using OAuth) |

---

## Option 2: Passive Pipeline (Webhook-Based)

### Philosophy
"The meeting is the record. Update the CRM for me."

### Flow

```
Prospect books meeting on cal.com/you/intro
           ↓
Cal.com fires webhook (booking.created)
           ↓
/api/webhooks/cal receives payload
           ↓
Search ClickUp for attendee email
           ↓
    ┌──────┴──────┐
    ↓             ↓
  Found        Not Found
    ↓             ↓
Update task   Create new lead
- Status → "Meeting Booked"
- Add meeting link to description
- Add comment with details
```

### Webhook Events to Handle

| Event | Action |
|-------|--------|
| `booking.created` | Update/create task, set status to "Meeting Booked" |
| `booking.rescheduled` | Update task with new time, add comment |
| `booking.cancelled` | Update status, add cancellation comment |

### Webhook Payload (booking.created)

```json
{
  "triggerEvent": "BOOKING_CREATED",
  "createdAt": "2024-01-15T10:30:00Z",
  "payload": {
    "title": "30 Min Meeting",
    "startTime": "2024-01-20T14:00:00Z",
    "endTime": "2024-01-20T14:30:00Z",
    "attendees": [
      {
        "email": "prospect@company.com",
        "name": "John Smith",
        "timeZone": "America/New_York"
      }
    ],
    "organizer": {
      "email": "you@example.com",
      "name": "Your Name"
    },
    "location": "https://zoom.us/j/123456789",
    "additionalNotes": "Looking forward to discussing...",
    "metadata": {
      "responses": {
        "company": "Acme Corp",
        "phone": "+1234567890"
      }
    }
  }
}
```

### ClickUp Task Matching Logic

**Primary Strategy: Email Custom Field**
1. Create custom field "Email" (type: email) on Brokers and Sellers lists
2. Search by custom field value: exact match on `attendee.email`

**Implementation:**
```typescript
async function findTaskByEmail(email: string): Promise<Task | null> {
  // Search in Brokers list
  const brokersResult = await clickUpOperations.getTasks(token, BROKERS_LIST_ID)
  const brokerMatch = brokersResult.tasks.find(task =>
    task.custom_fields?.find(f => f.name === 'Email' && f.value === email)
  )
  if (brokerMatch) return brokerMatch

  // Search in Sellers list
  const sellersResult = await clickUpOperations.getTasks(token, SELLERS_LIST_ID)
  const sellerMatch = sellersResult.tasks.find(task =>
    task.custom_fields?.find(f => f.name === 'Email' && f.value === email)
  )
  if (sellerMatch) return sellerMatch

  return null
}
```

**Fallback: Name-based search**
- If email not found, search by attendee name
- Present matches to user for manual confirmation (via Slack notification)

### Webhook Handler

Create `webapp/src/app/api/webhooks/cal/route.ts`:

```typescript
export async function POST(request: NextRequest) {
  // 1. Verify webhook signature
  const signature = request.headers.get('x-cal-signature')
  if (!verifyCalSignature(signature, body)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 2. Parse payload
  const { triggerEvent, payload } = await request.json()

  // 3. Handle event
  switch (triggerEvent) {
    case 'BOOKING_CREATED':
      await handleBookingCreated(payload)
      break
    case 'BOOKING_RESCHEDULED':
      await handleBookingRescheduled(payload)
      break
    case 'BOOKING_CANCELLED':
      await handleBookingCancelled(payload)
      break
  }

  return NextResponse.json({ success: true })
}
```

### Security: Webhook Signature Verification

Cal.com signs webhooks with HMAC-SHA256. Verify before processing:

```typescript
import crypto from 'crypto'

function verifyCalSignature(signature: string, body: string): boolean {
  const secret = process.env.CALCOM_WEBHOOK_SECRET
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
```

---

## Database Schema Changes

Add to `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN calcom_api_key TEXT;
ALTER TABLE profiles ADD COLUMN calcom_username TEXT;
```

---

## Environment Variables

```env
# Cal.com OAuth (if using OAuth flow)
CALCOM_CLIENT_ID=
CALCOM_CLIENT_SECRET=

# Cal.com Webhook Secret (for signature verification)
CALCOM_WEBHOOK_SECRET=
```

---

## Implementation Order

### Phase 1: Passive Pipeline (Option 2)
1. Add webhook route `/api/webhooks/cal`
2. Implement signature verification
3. Implement `findTaskByEmail()` matching logic
4. Handle `booking.created` event
5. Handle `booking.cancelled` and `booking.rescheduled` events
6. Test with Cal.com webhook simulator

### Phase 2: Active Assistant (Option 1)
1. Add `calcom_api_key` to profiles
2. Create `webapp/src/lib/calcom.ts` API client
3. Add `cal_get_event_types` tool
4. Add `cal_get_booking_link` tool
5. Add `cal_check_availability` tool
6. Update chat system prompt with Cal.com tool documentation

---

## Testing Checklist

### Option 2 Tests
- [ ] Webhook receives booking.created and updates existing task
- [ ] Webhook creates new lead when email not found
- [ ] Webhook handles booking.cancelled correctly
- [ ] Webhook handles booking.rescheduled correctly
- [ ] Invalid signature returns 401
- [ ] Missing attendee email handled gracefully

### Option 1 Tests
- [ ] `cal_get_event_types` returns user's event types
- [ ] `cal_get_booking_link` returns correct URL
- [ ] `cal_check_availability` shows available slots
- [ ] Tools work in chat context ("Include my booking link")

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Multiple tasks with same email | Update most recently modified task |
| Attendee email is organizer's own email | Skip (self-booking) |
| Meeting booked for someone not in CRM | Create new lead in designated "Inbound Leads" list |
| Cal.com webhook retry (duplicate event) | Idempotency check via booking ID |
| ClickUp API rate limit during webhook | Queue and retry with exponential backoff |

---

## Notes

- Cal.com API v2 documentation: https://cal.com/docs/api-reference/v2
- Webhook setup in Cal.com: Settings → Developer → Webhooks
- For enterprise cal.com, the API base URL may differ
