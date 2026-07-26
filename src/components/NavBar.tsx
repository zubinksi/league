import { useNavigate } from 'react-router-dom';

export function NavBar({
  title,
  back,
  action,
}: {
  title: string;
  back?: boolean;
  /** Optional 34px action button rendered in the right slot (keeps the title centered). */
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="navbar">
      {back ? (
        <button className="navbar-back" onClick={() => navigate(-1)} aria-label="Back">
          <svg width="11" height="18" viewBox="0 0 11 18" fill="none">
            <path
              d="M9.5 1.5 L2 9 L9.5 16.5"
              stroke="#f5f5f7"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : (
        <span className="navbar-spacer" />
      )}
      <span className="navbar-title">{title}</span>
      {action ?? <span className="navbar-spacer" />}
    </header>
  );
}
