# CRM Manager Roadmap

> Living document tracking feature development and priorities.

---

## Completed

### ClickUp Integration
- [x] OAuth authentication flow
- [x] Workspace/Space/List navigation
- [x] Task CRUD operations
- [x] Custom fields support
- [x] Webhook handling for task events

### Gmail Integration
- [x] OAuth authentication flow
- [x] Send emails via Claude tools
- [x] Gmail watch for incoming emails

### Automations Engine
- [x] Gmail → ClickUp automations (email received → create task)
- [x] ClickUp → Email automations (task updated → send notification)
- [x] Automation management (create, pause, resume, delete)
- [x] Template variables for dynamic content
- [x] Gmail watch auto-renewal (cron job)
- [x] ClickUp webhook cleanup on delete
- [x] Pub/Sub setup documentation

### Web UI
- [x] Dashboard with connection status
- [x] Chat interface with Claude
- [x] Automations list view

---

## In Progress

### Gmail on Autopilot (v1.1)
- [ ] Improved email parsing and extraction
- [ ] Email thread context in automations
- [ ] Reply detection and handling

---

## Upcoming

### Cal.com Integration (v1.2)

**Directive:** `directives/calcom_integration.md`

Two-part integration for meeting scheduling:

#### Part A: Passive Pipeline (Webhook-Based)
Auto-update CRM when meetings are booked.

| Task | Priority | Status |
|------|----------|--------|
| Webhook route `/api/webhooks/cal` | High | Not started |
| Signature verification | High | Not started |
| Task matching by email | High | Not started |
| Handle `booking.created` | High | Not started |
| Handle `booking.cancelled` | Medium | Not started |
| Handle `booking.rescheduled` | Medium | Not started |
| Create lead if not found | Medium | Not started |

#### Part B: Active Assistant (Tool-Based)
Let users insert booking links and check availability via chat.

| Task | Priority | Status |
|------|----------|--------|
| `calcom.ts` API client | Medium | Not started |
| `cal_get_event_types` tool | Medium | Not started |
| `cal_get_booking_link` tool | Medium | Not started |
| `cal_check_availability` tool | Low | Not started |
| API key storage in profiles | Medium | Not started |

**Dependencies:**
- Email custom field must exist on Brokers/Sellers lists
- Cal.com webhook secret configured

---

## Future Considerations

### LinkedIn Integration
- Sync connections to CRM
- Track outreach and responses
- Auto-create leads from connection requests

### Deal Pipeline
- Stage tracking (Lead → Qualified → Proposal → Closed)
- Automated stage progression based on activity
- Deal value and probability tracking

### Reporting Dashboard
- Automation run history and success rates
- Email open/response tracking
- Meeting conversion metrics

### Multi-User Support
- Team workspaces
- Shared automations
- Role-based permissions

### Mobile App
- Push notifications for high-priority updates
- Quick actions (update status, add comment)
- Voice-to-task creation

---

## Technical Debt

| Item | Impact | Effort | Status |
|------|--------|--------|--------|
| Add rate limiting to webhook handlers | Medium | Low | Not started |
| Implement webhook retry queue | Medium | Medium | Not started |
| Add comprehensive error logging | High | Low | Not started |
| Write integration tests for automations | High | Medium | Not started |
| Document API endpoints | Low | Low | Not started |

---

## Recently Completed Fixes

### Automations Reliability (2025-01-16)
- **Gmail watch renewal**: Added `/api/cron/renew-gmail-watches` endpoint with Vercel cron config
- **Webhook cleanup**: DELETE handler now removes ClickUp webhooks and stops Gmail watches
- **Pub/Sub documentation**: Created `directives/gmail_pubsub_setup.md` with full setup guide

---

## How to Use This Document

1. **Adding features**: Create a directive first, then add to Upcoming
2. **Starting work**: Move from Upcoming to In Progress, update task status
3. **Completing work**: Move to Completed with date
4. **Prioritization**: High = blocks user value, Medium = improves UX, Low = nice to have

Last updated: 2025-01-16
