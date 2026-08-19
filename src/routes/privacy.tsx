import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Dallty" },
      {
        name: "description",
        content: "How Dallty collects, uses, and protects your personal information.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "August 20, 2026";

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        ← Back to Dallty
      </Link>

      <h1 className="mt-6 text-3xl font-extrabold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground">
        <p>
          Dallty ("Dallty", "we", "us") provides a booking platform that connects customers with
          appointment-based businesses (salons, barbershops, spas, and similar). This policy
          explains what personal information we collect, why, and how it is handled when you use
          dallty.com or the Dallty apps.
        </p>

        <section>
          <h2 className="text-lg font-bold">1. Information we collect</h2>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Account information:</strong> name, phone number, email address, and (for
              password-based accounts) a securely hashed password. You may sign in with a phone
              number, email, Google, or Apple account.
            </li>
            <li>
              <strong>Booking information:</strong> the services, businesses, specialists, and
              appointment times you book, and your booking history.
            </li>
            <li>
              <strong>Profile details you choose to add:</strong> preferences such as skin type,
              hair type, allergies, or notes you add to help a business serve you.
            </li>
            <li>
              <strong>Business information:</strong> if you register a business on Dallty, we
              collect your business name, address, contact details, staff information, and the
              services and prices you list.
            </li>
            <li>
              <strong>Location information:</strong> if you allow it, your approximate location is
              used to show nearby businesses and estimate travel time, via Google Maps.
            </li>
            <li>
              <strong>Device and usage information:</strong> standard technical data such as IP
              address, browser type, and pages visited, collected automatically to keep the service
              secure and working correctly.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">2. How we use your information</h2>
          <ul className="ml-5 list-disc space-y-1">
            <li>To create and secure your account, and to verify your identity at sign-in.</li>
            <li>
              To let you search for and book appointments, and to send booking confirmations,
              reminders, and updates.
            </li>
            <li>
              To let a business you book with see the booking details and contact information needed
              to serve you.
            </li>
            <li>To respond to support requests and communicate important service updates.</li>
            <li>To detect and prevent fraud, abuse, and security incidents.</li>
            <li>To improve Dallty's features and reliability.</li>
          </ul>
          <p className="mt-2">
            We do not sell your personal information, and we do not use it for third-party
            advertising.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">3. Who we share information with</h2>
          <p>We share information only as needed to provide the service:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>The business you book with</strong> sees your name, contact details, and
              booking details for that appointment. Businesses are independent operators responsible
              for how they use your information in connection with your visit.
            </li>
            <li>
              <strong>Service providers</strong> who process data on our behalf under contract,
              including Supabase (database, authentication, and file storage), Resend (transactional
              email delivery), Twilio (SMS verification codes), and Google (maps, travel-time
              estimates, and Google sign-in). Each is used only for the specific function it
              performs for Dallty.
            </li>
            <li>
              <strong>Legal and safety purposes:</strong> if required by law, or to protect the
              rights, safety, or property of Dallty, our users, or the public.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">4. Payments</h2>
          <p>
            Dallty does not process card payments or store payment card details. Depending on the
            business, payment for a booking is handled in person (cash) or, where a business enables
            it, a deposit policy they configure. Any future online payment processing will be
            handled by a licensed, PCI-compliant payment provider — Dallty itself never stores full
            card numbers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">5. Data retention</h2>
          <p>
            We keep account and booking information for as long as your account is active, and
            afterward for as long as needed to comply with legal, tax, and accounting obligations,
            resolve disputes, and enforce our agreements. You can request deletion of your account
            as described in Section 7.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">6. Security</h2>
          <p>
            We use industry-standard safeguards to protect your information, including encrypted
            connections, access controls, and row-level database security so that one business can
            never see another business's private data. No method of transmission or storage is 100%
            secure, but we work to protect your information and to respond quickly if something goes
            wrong.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">7. Your choices and rights</h2>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              You can review and update your profile information at any time from your account
              settings.
            </li>
            <li>
              You can ask us to delete your account and associated personal data, subject to
              information we must retain for legal or accounting reasons.
            </li>
            <li>You can control notification preferences from your account settings.</li>
            <li>
              Depending on where you live, you may have additional rights to access, correct, or
              export your data.
            </li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:support@dallty.com" className="text-primary hover:underline">
              support@dallty.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">8. Children's privacy</h2>
          <p>
            Dallty is not directed at children under 16, and we do not knowingly collect personal
            information from them. If you believe a child has provided us with personal information,
            please contact us and we will remove it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">9. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. If we make material changes, we will update
            the date at the top of this page and, where appropriate, notify you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">10. Contact us</h2>
          <p>
            Questions about this policy or your personal information can be sent to{" "}
            <a href="mailto:support@dallty.com" className="text-primary hover:underline">
              support@dallty.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
