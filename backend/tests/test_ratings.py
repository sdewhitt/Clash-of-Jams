"""
User story #18: rating scenarios.

Runs against the in-memory Firestore from conftest's fake_db, so these check
exactly what the routes write without touching the real database.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from tests.fake_firestore import FakeFirestore

SCENARIO = "scn"
T0 = datetime(2026, 9, 1, tzinfo=UTC)


def add_user(db: FakeFirestore, uid: str, *, public: bool = True, banned: bool = False) -> None:
    db.put(f"users/{uid}", {
        "uid": uid, "displayName": f"Player {uid}", "isProfilePublic": public,
        "isBanned": banned, "isSocialRestricted": False,
    })


def add_scenario(db: FakeFirestore, *, author: str = "author", visibility: str = "public",
                 ratings: list[int] = ()) -> None:
    """A scenario, plus one review per entry in `ratings` so the aggregates agree with the docs."""
    db.put(f"scenarios/{SCENARIO}", {
        "id": SCENARIO, "authorUid": author, "title": "Fur Elise", "description": "",
        "instrument": "piano", "genres": [], "visibility": visibility, "tags": [],
        "authorDifficulty": 4, "playCount": 0, "createdAt": T0, "updatedAt": T0,
        "avgRating": sum(ratings) / len(ratings) if ratings else None,
        "crowdDifficulty": None, "ratingCount": len(ratings),
        "currentVersionId": "v1", "currentVersionNumber": 1,
    })
    for i, stars in enumerate(ratings):
        uid = f"reviewer{i}"
        add_user(db, uid)
        db.put(f"scenarioReviews/{SCENARIO}_{uid}", {
            "id": f"{SCENARIO}_{uid}", "scenarioId": SCENARIO, "reviewerUid": uid,
            "rating": stars, "comment": "", "createdAt": T0, "updatedAt": T0,
        })


def add_run(db: FakeFirestore, uid: str, *, validation: str = "accepted") -> None:
    db.put(f"runs/run_{uid}_{len(db.docs)}", {
        "userUid": uid, "scenarioId": SCENARIO, "validation": validation,
    })


def scenario(db: FakeFirestore) -> dict:
    return db.data(f"scenarios/{SCENARIO}")


def rate(client: TestClient, stars: int, comment: str = ""):
    return client.put(f"/api/v1/ratings/{SCENARIO}", json={"rating": stars, "comment": comment})


@pytest.fixture
def player(fake_db: FakeFirestore, me: str) -> str:
    """The caller, set up to rate: a profile and an accepted run on the scenario."""
    add_user(fake_db, me)
    add_run(fake_db, me)
    return me


# ------------------------------------------------- submitting and re-rating


def test_submitting_a_rating_writes_the_review(client, fake_db, player) -> None:
    add_scenario(fake_db)

    response = rate(client, 4, "Great practice for the B section.")

    assert response.status_code == 200
    review = fake_db.data(f"scenarioReviews/{SCENARIO}_{player}")
    assert review["rating"] == 4
    assert review["comment"] == "Great practice for the B section."
    assert review["reviewerUid"] == player
    assert review["scenarioId"] == SCENARIO
    assert response.json()["rating"] == 4


def test_first_rating_sets_the_average(client, fake_db, player) -> None:
    add_scenario(fake_db)  # not yet rated: avgRating is None

    rate(client, 4)

    assert scenario(fake_db)["avgRating"] == 4
    assert scenario(fake_db)["ratingCount"] == 1


def test_average_recalculates_after_a_new_rating(client, fake_db, player) -> None:
    add_scenario(fake_db, ratings=[5, 4, 4])  # 4.33 over 3

    rate(client, 1)

    assert scenario(fake_db)["ratingCount"] == 4
    assert scenario(fake_db)["avgRating"] == pytest.approx((5 + 4 + 4 + 1) / 4)


def test_rerating_updates_the_existing_review_not_a_new_one(client, fake_db, player) -> None:
    add_scenario(fake_db, ratings=[5, 4, 4])
    rate(client, 1, "first take")
    first = fake_db.data(f"scenarioReviews/{SCENARIO}_{player}")

    response = rate(client, 5, "changed my mind")

    assert response.status_code == 200
    assert len(fake_db.paths("scenarioReviews")) == 4  # three others plus one from the caller
    review = fake_db.data(f"scenarioReviews/{SCENARIO}_{player}")
    assert review["rating"] == 5
    assert review["comment"] == "changed my mind"
    assert review["createdAt"] == first["createdAt"]
    assert review["updatedAt"] >= first["updatedAt"]
    # The count stays put and the old rating is swapped out of the average.
    assert scenario(fake_db)["ratingCount"] == 4
    assert scenario(fake_db)["avgRating"] == pytest.approx((5 + 4 + 4 + 5) / 4)


def test_my_rating_returns_the_existing_review_for_autofill(client, fake_db, player) -> None:
    add_scenario(fake_db)
    assert client.get(f"/api/v1/ratings/{SCENARIO}/my-rating").json() is None

    rate(client, 3, "pretty good")

    mine = client.get(f"/api/v1/ratings/{SCENARIO}/my-rating").json()
    assert (mine["rating"], mine["comment"]) == (3, "pretty good")


# ------------------------------------------------------------- refusals


def test_author_cannot_rate_their_own_scenario(client, fake_db, player) -> None:
    add_scenario(fake_db, author=player)

    response = rate(client, 5)

    assert response.status_code == 403
    assert response.json()["detail"] == "Authors cannot rate their own scenario"
    assert fake_db.paths("scenarioReviews") == []
    assert scenario(fake_db)["ratingCount"] == 0


def test_cannot_rate_a_scenario_you_have_not_played(client, fake_db, me) -> None:
    add_user(fake_db, me)
    add_scenario(fake_db)

    response = rate(client, 5)

    assert response.status_code == 403
    assert response.json()["detail"] == "You cannot review a scenario you have not played"


def test_a_rejected_run_does_not_count_as_playing(client, fake_db, me) -> None:
    add_user(fake_db, me)
    add_run(fake_db, me, validation="rejected")
    add_scenario(fake_db)

    assert rate(client, 5).status_code == 403


def test_banned_users_cannot_rate(client, fake_db, me) -> None:
    add_user(fake_db, me, banned=True)
    add_run(fake_db, me)
    add_scenario(fake_db)

    assert rate(client, 5).status_code == 403
    assert fake_db.paths("scenarioReviews") == []


@pytest.mark.parametrize("visibility", ["private", None])
def test_private_or_missing_scenario_is_404(client, fake_db, player, visibility) -> None:
    if visibility:
        add_scenario(fake_db, visibility=visibility)

    assert rate(client, 5).status_code == 404


@pytest.mark.parametrize("stars", [0, 6])
def test_rating_must_be_one_to_five(client, fake_db, player, stars) -> None:
    add_scenario(fake_db)

    assert rate(client, stars).status_code == 422
    assert scenario(fake_db)["ratingCount"] == 0


# --------------------------------------------------------- reading reviews


def test_reviews_hide_banned_users_and_anonymize_private_ones(client, fake_db, me) -> None:
    add_scenario(fake_db, ratings=[5, 4, 2])
    add_user(fake_db, "reviewer1", public=False)
    add_user(fake_db, "reviewer2", banned=True)

    reviews = client.get(f"/api/v1/ratings/{SCENARIO}").json()

    assert sorted((r["displayName"], r["rating"]) for r in reviews) == [
        ("Anonymous", 4), ("Player reviewer0", 5),
    ]
