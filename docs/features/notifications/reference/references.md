# References

### Related Documentation

- [Postback Architecture](../../../architecture/backend/postback-architecture.md)
- [Legacy Notification System](../legacy/legacy-notifications.md)
- [CVE Enrichment](../../../operations/cve-enrichment-integration.md)

### Related Files

- Port scan handler: `apps/user-application/src/server/postback/handlers/port-scan.ts`
- Change detector: `apps/user-application/src/server/notifications/change-detector.ts`
- Notification catalog: `packages/data-ops/src/notifications/catalog.ts`
- Data-ops queries: `packages/data-ops/src/queries/notifications/`
- Schema: `packages/data-ops/src/schema/notifications.ts`
- Server functions: `apps/user-application/src/server/notifications.ts`
- UI components: `apps/user-application/src/components/notifications/`

### External Resources

- [TanStack Query Docs](https://tanstack.com/query/latest)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/email-workers/)
- [CVSS Severity Ratings](https://nvd.nist.gov/vuln-metrics/cvss)

---

**Last Updated**: 2025-11-09
**Status**: ✅ MVP Complete - Ready for end-to-end testing
**Next Action**: Run full scan → verify notifications → test deduplication
