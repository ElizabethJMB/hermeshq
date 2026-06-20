async def run_action(action_slug: str, *, agent, config: dict, resolve_secret, workspaces_root, package_root=None):
    if action_slug == "health":
        return True, "Microsoft 365 Calendar ready (delegated auth — user connects their own account).", None
    return False, f"Unknown action: {action_slug}", None
