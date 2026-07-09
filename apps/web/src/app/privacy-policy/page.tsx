import type { Metadata } from "next";
import { LegalShell, Section, SubSection, P, List } from "@/components/legal/LegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy — OfferBee",
  description:
    "How OfferBee collects, uses, shares, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="July 8, 2026">
      <P>
        This Privacy Policy describes how OfferBee, Inc. (&ldquo;OfferBee&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses,
        shares, and protects your personal information when you use the OfferBee
        application and our website at offerbee.ai, together with any related
        products and services (collectively, the &ldquo;Service&rdquo;). By using
        the Service, you consent to the practices described in this Policy. If you
        do not agree with this Policy, please do not use the Service.
      </P>
      <P>
        <strong>The short version:</strong> OfferBee helps you track statement
        credits, benefits, and annual-fee value across your credit cards.{" "}
        <strong>OfferBee does not collect your full credit card number, and
        OfferBee does not sell your personal information.</strong>
      </P>

      <Section>1. Information We Collect</Section>
      <SubSection>Information you provide to us</SubSection>
      <P>
        We collect information you provide directly, such as your name, email
        address, and account credentials when you register; the credit cards you
        choose to add or track; the credits and benefits you mark as used; and any
        messages or Feedback you send us.
      </P>
      <SubSection>Card and transaction information</SubSection>
      <P>
        To surface the perks on your cards and estimate the value you&rsquo;ve
        captured, we process information about the cards you add and, where you
        choose to connect an account through a third-party provider, limited
        transaction and benefit data associated with those accounts.{" "}
        <strong>We do not collect or store your full credit card number.</strong>{" "}
        Where account connections are made through a third-party aggregator, your
        credentials are handled by that provider under its own security practices.
      </P>
      <SubSection>Information we collect automatically</SubSection>
      <P>
        When you use the Service, we automatically collect certain information,
        including device and app identifiers, log data, IP address, browser type,
        pages or screens viewed, and usage patterns. We use cookies and similar
        technologies as described in Section 6.
      </P>

      <Section>2. How We Use Your Information</Section>
      <P>We use the information we collect to:</P>
      <List>
        <li>provide, operate, maintain, and improve the Service;</li>
        <li>
          surface the credits and benefits on your cards, track what you&rsquo;ve
          used, send reminders before credits reset, and estimate fee-versus-value;
        </li>
        <li>create and manage your Account and process any Subscriptions;</li>
        <li>
          communicate with you, including about updates, security alerts, and
          support requests;
        </li>
        <li>
          personalize your experience and develop new features and analytics;
        </li>
        <li>
          detect, investigate, and prevent fraudulent, unauthorized, or illegal
          activity, and protect the rights, property, and safety of OfferBee and
          others; and
        </li>
        <li>comply with our legal obligations.</li>
      </List>
      <P>
        We process your information based on your consent, our contract with you,
        our legitimate business interests, and our legal obligations.
      </P>

      <Section>3. How We Share Your Information</Section>
      <P>
        We share personal information only in the following circumstances:
      </P>
      <List>
        <li>
          <strong>Service providers.</strong> With vendors and partners who
          perform services on our behalf, such as hosting, analytics, account
          aggregation, payment processing, and customer support, under
          obligations of confidentiality.
        </li>
        <li>
          <strong>Legal and safety.</strong> When we believe disclosure is
          required by law, regulation, legal process, or governmental request, or
          to protect the rights, property, or safety of OfferBee, our users, or
          the public.
        </li>
        <li>
          <strong>Business transfers.</strong> In connection with a merger,
          acquisition, financing, reorganization, or sale of assets, or in the
          event of insolvency.
        </li>
        <li>
          <strong>With your consent.</strong> When you direct us to share your
          information or otherwise consent to the sharing.
        </li>
      </List>
      <P>
        <strong>OfferBee does not sell your personal information</strong> and does
        not share it with third parties for their own independent marketing
        without your consent.
      </P>

      <Section>4. Data Retention</Section>
      <P>
        We retain your personal information for as long as your Account is active
        or as needed to provide the Service, and thereafter for as long as
        necessary to comply with our legal obligations, resolve disputes, and
        enforce our agreements. When information is no longer needed, we will
        delete or de-identify it. You may request deletion of your Account and
        associated data as described in Section 7.
      </P>

      <Section>5. Security</Section>
      <P>
        We maintain reasonable administrative, technical, and physical safeguards
        designed to protect your personal information. However, no method of
        transmission over the internet or electronic storage is 100% secure, and
        we cannot guarantee absolute security. You are responsible for keeping
        your Account credentials confidential.
      </P>

      <Section>6. Cookies and Tracking Technologies</Section>
      <P>
        We and our partners use cookies and similar technologies to operate the
        Service, remember your preferences, measure performance, and understand how
        the Service is used. You can set your browser to refuse cookies or alert
        you when cookies are being sent; however, some parts of the Service may not
        function properly without them. Where required by law, we obtain your
        consent before using non-essential cookies.
      </P>

      <Section>7. Your Rights and Choices</Section>
      <SubSection>All users</SubSection>
      <P>
        You may access and update certain Account information within the Service,
        and you may opt out of promotional emails by following the unsubscribe
        instructions in those messages. You may request that we delete your Account
        and associated personal information by contacting us at
        privacy@offerbee.ai.
      </P>
      <SubSection>California residents</SubSection>
      <P>
        If you are a California resident, the California Consumer Privacy Act (as
        amended) gives you the right to request information about the personal
        information we have collected about you, to request deletion of your
        personal information, to correct inaccurate information, and to not be
        discriminated against for exercising these rights. Because we do not sell
        or share personal information for cross-context behavioral advertising, no
        opt-out of sale is required. We will respond to verifiable requests within
        the timeframe required by law (generally 45 days).
      </P>
      <SubSection>EU/EEA and UK residents</SubSection>
      <P>
        If you are located in the European Economic Area or the United Kingdom,
        you have the right to access, correct, delete, restrict, or object to our
        processing of your personal data, and the right to data portability. You
        also have the right to lodge a complaint with your local data protection
        authority. Where we transfer your data to the United States or other
        countries, we rely on appropriate safeguards and, where applicable, your
        consent.
      </P>
      <P>
        To exercise any of these rights, contact us at privacy@offerbee.ai. We may
        need to verify your identity before fulfilling your request.
      </P>

      <Section>8. Children&rsquo;s Privacy</Section>
      <P>
        The Service is not directed to children under 18, and we do not knowingly
        collect personal information from children under 18. If you believe a child
        has provided us with personal information, please contact us and we will
        take steps to delete it.
      </P>

      <Section>9. Third-Party Services</Section>
      <P>
        The Service may contain links to, or integrate with, third-party websites
        and services, including your card issuers and account aggregators. This
        Policy does not apply to those third parties, and we are not responsible
        for their privacy practices. We encourage you to review the privacy
        policies of any third party before providing your information to them.
      </P>

      <Section>10. Changes to This Policy</Section>
      <P>
        We may update this Privacy Policy from time to time. When we make material
        changes, we will update the &ldquo;Last updated&rdquo; date above and, where
        required, provide additional notice. Your continued use of the Service after
        the changes take effect signifies your acceptance of the updated Policy.
      </P>

      <Section>11. Contact Us</Section>
      <P>
        If you have any questions about this Privacy Policy or our data practices,
        please contact us at:
      </P>
      <P>
        OfferBee, Inc.
        <br />
        Email:{" "}
        <a
          href="mailto:contact@offerbee.ai"
          className="text-accent underline underline-offset-2"
        >
          contact@offerbee.ai
        </a>
      </P>
    </LegalShell>
  );
}
