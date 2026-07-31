import { Link, useNavigate } from 'react-router-dom';

const Chevron = () => (
  <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
    <path
      d="M9.5 1.5 L2 9 L9.5 16.5"
      stroke="#f5f5f7"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function NavBar({
  title,
  back,
  home,
  action,
}: {
  title: string;
  back?: boolean;
  /** For the pages with no nav of their own: a way out that still works when
   *  the URL was pasted in and there is no history to go back through. */
  home?: boolean;
  /** Optional 34px action button rendered in the right slot (keeps the title centered). */
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="navbar">
      {back ? (
        <button className="navbar-back" onClick={() => navigate(-1)} aria-label="Back">
          <Chevron />
        </button>
      ) : home ? (
        <Link className="navbar-back" to="/" aria-label="Arcade">
          <Chevron />
        </Link>
      ) : (
        <span className="navbar-spacer" />
      )}
      <span className="navbar-title">{title}</span>
      {action ?? <span className="navbar-spacer" />}
    </header>
  );
}
