import { FormEvent, useState } from "react";

import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "../../api/users";
import { useSessionStore } from "../../stores/sessionStore";
import { v2toast, extractErrorMessage } from "../toast";
import { useI18n } from "../../lib/i18n";

export function V2UsersPage() {
  const { t } = useI18n();
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const currentUser = useSessionStore((state) => state.user);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    try {
      await createUser.mutateAsync({
        username: username.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
        role,
        is_active: true,
      });
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("user");
      v2toast.success(t("v2.userCreated", { name: username }));
    } catch (error) {
      setFormError(extractErrorMessage(error, t("v2.userCreationFailed")));
    }
  }

  async function onToggleActive(userId: string, isActive: boolean, name: string) {
    try {
      await updateUser.mutateAsync({ userId, payload: { is_active: !isActive } });
      v2toast.success(isActive ? t("v2.userDeactivated", { name }) : t("v2.userActivated", { name }));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.updateFailed")));
    }
  }

  async function onRoleChange(userId: string, newRole: string, name: string) {
    try {
      await updateUser.mutateAsync({ userId, payload: { role: newRole } });
      v2toast.success(t("v2.roleChanged", { name, role: newRole }));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.roleChangeFailed")));
    }
  }

  async function onDelete(userId: string, name: string) {
    try {
      await deleteUser.mutateAsync(userId);
      v2toast.success(t("v2.userDeleted", { name }));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.deleteFailed")));
    }
  }

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">{t("v2.users")}</h1>
          <p className="v2-page-subtitle">{(users ?? []).length} {t("v2.accountsWithAccess")}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 20, alignItems: "start" }}>
        <form className="v2-card" onSubmit={onSubmit}>
          <div className="v2-card-header">
            <h2 className="v2-card-title">{t("v2.newUser")}</h2>
          </div>
          <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="v2-field">
              <label className="v2-field-label">{t("v2.username")}</label>
              <input className="v2-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">{t("v2.displayName")}</label>
              <input className="v2-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={username || t("v2.fullName")} />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">{t("v2.password")}</label>
              <input className="v2-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">{t("v2.role")}</label>
              <select className="v2-select" value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
                <option value="user">{t("v2.userRole")}</option>
                <option value="admin">{t("v2.adminRole")}</option>
              </select>
            </div>
            {formError ? <p className="v2-field-error">{formError}</p> : null}
            <button type="submit" className="v2-btn v2-btn-primary" disabled={createUser.isPending}>
              {createUser.isPending ? t("v2.creating") : t("v2.createUser")}
            </button>
          </div>
        </form>

        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">{t("v2.accounts")}</h2>
          </div>
          <div>
            {isLoading ? (
              <div style={{ padding: 20 }}>
                {[1, 2, 3].map((i) => <div key={i} className="v2-skeleton" style={{ height: 52, marginBottom: 8 }} />)}
              </div>
            ) : (users ?? []).length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">{t("v2.noUsers")}</p>
              </div>
            ) : (
              (users ?? []).map((user) => (
                <div key={user.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--v2-border)" }}>
                  <span className="v2-agent-avatar">{(user.display_name || user.username).slice(0, 1).toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="v2-agent-name">
                      {user.display_name || user.username}
                      {user.id === currentUser?.id ? <span style={{ color: "var(--v2-text-muted)", fontWeight: 400 }}> {t("v2.you")}</span> : null}
                    </div>
                    <div className="v2-agent-meta">
                      @{user.username} · {user.auth_source}{user.email ? ` · ${user.email}` : ""}
                    </div>
                  </div>
                  <span className="v2-pill" data-tone={user.is_active ? "success" : "neutral"}>
                    <span className="v2-pill-dot" />
                    {user.is_active ? t("v2.active") : t("v2.inactive")}
                  </span>
                  <select
                    className="v2-select"
                    style={{ width: 100, padding: "5px 8px", fontSize: 12.5 }}
                    value={user.role}
                    onChange={(e) => void onRoleChange(user.id, e.target.value, user.display_name || user.username)}
                    disabled={user.id === currentUser?.id}
                  >
                    <option value="user">{t("v2.user")}</option>
                    <option value="admin">{t("v2.admin")}</option>
                  </select>
                  <button
                    className="v2-btn v2-btn-secondary"
                    style={{ padding: "5px 12px", fontSize: 12 }}
                    onClick={() => void onToggleActive(user.id, user.is_active, user.display_name || user.username)}
                    disabled={user.id === currentUser?.id || updateUser.isPending}
                  >
                    {user.is_active ? t("v2.deactivate") : t("v2.activate")}
                  </button>
                  <button
                    className="v2-btn v2-btn-danger"
                    style={{ padding: "5px 12px", fontSize: 12 }}
                    onClick={() => void onDelete(user.id, user.display_name || user.username)}
                    disabled={user.id === currentUser?.id || deleteUser.isPending}
                  >
                    {t("v2.delete")}
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
