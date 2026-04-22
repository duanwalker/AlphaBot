import { Outlet } from "react-router-dom";
import SettingsSidebar from "../../components/SettingsSidebar";

function SettingsLayout() {
  return (
    <section className="settings-page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account, billing, and AlphaBot preferences.</p>
      </header>

      <div className="settings-layout">
        <SettingsSidebar />
        <div className="settings-content card">
          <Outlet />
        </div>
      </div>
    </section>
  );
}

export default SettingsLayout;
