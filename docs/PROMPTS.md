> Need a quick dive on <feature/topic> inside legacy (/Users/nailert/Projects/current/h/new_project/legacy_nov/app/back).
>
> 1. Pinpoint the canonical module(s) and entry points.
> 2. Trace core flow (key functions/classes, dependencies, data/load order).
> 3. Capture how persistence works (models, tables, query helpers).
> 4. Note any integration points (celery tasks, scanners, APIs) or invariants.

Reference format

- Files: relative/path/to/file.py:Line
- Snippets: fenced block with language, ≤10 lines.

Example:

scanners/discovery/assets_controller.py:86

```python
def process_domain(...):
    ns_lookup_any = dns_resolver.query_ANY(name)
    ips_list = ns_lookup_any['A']
    ...

Deliver a concise summary + bullets for follow-up questions/risks.


----
```

Need a tight research brief on the legacy DNS resolution flow (/Users/nailert/Projects/current/h/new_project/legacy_nov/app/back):

1. Identify the authoritative modules & entry points that turn a domain/IP into stored entities.
2. Trace the end-to-end logic (key functions/classes, dependencies, load order).
3. Document the persistence layer: models/tables used, how forward & reverse lookups are saved.
4. Call out integration points (scanners, celery tasks, APIs) and any invariants we must preserve.

Use path/to/file.py:Line for references and ≤10‑line fenced code snippets where helpful. Finish with a crisp summary plus bullets for open risks or
migration questions.
