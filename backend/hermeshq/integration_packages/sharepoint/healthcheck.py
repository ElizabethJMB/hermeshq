async def test_connection(config: dict, resolve_secret):
    """Delegated integration - users configure their own SharePoint site self-service.
    Actual token validation and site resolution happen at task runtime."""
    return True, "SharePoint ready (delegated auth — site configured per user).", None
