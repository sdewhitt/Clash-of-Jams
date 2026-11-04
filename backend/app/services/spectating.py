"""Friend-only views of live sessions. Spectators never enter the player protocol."""

from collections import Counter

from app.services.matchmaking_store import MatchmakingError
from app.services.multiplayer_models import SessionMessage

REACTIONS = ("👍", "👏", "🎵")


def is_watchable(session):
    return session.state == "in_progress" and all(
        player.allow_spectators for player in session.players.values()
    )


def discover(sessions, uid):
    _, friends = sessions.store.spectator_identity(uid)
    matches = []
    for session in sessions.live_sessions():
        with session.lock:
            if uid in session.players or not is_watchable(session):
                continue
            names = [player.name for player in session.players.values() if player.uid in friends]
            if names:
                matches.append({"id": session.id, "friends": names})
    return matches


def join(sessions, session, uid, visit, connection, name, friends):
    with session.lock:
        if (
            uid in session.players
            or not is_watchable(session)
            or not friends.intersection(session.players)
        ):
            raise MatchmakingError("This match is no longer available to spectate.", 403)
        if uid not in session.spectator_connections and len(session.spectator_connections) >= 250:
            raise MatchmakingError("This match has reached its spectator limit.", 403)
        session.spectator_connections[uid] = connection
        key = (uid, visit)
        if key not in session.spectator_visits:
            session.spectator_visits.append(key)
            session.sequence += 1
            session.messages.append(
                SessionMessage(
                    id=session.sequence,
                    uid="",
                    text=f"{name} joined as a spectator",
                    at_ms=sessions.wall_clock() * 1000,
                    system=True,
                )
            )
        return session.spectator_generation


def can_view(session, generation):
    return generation == session.spectator_generation and all(
        player.allow_spectators for player in session.players.values()
    )


def leave(session, uid, connection):
    with session.lock:
        if session.spectator_connections.get(uid) == connection:
            session.spectator_connections.pop(uid, None)


def react(session, generation, uid, connection, message_id, reaction):
    with session.lock:
        if (
            not can_view(session, generation)
            or session.spectator_connections.get(uid) != connection
            or session.state != "in_progress"
        ):
            return
        if reaction not in REACTIONS:
            return
        message = next((message for message in session.messages if message.id == message_id), None)
        if message is None:
            return
        retained = {message.id for message in session.messages}
        session.spectator_votes = {
            key: votes for key, votes in session.spectator_votes.items() if key in retained
        }
        votes = session.spectator_votes.setdefault(message_id, {})
        if uid not in votes and len(votes) >= 250:
            return
        if votes.get(uid) == reaction:
            del votes[uid]
        else:
            votes[uid] = reaction
        message.reactions = dict(Counter(votes.values()))
        session.sequence += 1


def snapshot(sessions, session, generation):
    with session.lock:
        if not can_view(session, generation):
            return None
        now = sessions.clock()
        elapsed = min(session.duration_ms, max(0, (now - session.started) * 1000))
        results = {event.uid: event for event in session.rating_events}
        return {
            "state": session.state,
            "scenarioTitle": session.data["matchmaking"]["scenarioTitle"],
            "elapsedMs": elapsed,
            "scoreUpdatedAtMs": session.score_updated_at_ms,
            "durationMs": session.duration_ms,
            "totalBeats": session.total_beats,
            "players": [
                {
                    "name": player.name,
                    "score": results[player.uid].score
                    if player.uid in results
                    else session.score(player),
                    "beatsHit": len(player.hit_slots),
                    "outcome": results[player.uid].outcome if player.uid in results else None,
                }
                for player in session.players.values()
            ],
            "messages": [
                {
                    "id": message.id,
                    "author": None if message.system else session.players[message.uid].name,
                    "text": message.text,
                    "reactions": message.reactions,
                }
                for message in session.messages
            ],
        }
