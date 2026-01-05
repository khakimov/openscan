Notification Domains

- Vulnerability findings – new/rediscovered/fixed CVEs for apps & OS (e.g. CRITICAL_NEW, VULNERABLE_FIX_OS) with risk-based priority scores.
  (footprint_app/notifications/messages.py:21)
- Configuration drift – server IP changes, app/OS version swaps, web title edits, manual app edits/reverts. (footprint_app/notifications/messages.py:40)
- DNS & asset inventory – missing/mismatched A/PTR, unavailable/available DNS records, hostname discoveries, new devices/webapps runtimes. (footprint_app/
  notifications/messages.py:84)
- Availability state – service up/down alerts for monitored applications (UP_APP, DOWN_APP). (footprint_app/notifications/messages.py:122)
- Task lifecycle & platform ops – scan start/finish/cancel/stop, delete jobs, context generation, deployment stop-all, asset import outcomes, no-open-port
  failures. (footprint_app/notifications/messages.py:128)
- Agent lifecycle & health – agent install/up/down/error, version updates, hostname/IP changes, restart required, antimalware/firewall missing, AD
  connectivity, resource shortages, Powershell missing, patch collection errors. (footprint_app/notifications/messages.py:189)
- Internal scanner install – progress/failed/success/restart-required variations for the internal scanner rollout. (footprint_app/notifications/
  messages.py:251)
- Email delivery – remediation/technical/contextual report dispatch confirmations. (footprint_app/notifications/messages.py:295)
- Scan anomalies – unauthenticated scan after authenticated run, no open ports for advanced scanner. (footprint_app/notifications/messages.py:94, 301)
- Threat intelligence – “New EVE” early vulnerability/exposure notifications. (footprint_app/notifications/messages.py:172)
- Cleanup/maintenance – platform-wide delete jobs (orgs, contexts, notifications, hostnames, Nessus imports) and “everything wiped” alerts.
  (footprint_app/notifications/messages.py:134)

All of these feed through Notification.create_notification and surface via the console/tRPC APIs; priorities map to HIGH/MEDIUM/LOW bands in
NotificationsController.
