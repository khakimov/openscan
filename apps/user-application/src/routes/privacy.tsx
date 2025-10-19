import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16 lg:px-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">1. Introduction</h2>
              <p>
                sec.rocks ("we", "our", or "us") is committed to protecting your privacy. This Privacy
                Policy explains how we collect, use, disclose, and safeguard your information when you
                use our security scanning and asset discovery platform.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold mt-4">2.1 Account Information</h3>
              <p>When you create an account, we collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Name and email address</li>
                <li>Organization details</li>
                <li>Authentication credentials (securely hashed)</li>
                <li>Account preferences and settings</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">2.2 Scanning Data</h3>
              <p>When you use our scanning services, we collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Target domains and IP addresses you submit for scanning</li>
                <li>Scan results including discovered subdomains, open ports, and services</li>
                <li>Vulnerability findings and security assessments</li>
                <li>Scan history and configurations</li>
              </ul>

              <h3 className="text-xl font-semibold mt-4">2.3 Usage Information</h3>
              <p>We automatically collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Log data (IP addresses, browser type, access times)</li>
                <li>Usage patterns and feature interactions</li>
                <li>Performance metrics and error reports</li>
                <li>Analytics data to improve our services</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">3. How We Use Your Information</h2>
              <p>We use the collected information to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide and maintain our security scanning services</li>
                <li>Process and execute scan requests</li>
                <li>Send security alerts and notifications</li>
                <li>Improve and optimize our platform</li>
                <li>Detect and prevent security threats and abuse</li>
                <li>Comply with legal obligations</li>
                <li>Communicate with you about your account and services</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">4. Data Storage and Security</h2>
              <p>
                We implement industry-standard security measures to protect your data:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Encryption in transit (TLS/SSL) and at rest</li>
                <li>Regular security audits and penetration testing</li>
                <li>Access controls and authentication mechanisms</li>
                <li>Secure cloud infrastructure with redundancy</li>
                <li>Regular backups and disaster recovery procedures</li>
              </ul>
              <p className="mt-4">
                Your scan data is stored on secure servers and retained according to your subscription
                plan and applicable data retention requirements.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">5. Data Sharing and Disclosure</h2>
              <p>We do not sell your personal information. We may share data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>With your consent:</strong> When you explicitly authorize us to share
                  information
                </li>
                <li>
                  <strong>Service providers:</strong> With trusted third-party services that help us
                  operate our platform (cloud hosting, analytics, payment processing)
                </li>
                <li>
                  <strong>Legal requirements:</strong> When required by law, regulation, legal process,
                  or governmental request
                </li>
                <li>
                  <strong>Business transfers:</strong> In connection with a merger, acquisition, or sale
                  of assets
                </li>
                <li>
                  <strong>Protection:</strong> To protect our rights, privacy, safety, or property, and
                  that of our users or the public
                </li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">6. Your Rights and Choices</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access and review your personal information</li>
                <li>Correct inaccurate or incomplete data</li>
                <li>Request deletion of your account and associated data</li>
                <li>Export your scan data</li>
                <li>Opt-out of marketing communications</li>
                <li>Object to certain data processing activities</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, please contact us at{" "}
                <a href="mailto:privacy@sec.rocks" className="text-primary hover:underline">
                  privacy@sec.rocks
                </a>
                .
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">7. Data Retention</h2>
              <p>
                We retain your information for as long as necessary to provide our services and fulfill
                the purposes outlined in this policy. Scan data is retained based on your subscription
                plan. After account deletion, we may retain certain information as required by law or
                for legitimate business purposes.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">8. Cookies and Tracking</h2>
              <p>
                We use cookies and similar tracking technologies to enhance your experience, analyze
                usage, and provide personalized features. You can control cookie preferences through
                your browser settings, though some features may not function properly if cookies are
                disabled.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">9. Third-Party Services</h2>
              <p>
                Our platform may integrate with or link to third-party services. This Privacy Policy
                does not apply to third-party websites or services. We encourage you to review the
                privacy policies of any third-party services you access.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">10. International Data Transfers</h2>
              <p>
                Your information may be transferred to and processed in countries other than your
                country of residence. We ensure appropriate safeguards are in place to protect your data
                in accordance with this Privacy Policy.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">11. Children's Privacy</h2>
              <p>
                Our services are not directed to individuals under the age of 18. We do not knowingly
                collect personal information from children. If you believe we have collected information
                from a child, please contact us immediately.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">12. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of material
                changes by posting the updated policy on this page and updating the "Last updated" date.
                Your continued use of our services after changes constitutes acceptance of the updated
                policy.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">13. Contact Us</h2>
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or our data
                practices, please contact us at:
              </p>
              <div className="mt-4 space-y-1">
                <p>
                  Email:{" "}
                  <a href="mailto:privacy@sec.rocks" className="text-primary hover:underline">
                    privacy@sec.rocks
                  </a>
                </p>
                <p>Website: sec.rocks</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
