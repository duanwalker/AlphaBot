import { NavLink } from "react-router-dom";

const items = [
  { to: "/settings/profile", label: "User Profile" },
  { to: "/settings/billing", label: "Billing & Usage" },
  { to: "/settings/api-keys", label: "API Keys" },
  { to: "/settings/preferences", label: "Preferences" },
  { to: "/settings/trading-account", label: "Trading Account" },
  { to: "/settings/about", label: "About" },
];

function SettingsSidebar() {
  return (
    <aside className="settings-sidebar card">
      <h3 className="settings-sidebar-title">Settings</h3>
      <nav className="settings-sidebar-nav" aria-label="Settings submenu">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `settings-sidebar-link${isActive ? " active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default SettingsSidebar;
