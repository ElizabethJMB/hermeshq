import asyncio
import contextlib
import logging
from collections.abc import Callable, Iterable
from dataclasses import dataclass

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class EventSubscription:
    websocket: WebSocket
    is_admin: bool
    agent_ids: set[str]
    user_id: str | None = None


_INTERNAL_SUBSCRIBER_TIMEOUT = 10.0
_WS_SEND_TIMEOUT = 5.0


class EventBroker:
    def __init__(self) -> None:
        self._connections: dict[WebSocket, EventSubscription] = {}
        self._internal_subscribers: list[Callable] = []

    async def connect(
        self,
        websocket: WebSocket,
        is_admin: bool,
        agent_ids: set[str],
        user_id: str | None = None,
    ) -> None:
        await websocket.accept()
        self.register(websocket, is_admin=is_admin, agent_ids=agent_ids, user_id=user_id)

    def register(
        self,
        websocket: WebSocket,
        is_admin: bool,
        agent_ids: set[str],
        user_id: str | None = None,
    ) -> None:
        """Register an already-accepted WebSocket connection."""
        self._connections[websocket] = EventSubscription(
            websocket=websocket,
            is_admin=is_admin,
            agent_ids=set(agent_ids),
            user_id=user_id,
        )

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections.pop(websocket, None)

    def subscribe(self, callback: Callable) -> None:
        """Register an internal async callback to receive all published events."""
        if callback not in self._internal_subscribers:
            self._internal_subscribers.append(callback)

    def unsubscribe(self, callback: Callable) -> None:
        """Remove a previously registered internal callback."""
        with contextlib.suppress(ValueError):
            self._internal_subscribers.remove(callback)

    async def publish(self, event: dict) -> None:
        # Notify internal subscribers first (gateways, services, etc.)
        snapshot = list(self._internal_subscribers)
        internal_tasks = [self._call_internal(callback, event) for callback in snapshot]
        results = await asyncio.gather(*internal_tasks, return_exceptions=True)
        for callback, result in zip(snapshot, results, strict=False):
            if isinstance(result, Exception):
                logger.exception("Internal subscriber %s failed", getattr(callback, "__qualname__", callback))

        # Then push to WebSocket connections (frontend). Each send has its
        # own timeout so a slow/dead client cannot stall delivery to the
        # rest of subscribers or block the publisher.
        stale_connections: list[WebSocket] = []
        event_agent_id = event.get("agent_id")
        event_user_id = event.get("created_by_user_id")
        send_tasks: list[tuple[WebSocket, asyncio.Task]] = []
        for connection, subscription in list(self._connections.items()):
            if subscription.is_admin:
                pass  # admins receive everything
            elif (
                event_agent_id
                and event_agent_id not in subscription.agent_ids
                or event_user_id
                and subscription.user_id
                and event_user_id != subscription.user_id
            ):
                continue
            send_tasks.append((connection, asyncio.ensure_future(self._send_with_timeout(connection, event))))

        for connection, task in send_tasks:
            try:
                delivered = await task
                if not delivered:
                    stale_connections.append(connection)
            except Exception:  # noqa: BLE001  # WebSocket send — connection is stale
                stale_connections.append(connection)
        for connection in stale_connections:
            self.disconnect(connection)

    async def _call_internal(self, callback: Callable, event: dict) -> None:
        await asyncio.wait_for(callback(event), timeout=_INTERNAL_SUBSCRIBER_TIMEOUT)

    @staticmethod
    async def _send_with_timeout(connection: WebSocket, event: dict) -> bool:
        try:
            await asyncio.wait_for(connection.send_json(event), timeout=_WS_SEND_TIMEOUT)
            return True
        except TimeoutError:
            logger.warning("Dropping slow WebSocket subscriber (send timeout)")
            return False

    async def publish_many(self, events: Iterable[dict]) -> None:
        for event in events:
            await self.publish(event)
