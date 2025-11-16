# Future Enhancements

### Phase 2: Advanced Features

#### 1. Email Delivery
- Transactional emails for CRITICAL/HIGH severity
- Plain text template (MVP)
- HTML template with branding (Phase 3)
- Cloudflare Email Workers binding

#### 2. Notification Catalog Integration
- Refactor change detector to use catalog functions
- Remove inline message strings
- Centralize all copy in catalog module

#### 3. Message Hashing (Secondary Deduplication)
- Hash final message as secondary fingerprint
- Protects against accidental fingerprint divergence
- Legacy pattern from footprint system

#### 4. Partial Unique Index
- Switch to `WHERE suppressUntil > CURRENT_TIMESTAMP`
- Allows fingerprint reuse after suppress window expires
- Custom SQL migration (requires SQLite 3.15+)

#### 5. User Preferences
- Per-user notification settings
- Channel preferences (email, Slack, SMS)
- Severity thresholds
- Quiet hours
- Device watch list

#### 6. Webhook Integrations
- Slack incoming webhooks
- Discord webhooks
- PagerDuty integration
- Custom HTTP endpoints

#### 7. Digest Mode
- Daily/weekly email rollups
- Group by device, severity, type
- Scheduled via Cloudflare Cron Triggers

#### 8. Rate Limiting Enhancements
- Per-device daily caps (10/day)
- Auto-suppress noisy devices
- Anomaly detection

#### 9. Notification History
- Archive read notifications after 60-90 days
- Notification timeline view
- Diff viewer
- Acknowledgment workflow

#### 10. Extended Change Detection
- Httpx artifact changes
- Screenshot diffs
- Discovery scan changes
- Certificate expiration warnings

---
