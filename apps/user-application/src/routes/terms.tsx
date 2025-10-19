import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16 lg:px-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
              <p>
                By accessing and using sec.rocks ("Service"), you accept and agree to be bound by the
                terms and provision of this agreement. If you do not agree to these terms, please do not
                use the Service.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">2. Description of Service</h2>
              <p>
                sec.rocks provides security scanning and asset discovery services, including but not
                limited to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Subdomain discovery and reconnaissance</li>
                <li>Port scanning and service detection</li>
                <li>Vulnerability identification</li>
                <li>Asset inventory management</li>
                <li>Security monitoring and alerts</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">3. User Responsibilities</h2>
              <p>You agree to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Only scan domains, networks, and systems that you own or have explicit written
                  permission to test
                </li>
                <li>Comply with all applicable laws and regulations</li>
                <li>Not use the Service for any illegal or unauthorized purpose</li>
                <li>Not attempt to gain unauthorized access to any systems or networks</li>
                <li>Maintain the security of your account credentials</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">4. Authorized Use</h2>
              <p>
                You represent and warrant that you have the legal authority to scan all targets you
                submit to our Service. Unauthorized scanning may violate federal and state laws,
                including the Computer Fraud and Abuse Act. We reserve the right to suspend or
                terminate accounts that we believe are being used for unauthorized scanning.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">5. Data and Privacy</h2>
              <p>
                Your use of the Service is also governed by our Privacy Policy. We collect and process
                data as described in the Privacy Policy to provide and improve our services.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">6. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by sec.rocks
                and are protected by international copyright, trademark, patent, trade secret, and other
                intellectual property laws.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">7. Limitation of Liability</h2>
              <p>
                The Service is provided "as is" without warranties of any kind. We shall not be liable
                for any damages arising from the use or inability to use the Service, including but not
                limited to direct, indirect, incidental, punitive, and consequential damages.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">8. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless sec.rocks and its affiliates from any claims,
                damages, losses, liabilities, and expenses arising from your use of the Service or
                violation of these Terms.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">9. Termination</h2>
              <p>
                We reserve the right to terminate or suspend your account and access to the Service at
                our sole discretion, without notice, for conduct that we believe violates these Terms or
                is harmful to other users, us, or third parties, or for any other reason.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">10. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will notify users of any
                material changes by posting the new Terms on this page and updating the "Last updated"
                date.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">11. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the United
                States, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold">12. Contact Information</h2>
              <p>
                If you have any questions about these Terms, please contact us at{" "}
                <a href="mailto:legal@sec.rocks" className="text-primary hover:underline">
                  legal@sec.rocks
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
