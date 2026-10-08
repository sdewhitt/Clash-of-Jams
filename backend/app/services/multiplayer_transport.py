"""Bounded output queues and receipt-to-response-enqueue instrumentation."""

import asyncio
from collections import Counter, deque
from dataclasses import dataclass, field
from math import ceil
from threading import Lock
from time import perf_counter

from fastapi import WebSocket
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketDisconnect

from app.services.multiplayer_models import EventReply


class SessionMetrics:
    def __init__(self):
        self.counts = Counter()
        self.samples = deque(maxlen=100_000)
        self.last_timing = None
        self._lock = Lock()

    def record(self, disposition, received, completed, enqueued):
        with self._lock:
            self.counts[disposition] += 1
            self.last_timing = {
                "receipt": received,
                "completion": completed,
                "responseEnqueue": enqueued,
            }
            if disposition == "accepted":
                self.samples.append((enqueued - received) * 1000)

    def count(self, kind):
        with self._lock:
            self.counts[kind] += 1

    def report(self):
        with self._lock:
            values = sorted(self.samples)

            def percentile(p):
                return values[max(0, ceil(len(values) * p) - 1)] if values else None

            p95 = percentile(0.95)
            return {
                "counts": dict(self.counts),
                "sampleCount": len(values),
                "p50Ms": percentile(0.5),
                "p95Ms": p95,
                "p99Ms": percentile(0.99),
                "passes50Ms": p95 is not None and p95 < 50,
                "measurement": "accepted event receipt to response enqueue",
                "lastTiming": self.last_timing,
            }


@dataclass
class Channel:
    socket: WebSocket
    match_id: str
    uid: str
    connection_id: str
    outgoing: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=32))


class SessionHub:
    def __init__(self, service):
        self.service = service
        self.channels: dict[tuple[str, str], Channel] = {}
        self.metrics = SessionMetrics()

    async def close(self, channel, code, reason=""):
        try:
            await channel.socket.close(code=code, reason=reason)
        except (RuntimeError, WebSocketDisconnect, OSError):
            # The peer may already have closed while its receive loop unwinds.
            pass

    def enqueue(self, channel, payload):
        try:
            channel.outgoing.put_nowait(payload)
        except asyncio.QueueFull:
            self.metrics.count("slowConsumer")
            asyncio.create_task(self.close(channel, 1013))

    async def register(self, channel):
        key = (channel.match_id, channel.uid)
        previous = self.channels.get(key)
        self.channels[key] = channel
        if previous is not None:
            await self.close(previous, 4009, "Opened in another tab")

    def unregister(self, channel):
        key = (channel.match_id, channel.uid)
        if self.channels.get(key) is channel:
            self.channels.pop(key, None)

    async def broadcast(self, match_id, *, reply=None, sender=None):
        for channel in list(self.channels.values()):
            if channel.match_id == match_id:
                message = (
                    reply
                    if sender is channel and reply is not None
                    else EventReply(
                        snapshot=await run_in_threadpool(
                            self.service.snapshot, match_id, channel.uid
                        ),
                    )
                )
                self.enqueue(channel, message.model_dump(mode="json", by_alias=True))

    async def write(self, channel):
        while True:
            await channel.socket.send_json(await channel.outgoing.get())

    def record(self, reply, received, completed):
        self.metrics.record(reply.disposition, received, completed, perf_counter())
