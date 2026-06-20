export default function Header({ brandName, onHome, onNavView }) {
  return (
    <header className="site-header">
      <a
        className="brand"
        href="/"
        aria-label={`${brandName} home`}
        onClick={(event) => {
          event.preventDefault()
          onHome()
        }}
      >
        <img
          className="brand-logo"
          src={`${import.meta.env.BASE_URL}icon-192.png`}
          alt="Wrenchable Cars logo"
        />
        <span>{brandName}</span>
      </a>
      <nav className="main-nav" aria-label="Primary navigation">
        <a href="/#search" onClick={(event) => onNavView(event, 'search', 'search')}>
          Search
        </a>
        <a
          href="/#how-it-works"
          onClick={(event) => onNavView(event, 'search', 'how-it-works')}
        >
          How it works
        </a>
      </nav>
    </header>
  )
}
