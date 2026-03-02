interface TopBarProps {
  destination: string;
  dateRange: string;
  status: string;
  userLabel: string;
  onLogout: () => void;
  onBack?: () => void;
}

export function TopBar({ destination, dateRange, status, userLabel, onLogout, onBack }: TopBarProps) {
  return (
    <header className="topBar">
      <div>
        <p className="eyebrow">Autonomous Travel Console</p>
        <h1>{destination}</h1>
      </div>
      <div className="topBarMeta">
        <span>{dateRange}</span>
        <span className="statusBadge">{status}</span>
        <span className="userBadge">{userLabel}</span>
        {onBack ? (
          <button className="ghostButton" onClick={onBack} type="button">
            Back to trips
          </button>
        ) : null}
        <button className="ghostButton" onClick={onLogout} type="button">
          Logout
        </button>
      </div>
    </header>
  );
}
