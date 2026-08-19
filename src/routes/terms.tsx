import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Dallty" },
      {
        name: "description",
        content: "The terms that govern your use of Dallty's booking platform.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: TermsPage,
});

const LAST_UPDATED = "August 20, 2026";

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link to="/" className="text-sm font-semibold text-primary hover:underline">
        ← Back to Dallty
      </Link>

      <h1 className="mt-6 text-3xl font-extrabold">Terms of Use</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="prose prose-sm mt-8 max-w-none space-y-6 text-sm leading-relaxed text-foreground">
        <p>
          These Terms of Use ("Terms") govern your access to and use of Dallty's website and apps
          (the "Service"), operated by Dallty ("Dallty", "we", "us"). By creating an account or
          using the Service, you agree to these Terms. If you do not agree, please do not use the
          Service.
        </p>

        <section>
          <h2 className="text-lg font-bold">1. What Dallty is</h2>
          <p>
            Dallty is a booking platform that lets customers discover appointment-based businesses
            (salons, barbershops, spas, and similar) and book appointments with them. Dallty is not
            itself a salon, barbershop, or spa — the businesses listed on Dallty are independent
            operators responsible for the services they provide.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">2. Accounts</h2>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              You must provide accurate information when creating an account and keep it up to date.
            </li>
            <li>
              You are responsible for maintaining the security of your account and for all activity
              under it.
            </li>
            <li>You must be able to lawfully enter into these Terms to create an account.</li>
            <li>
              We may suspend or terminate an account that violates these Terms, is used
              fraudulently, or poses a risk to other users or businesses.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">3. Bookings</h2>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              A booking is a request to be served by the chosen business at the selected time.
              Confirmation, rescheduling, and cancellation policies (including any deposit or
              cancellation fee) are set by each business and shown before you confirm.
            </li>
            <li>
              Dallty helps facilitate the booking but is not a party to the service arrangement
              between you and the business.
            </li>
            <li>
              Repeated no-shows or abusive behavior may result in restricted access to booking on
              Dallty.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">4. Payments</h2>
          <p>
            Payment terms (cash on arrival, deposits, or other methods a business enables) are set
            by the individual business and shown to you before you confirm a booking. Dallty does
            not store your payment card details. Refunds and disputes about payment for services
            rendered are handled directly with the business, except where Dallty facilitated a
            deposit payment, in which case Dallty's refund policy for that payment applies as shown
            at checkout.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">5. Businesses using Dallty</h2>
          <p>If you register a business on Dallty, you additionally agree that:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              The information you list (services, prices, hours, staff) is accurate and kept up to
              date.
            </li>
            <li>
              You are responsible for honoring bookings made through Dallty and for the quality and
              safety of the services you provide.
            </li>
            <li>
              You will handle customer personal information you receive through Dallty (name,
              contact details, booking history) lawfully and only for the purpose of providing the
              booked service.
            </li>
            <li>
              Dallty may charge fees or offer paid plans for business features, as described
              separately when you sign up.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">6. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Use the Service for any unlawful purpose, or to harass, defraud, or harm another user
              or business.
            </li>
            <li>
              Attempt to bypass, disable, or interfere with the security or normal operation of the
              Service.
            </li>
            <li>Scrape, copy, or resell data from the Service without our written permission.</li>
            <li>Post false, misleading, or defamatory reviews or content.</li>
            <li>
              Impersonate another person or business, or create an account on behalf of someone
              without authorization.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold">7. Content and reviews</h2>
          <p>
            You retain ownership of content you submit (such as reviews or profile photos), but
            grant Dallty a license to host, display, and distribute it as part of operating the
            Service. We may remove content that violates these Terms or our community guidelines.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">8. Disclaimers</h2>
          <p>
            The Service is provided "as is." Dallty does not guarantee that businesses listed on the
            platform will meet your expectations, and is not responsible for the acts or omissions
            of any business or user. To the fullest extent permitted by law, Dallty disclaims all
            warranties, express or implied, regarding the Service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">9. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Dallty will not be liable for indirect,
            incidental, or consequential damages arising from your use of the Service, or from any
            service provided by a business you booked through Dallty. Our total liability for any
            claim relating to the Service is limited to the amount, if any, you paid to Dallty in
            the 12 months before the claim arose.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">10. Changes to the Service or these Terms</h2>
          <p>
            We may update these Terms from time to time. If we make material changes, we will update
            the date at the top of this page and, where appropriate, notify you. Continuing to use
            the Service after changes take effect means you accept the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold">11. Contact us</h2>
          <p>
            Questions about these Terms can be sent to{" "}
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
