import { FormEvent, useState } from "react";

import { useChangeMyPassword, useUpdateMyPreferences, useUpdateMyProfile } from "../../api/auth";
import { useSessionStore } from "../../stores/sessionStore";
import { performLogout } from "../../api/auth";
import { v2toast, extractErrorMessage } from "../toast";

export function V2MyAccountPage() {
  const currentUser = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const logout = useSessionStore((state) => state.logout);
  const updateProfile = useUpdateMyProfile();
  const updatePreferences = useUpdateMyPreferences();
  const changePassword = useChangeMyPassword();

  const [displayName, setDisplayName] = useState(currentUser?.display_name ?? "");
  const [theme, setTheme] = useState(currentUser?.theme_preference ?? "default");
  const [locale, setLocale] = useState(currentUser?.locale_preference ?? "default");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const updated = await updateProfile.mutateAsync({ display_name: displayName.trim() });
      setUser(updated);
      v2toast.success("Profile saved");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Save failed"));
    }
  }

  async function onSavePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const updated = await updatePreferences.mutateAsync({
        theme_preference: theme,
        locale_preference: locale,
      });
      setUser(updated);
      v2toast.success("Preferences saved");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Save failed"));
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    try {
      await changePassword.mutateAsync({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      v2toast.success("Password changed");
    } catch (error) {
      setPasswordError(extractErrorMessage(error, "Password change failed"));
    }
  }

  async function onLogout() {
    await performLogout().catch(() => undefined);
    logout();
  }

  if (!currentUser) return null;

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">My account</h1>
          <p className="v2-page-subtitle">@{currentUser.username} · {currentUser.role}</p>
        </div>
        <button className="v2-btn v2-btn-secondary" onClick={() => void onLogout()}>Sign out</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start", maxWidth: 1100 }}>
        <form className="v2-card" onSubmit={onSaveProfile}>
          <div className="v2-card-header">
            <h2 className="v2-card-title">Profile</h2>
          </div>
          <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="v2-agent-avatar" style={{ width: 52, height: 52, fontSize: 20 }}>
                {(currentUser.display_name || currentUser.username).slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div style={{ fontWeight: 620, fontSize: 16 }}>{currentUser.display_name || currentUser.username}</div>
                <div className="v2-agent-meta">@{currentUser.username} · {currentUser.auth_source}</div>
              </div>
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Display name</label>
              <input className="v2-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <button type="submit" className="v2-btn v2-btn-primary" disabled={updateProfile.isPending} style={{ alignSelf: "flex-start" }}>
              Save profile
            </button>
          </div>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <form className="v2-card" onSubmit={onSavePreferences}>
            <div className="v2-card-header">
              <h2 className="v2-card-title">Preferences</h2>
            </div>
            <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="v2-field">
                <label className="v2-field-label">Theme</label>
                <select className="v2-select" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
                  <option value="default">Instance default</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="sixmanager">SixManager</option>
                </select>
              </div>
              <div className="v2-field">
                <label className="v2-field-label">Language</label>
                <select className="v2-select" value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
                  <option value="default">Instance default</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
              <button type="submit" className="v2-btn v2-btn-primary" disabled={updatePreferences.isPending} style={{ alignSelf: "flex-start" }}>
                Save preferences
              </button>
            </div>
          </form>

          <form className="v2-card" onSubmit={onChangePassword}>
            <div className="v2-card-header">
              <h2 className="v2-card-title">Change password</h2>
            </div>
            <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="v2-field">
                <label className="v2-field-label">Current password</label>
                <input className="v2-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <div className="v2-field">
                <label className="v2-field-label">New password</label>
                <input className="v2-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
              </div>
              {passwordError ? <p className="v2-field-error">{passwordError}</p> : null}
              <button type="submit" className="v2-btn v2-btn-primary" disabled={changePassword.isPending} style={{ alignSelf: "flex-start" }}>
                Change password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
