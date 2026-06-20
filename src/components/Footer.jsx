export default function Footer({ onPrivacyClick }) {
  return (
    <footer className="site-footer">
      <p>
        Wrenchable Cars helps shoppers compare repair complexity before they buy.
        Labor-time data provided by{' '}
        <a
          href="https://openlaborproject.com"
          target="_blank"
          rel="noreferrer"
        >
          Open Labor Project
        </a>
        . Scores and ratings are calculated by Wrenchable Cars.
      </p>
      <div className="footer-links">
        <a href="/privacy" onClick={onPrivacyClick}>Privacy Policy</a>
      </div>
    </footer>
  )
}
