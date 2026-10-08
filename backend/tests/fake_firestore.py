"""
An in-memory stand-in for the Firestore client, so route tests never touch the real database.

Covers only what the routers call: documents and subcollections, where() with
FieldFilter / Or, order_by, limit, stream/get, get_all and transactions. Data
lives in one dict keyed by document path ("scenarios/abc").
"""

from copy import deepcopy
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter, Or

_OPS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
}


class FakeFirestore:
    def __init__(self) -> None:
        self.docs: dict[str, dict] = {}

    def collection(self, name: str) -> "FakeCollection":
        return FakeCollection(self, name)

    def get_all(self, refs) -> list["FakeSnapshot"]:
        return [ref.get() for ref in refs]

    def transaction(self) -> "FakeTransaction":
        return FakeTransaction()

    def put(self, path: str, data: dict) -> None:
        """Seed a document directly."""
        self.docs[path] = deepcopy(data)

    def data(self, path: str) -> dict | None:
        return deepcopy(self.docs.get(path))

    def paths(self, collection: str) -> list[str]:
        """Paths of the documents directly inside `collection`."""
        prefix = f"{collection}/"
        return [p for p in self.docs if p.startswith(prefix) and "/" not in p[len(prefix):]]


class FakeSnapshot:
    def __init__(self, ref: "FakeDocRef", data: dict | None) -> None:
        self.reference = ref
        self.id = ref.id
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> dict | None:
        return deepcopy(self._data)

    def get(self, field: str) -> Any:
        return self._data[field]


class FakeDocRef:
    def __init__(self, db: FakeFirestore, path: str) -> None:
        self.db = db
        self.path = path
        self.id = path.rsplit("/", 1)[-1]

    def get(self, field_paths=None, transaction=None) -> FakeSnapshot:
        return FakeSnapshot(self, self.db.data(self.path))

    def set(self, data: dict) -> None:
        self.db.put(self.path, data)

    def update(self, data: dict) -> None:
        self.db.docs[self.path].update(deepcopy(data))

    def delete(self) -> None:
        self.db.docs.pop(self.path, None)

    def collection(self, name: str) -> "FakeCollection":
        return FakeCollection(self.db, f"{self.path}/{name}")


class FakeQuery:
    def __init__(self, db: FakeFirestore, path: str, filters=(), order=(), limit=None) -> None:
        self.db = db
        self.path = path
        self._filters = tuple(filters)
        self._order = tuple(order)
        self._limit = limit

    def _with(self, **changes) -> "FakeQuery":
        args = {"filters": self._filters, "order": self._order, "limit": self._limit, **changes}
        return FakeQuery(self.db, self.path, **args)

    def where(self, field_path=None, op_string=None, value=None, *, filter=None) -> "FakeQuery":
        condition = filter if filter is not None else FieldFilter(field_path, op_string, value)
        return self._with(filters=(*self._filters, condition))

    def order_by(self, field: str, direction: str = "ASCENDING") -> "FakeQuery":
        return self._with(order=(*self._order, (field, direction)))

    def limit(self, count: int) -> "FakeQuery":
        return self._with(limit=count)

    def stream(self):
        snaps = [FakeDocRef(self.db, p).get() for p in self.db.paths(self.path)]
        snaps = [s for s in snaps if all(_matches(s.to_dict(), f) for f in self._filters)]
        for field, direction in reversed(self._order):
            snaps.sort(key=lambda s, f=field: s.get(f), reverse=direction == "DESCENDING")
        return iter(snaps[: self._limit] if self._limit is not None else snaps)

    def get(self) -> list[FakeSnapshot]:
        return list(self.stream())


class FakeCollection(FakeQuery):
    def __init__(self, db: FakeFirestore, path: str) -> None:
        super().__init__(db, path)

    def document(self, doc_id: str) -> FakeDocRef:
        return FakeDocRef(self.db, f"{self.path}/{doc_id}")


class FakeTransaction:
    """Applies writes straight away; tests call the transactional body directly."""

    def set(self, ref: FakeDocRef, data: dict) -> None:
        ref.set(data)

    def update(self, ref: FakeDocRef, data: dict) -> None:
        ref.update(data)


def _matches(data: dict, condition) -> bool:
    if isinstance(condition, Or):
        return any(_matches(data, f) for f in condition.filters)
    if condition.field_path not in data:  # Firestore never matches a missing field
        return False
    return _OPS[condition.op_string](data[condition.field_path], condition.value)
