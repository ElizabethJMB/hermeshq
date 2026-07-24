import { FormEvent, useState } from "react";

import { useAgents } from "../../api/agents";
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "../../api/users";
import { useSessionStore } from "../../stores/sessionStore";
import { v2toast, extractErrorMessage } from "../toast";

export function V2UsersPage() {
  const { data: users, isLoading } = useUsers();
  const { data: agents } = useAgents();
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
      v2toast.success(`User "${username}" created`);
    } catch (error) {
      setFormError(extractErrorMessage(error, "User creation failed"));
    }
  }

  async function onToggleActive(userId: string, isActive: boolean, name: string) {
    try {
      await updateUser.mutateAsync({ userId, payload: { is_active: !isActive } });
      v2toast.success(isActive ? `${name} deactivated` : `${name} activated`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Update failed"));
    }
  }

  async function onRoleChange(userId: string, newRole: string, name: string) {
    try {
      await updateUser.mutateAsync({ userId, payload: { role: newRole } });
      v2toast.success(`${name} is now ${newRole}`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Role change failed"));
    }
  }

  async function onDelete(userId: string, name: string) {
    try {
      await deleteUser.mutateAsync(userId);
      v2toast.success(`User "${name}" deleted`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Delete failed"));
    }
  }

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">Users</h1>
          <p className="v2-page-subtitle">{(users ?? []).length} accounts with platform access</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 20, alignItems: "start" }}>
        <form className="v2-card" onSubmit={onSubmit}>
          <div className="v2-card-header">
            <h2 className="v2-card-title">New user</h2>
          </div>
          <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="v2-field">
              <label className="v2-field-label">Username</label>
              <input className="v2-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Display name</label>
              <input className="v2-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={username || "Full name"} />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Password</label>
              <input className="v2-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Role</label>
              <select className="v2-select" value={role} onChange={(e) => setRole(e.target.value as "admin" | "user")}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {formError ? <p className="v2-field-error">{formError}</p> : null}
            <button type="submit" className="v2-btn v2-btn-primary" disabled={createUser.isPending}>
              {createUser.isPending ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>

        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">Accounts</h2>
          </div>
          <div>
            {isLoading ? (
              <div style={{ padding: 20 }}>
                {[1, 2, 3].map((i) => <div key={i} className="v2-skeleton" style={{ height: 52, marginBottom: 8 }} />)}
              </div>
            ) : (users ?? []).length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">No users</p>
              </div>
            ) : (
              (users ?? []).map((user) => (
                <div key={user.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--v2-border)" }}>
                  <span className="v2-agent-avatar">{(user.display_name || user.username).slice(0, 1).toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="v2-agent-name">
                      {user.display_name || user.username}
                      {user.id === currentUser?.id ? <span style={{ color: "var(--v2-text-muted)", fontWeight: 400 }}> (you)</span> : null}
                    </div>
                    <div className="v2-agent-meta">
                      @{user.username} · {user.auth_source}{user.email ? ` · ${user.email}` : ""}
                    </div>
                  </div>
                  <span className="v2-pill" data-tone={user.is_active ? "success" : "neutral"}>
                    <span className="v2-pill-dot" />
                    {user.is_active ? "active" : "inactive"}
                  </span>
                  <select
                    className="v2-select"
                    style={{ width: 100, padding: "5px 8px", fontSize: 12.5 }}
                    value={user.role}
                    onChange={(e) => void onRoleChange(user.id, e.target.value, user.display_name || user.username)}
                    disabled={user.id === currentUser?.id}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                  <button
                    className="v2-btn v2-btn-secondary"
                    style={{ padding: "5px 12px", fontSize: 12 }}
                    onClick={() => void onToggleActive(user.id, user.is_active, user.display_name || user.username)}
                    disabled={user.id === currentUser?.id || updateUser.isPending}
                  >
                    {user.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className="v2-btn v2-btn-danger"
                    style={{ padding: "5px 12px", fontSize: 12 }}
                    onClick={() => void onDelete(user.id, user.display_name || user.username)}
                    disabled={user.id === currentUser?.id || deleteUser.isPending}
                  >
                    Delete
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
