"""Real ASGI/WebSocket protocol around an explicit test persistence adapter."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import Settings
from app.routers import multiplayer
from app.schemas import CurrentUser
from app.services.multiplayer import SessionService
from app.services.multiplayer_transport import SessionHub
from tests.test_multiplayer import SessionTestStore


@pytest.fixture
def transport(monkeypatch):
    def verify(credentials, _settings):
        if credentials.credentials not in ("a", "b", "outsider", "unrelated"):
            raise HTTPException(401, "Invalid token")
        return CurrentUser(uid=credentials.credentials)

    monkeypatch.setattr(multiplayer, "get_current_user", verify)
    monkeypatch.setattr(multiplayer, "get_settings", lambda: Settings(auth_disabled=False))
    app = FastAPI()
    app.state.sessions = SessionService(
        SessionTestStore, countdown_seconds=0, heartbeat_seconds=1000
    )
    app.state.session_hub = SessionHub(app.state.sessions)
    app.include_router(multiplayer.router, prefix="/api/v1")
    with TestClient(app) as client:
        yield client, app.state.session_hub


def until(socket, predicate):
    for _ in range(10):
        reply = socket.receive_json()
        if predicate(reply):
            return reply
    raise AssertionError("Expected protocol reply was not received")


def test_authenticated_two_socket_protocol_and_replay(transport):
    client, hub = transport
    with client.websocket_connect("/api/v1/multiplayer/match/socket") as a:
        a.send_json({"token": "a"})
        assert a.receive_json()["snapshot"]["state"] == "lobby"
        with client.websocket_connect("/api/v1/multiplayer/match/socket") as b:
            b.send_json({"token": "b"})
            b.receive_json()
            a.send_json({"eventId": "a-ready", "sequence": 1, "kind": "ready"})
            until(a, lambda r: r["eventId"] == "a-ready")
            b.send_json({"eventId": "b-ready", "sequence": 1, "kind": "ready"})
            reply = until(b, lambda r: r["eventId"] == "b-ready")
            assert reply["snapshot"]["state"] == "in_progress"
            hit = {"eventId": "hit", "sequence": 2, "kind": "demo_hit"}
            a.send_json(hit)
            assert until(a, lambda r: r["eventId"] == "hit")["disposition"] == "accepted"
            a.send_json(hit)
            duplicate = until(a, lambda r: r["eventId"] == "hit")
            assert duplicate["disposition"] == "duplicate"
            assert duplicate["snapshot"]["participants"][0]["beatsHit"] == 1
            a.send_json({"eventId": "stale", "sequence": 1, "kind": "demo_hit"})
            assert until(a, lambda r: r["eventId"] == "stale")["disposition"] == "rejected"
            b.send_json({"eventId": "resign", "sequence": 2, "kind": "resign"})
            final = until(b, lambda r: r["eventId"] == "resign")
            assert final["snapshot"]["state"] == "complete"
            assert len(final["snapshot"]["ratingEvents"]) == 2
    report = hub.metrics.report()
    assert report["counts"]["accepted"] == 4
    assert report["counts"]["duplicate"] == report["counts"]["rejected"] == 1


@pytest.mark.parametrize("token,code", [("invalid", 4401), ("outsider", 4403), (None, 4401)])
def test_invalid_tokens_and_nonparticipants_are_rejected(transport, token, code):
    client, _ = transport
    with client.websocket_connect("/api/v1/multiplayer/match/socket") as socket:
        socket.send_json({"token": token})
        with pytest.raises(WebSocketDisconnect) as failure:
            socket.receive_json()
        assert failure.value.code == code


def test_untrusted_browser_origin_is_rejected(transport):
    client, _ = transport
    with pytest.raises(WebSocketDisconnect) as failure:
        with client.websocket_connect(
            "/api/v1/multiplayer/match/socket", headers={"origin": "https://untrusted.example"}
        ):
            pass
    assert failure.value.code == 1008


def test_replacement_tab_cannot_be_disconnected_by_the_old_socket(transport):
    client, hub = transport
    with client.websocket_connect("/api/v1/multiplayer/match/socket") as old:
        old.send_json({"token": "a"})
        old.receive_json()
        with client.websocket_connect("/api/v1/multiplayer/match/socket") as replacement:
            replacement.send_json({"token": "a"})
            assert replacement.receive_json()["snapshot"]["participants"][0]["connected"]
            with pytest.raises(WebSocketDisconnect) as failure:
                old.receive_json()
            assert failure.value.code == 4009
            replacement.send_json({"type": "ping"})
            assert replacement.receive_json()["snapshot"]["participants"][0]["connected"]
            assert len(hub.channels) == 1


def test_invalid_event_does_not_change_session_state(transport):
    client, _ = transport
    with client.websocket_connect("/api/v1/multiplayer/match/socket") as socket:
        socket.send_json({"token": "a"})
        socket.receive_json()
        socket.send_json({"kind": "set_score", "score": 1})
        reply = socket.receive_json()
        assert reply["disposition"] == "rejected"
        assert reply["snapshot"]["participants"][0]["score"] == 0


def test_spectating_discovery_permissions_reactions_and_reconnect(transport, monkeypatch):
    from app.dependencies import get_current_user

    client, hub = transport
    monkeypatch.setattr(
        SessionTestStore,
        "spectator_identity",
        lambda _store, uid: ("Viewer", {"a"} if uid == "outsider" else set()),
        raising=False,
    )
    client.app.dependency_overrides[get_current_user] = lambda: CurrentUser(uid="outsider")
    player_url = "/api/v1/multiplayer/match/socket"
    watch_url = "/api/v1/multiplayer/match/spectate"
    discovery_url = "/api/v1/multiplayer/spectating"

    def action(socket, kind, sequence, **fields):
        event_id = f"{kind}-{sequence}"
        socket.send_json({"eventId": event_id, "kind": kind, "sequence": sequence, **fields})
        return until(socket, lambda reply: reply["eventId"] == event_id)

    def join(viewer):
        viewer.send_json({"token": "outsider", "visit": "visit"})

    with client.websocket_connect(player_url) as a, client.websocket_connect(player_url) as b:
        a.send_json({"token": "a", "allowSpectators": True})
        b.send_json({"token": "b"})
        a.receive_json()
        b.receive_json()
        action(a, "ready", 1)
        action(b, "ready", 1)
        assert client.get(discovery_url).json() == []
        with client.websocket_connect(watch_url) as viewer:
            join(viewer)
            with pytest.raises(WebSocketDisconnect) as denied:
                viewer.receive_json()
            assert denied.value.code == 4403

        action(b, "spectating", 2, allowSpectators=True)
        assert client.get(discovery_url).json() == [{"id": "match", "friends": ["a"]}]
        with client.websocket_connect(watch_url) as unrelated:
            unrelated.send_json({"token": "unrelated", "visit": "visit"})
            with pytest.raises(WebSocketDisconnect) as denied:
                unrelated.receive_json()
            assert denied.value.code == 4403

        with client.websocket_connect(watch_url) as viewer:
            join(viewer)
            state = viewer.receive_json()
            assert state["players"][0]["score"] == 0
            assert set(state["players"][0]) == {"name", "score", "beatsHit", "outcome"}
            message = state["messages"][0]
            assert message["text"] == "Viewer joined as a spectator"
            viewer.send_json({"type": "reaction", "messageId": message["id"], "reaction": "👏"})
            until(viewer, lambda state: state["messages"][0]["reactions"] == {"👏": 1})
            viewer.send_json({"kind": "demo_hit"})
            with pytest.raises(WebSocketDisconnect) as invalid:
                while True:
                    viewer.receive_json()
            assert invalid.value.code == 1008

        with client.websocket_connect(watch_url) as viewer:
            join(viewer)
            assert len(viewer.receive_json()["messages"]) == 1
            state = action(a, "demo_hit", 2)["snapshot"]
            assert state["messages"][0]["reactions"] == {"👏": 1}
            until(viewer, lambda state: state["players"][0]["beatsHit"] == 1)
            action(a, "spectating", 3, allowSpectators=False)
            with pytest.raises(WebSocketDisconnect) as removed:
                while True:
                    viewer.receive_json()
            assert removed.value.code == 4410

        assert client.get(discovery_url).json() == []
        action(a, "spectating", 4, allowSpectators=True)
        with client.websocket_connect(watch_url) as viewer:
            join(viewer)
            viewer.receive_json()
            action(b, "resign", 3)
            result = until(viewer, lambda state: state["state"] == "complete")
            assert [player["outcome"] for player in result["players"]] == ["win", "forfeit"]
            with pytest.raises(WebSocketDisconnect) as completed:
                viewer.receive_json()
            assert completed.value.code == 1000

    assert hub.metrics.report()["counts"]["spectatorConnections"] == 3
