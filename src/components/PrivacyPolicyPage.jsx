export default function PrivacyPolicyPage({ onBack }) {
  return (
    <main id="top">
      <section className="privacy-section">
        <article className="privacy-card">
          <p className="eyebrow">wrenchablecars.com</p>
          <h1>Privacy Policy</h1>
          <p className="privacy-effective-date">Effective Date: June 19, 2026</p>
          <p>
            Wrenchable Cars respects your privacy. This Privacy Policy explains
            what information may be collected when you use wrenchablecars.com
            and how that information may be used.
          </p>

          <h2>1. Information We Collect</h2>
          <p>
            Wrenchable Cars does not currently require users to create an
            account, log in, or submit personal information to use the site.
          </p>
          <p>
            The site may collect limited technical information automatically,
            such as browser type, device type, approximate location, pages
            visited, referring pages, and basic usage information. This
            information may be collected through hosting services, analytics
            tools, advertising services, cookies, or similar technologies.
          </p>

          <h2>2. Cookies and Similar Technologies</h2>
          <p>
            Wrenchable Cars may use cookies, local storage, and similar
            technologies to support site functionality, remember preferences,
            measure site usage, and display advertising.
          </p>
          <p>
            You can control or disable cookies through your browser settings.
            Some parts of the site may not work as intended if cookies are
            disabled.
          </p>

          <h2>3. Advertising</h2>
          <p>
            Wrenchable Cars may display advertisements through Google AdSense or
            other advertising partners.
          </p>
          <p>
            Third-party vendors, including Google, may use cookies or similar
            technologies to serve ads based on a user's prior visits to this
            site or other websites. These technologies help provide, measure,
            and personalize advertisements.
          </p>
          <p>
            Users may be able to manage Google advertising preferences through
            Google's ad settings and related privacy tools.
          </p>

          <h2>4. Consent for Users in Certain Regions</h2>
          <p>
            For users in the European Economic Area, the United Kingdom, and
            Switzerland, Wrenchable Cars may display a consent message to
            request permission for certain advertising cookies and related data
            uses. Users can accept, reject, or manage their choices through that
            consent message when available.
          </p>

          <h2>5. Third-Party Services</h2>
          <p>
            Wrenchable Cars may use third-party services to host the site,
            provide database services, measure usage, improve performance, and
            display advertisements. These third parties may process limited
            technical information according to their own privacy policies.
          </p>
          <p>Examples may include:</p>
          <ul>
            <li>GitHub Pages or other hosting providers</li>
            <li>Supabase or other database/service providers</li>
            <li>Google AdSense or other advertising services</li>
          </ul>

          <h2>6. Vehicle Data and Scores</h2>
          <p>
            Wrenchable Cars provides vehicle repair and maintenance difficulty
            information for informational purposes. The site's vehicle scores
            are based on available repair labor-time data and calculations
            performed by Wrenchable Cars. Using the site does not require users
            to submit personal vehicle ownership information.
          </p>

          <h2>7. Data Security</h2>
          <p>
            We use reasonable technical and organizational measures to protect
            the site and related systems. However, no website or internet
            transmission is completely secure, and we cannot guarantee absolute
            security.
          </p>

          <h2>8. Children's Privacy</h2>
          <p>
            Wrenchable Cars is not intended for children under 13. We do not
            knowingly collect personal information from children under 13.
          </p>

          <h2>9. Links to Other Websites</h2>
          <p>
            The site may contain links to third-party websites. Wrenchable Cars
            is not responsible for the privacy practices or content of those
            websites.
          </p>

          <h2>10. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Updates will be
            posted on this page with a new effective date.
          </p>

          <h2>11. Contact</h2>
          <p>
            If you have questions about this Privacy Policy, contact us through
            the contact method provided on wrenchablecars.com.
          </p>

          <button className="secondary-button privacy-back-button" type="button" onClick={onBack}>
            Back to Wrenchable Cars
          </button>
        </article>
      </section>
    </main>
  )
}
