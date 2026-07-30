import { FormEvent, useState } from "react";

import { useChangeMyPassword, useUpdateMyPreferences, useUpdateMyProfile } from "../../api/auth";
import { AgentAvatar } from "../../components/AgentAvatar";
import { useSessionStore } from "../../stores/sessionStore";
import { performLogout } from "../../api/auth";
import { v2toast, extractErrorMessage } from "../toast";
import { useI18n } from "../../lib/i18n";

export function V2MyAccountPage() {
  const { t } = useI18n();
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
      v2toast.success(t("v2.profileSaved"));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.saveFailed")));
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
      v2toast.success(t("v2.preferencesSaved"));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.saveFailed")));
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    try {
      await changePassword.mutateAsync({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      v2toast.success(t("v2.passwordChanged"));
    } catch (error) {
      setPasswordError(extractErrorMessage(error, t("v2.passwordChangeFailed")));
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
          <h1 className="v2-page-title">{t("v2.myAccount")}</h1>
          <p className="v2-page-subtitle">@{currentUser.username} · {currentUser.role}</p>
        </div>
        <button className="v2-btn v2-btn-secondary" onClick={() => void onLogout()}>{t("v2.signOut")}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start", maxWidth: 1100 }}>
        <form className="v2-card" onSubmit={onSaveProfile}>
          <div className="v2-card-header">
            <h2 className="v2-card-title">{t("v2.profile")}</h2>
          </div>
          <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <AgentAvatar agent={{ friendly_name: currentUser.display_name, name: currentUser.username, avatar_url: currentUser.avatar_url, has_avatar: currentUser.has_avatar }} sizeClass="h-13 w-13" roundedClass="rounded-lg" />
              <div>
                <div style={{ fontWeight: 620, fontSize: 16 }}>{currentUser.display_name || currentUser.username}</div>
                <div className="v2-agent-meta">@{currentUser.username} · {currentUser.auth_source}</div>
              </div>
            </div>
            <div className="v2-field">
              <label className="v2-field-label">{t("v2.displayName")}</label>
              <input className="v2-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <button type="submit" className="v2-btn v2-btn-primary" disabled={updateProfile.isPending} style={{ alignSelf: "flex-start" }}>
              {t("v2.saveProfile")}
            </button>
          </div>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <form className="v2-card" onSubmit={onSavePreferences}>
            <div className="v2-card-header">
              <h2 className="v2-card-title">{t("v2.preferences")}</h2>
            </div>
            <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="v2-field">
                <label className="v2-field-label">{t("v2.theme")}</label>
                <select className="v2-select" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
                  <option value="default">{t("v2.instanceDefaultOpt")}</option>
                  <option value="dark">{t("v2.dark")}</option>
                  <option value="light">{t("v2.light")}</option>
                  <option value="system">{t("v2.systemTheme")}</option>
                  <option value="enterprise">{t("v2.enterpriseTheme")}</option>
                  <option value="sixmanager">{t("v2.sixmanagerTheme")}</option>
                </select>
              </div>
              <div className="v2-field">
                <label className="v2-field-label">{t("v2.language")}</label>
                <select className="v2-select" value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
                  <option value="default">{t("v2.instanceDefaultOpt")}</option>
                  <option value="en">{t("v2.english")}</option>
                  <option value="es">{t("v2.spanish")}</option>
                </select>
              </div>
              <button type="submit" className="v2-btn v2-btn-primary" disabled={updatePreferences.isPending} style={{ alignSelf: "flex-start" }}>
                {t("v2.savePreferences")}
              </button>
            </div>
          </form>

          <form className="v2-card" onSubmit={onChangePassword}>
            <div className="v2-card-header">
              <h2 className="v2-card-title">{t("v2.changePassword")}</h2>
            </div>
            <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="v2-field">
                <label className="v2-field-label">{t("v2.currentPassword")}</label>
                <input className="v2-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <div className="v2-field">
                <label className="v2-field-label">{t("v2.newPassword")}</label>
                <input className="v2-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required autoComplete="new-password" />
              </div>
              {passwordError ? <p className="v2-field-error">{passwordError}</p> : null}
              <button type="submit" className="v2-btn v2-btn-primary" disabled={changePassword.isPending} style={{ alignSelf: "flex-start" }}>
                {t("v2.changePassword")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
