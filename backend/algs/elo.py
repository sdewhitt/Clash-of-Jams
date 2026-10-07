"""
Developed using https://en.wikipedia.org/wiki/Elo_rating_system#Performance_rating.
"""

initial_elo = 400

"""
Initial Elo for a new player.
"""

def get_expected_score(a_elo: float, b_elo: float)->tuple[float,float]:
    """
    Calculate the expected score for two players based on their Elo ratings. Ref: https://en.wikipedia.org/wiki/Elo_rating_system#Mathematical_details
    :param a_elo: The Elo rating of player 1.
    :param b_elo: The Elo rating of player 2.
    :return: A tuple containing the expected scores for the current player and the opponent.
    """
    diffal = (a_elo - b_elo) / 400
    expected_score_a = 1 / (1 + 10 ** (-diffal))
    expected_score_b = 1 - expected_score_a
    return expected_score_a, expected_score_b

def updated_elos(a_elo: float, b_elo: float, winner: int) -> tuple[float, float]:
    """
    Update the Elo ratings for two players after a match. Ref: https://en.wikipedia.org/wiki/Elo_rating_system#Mathematical_details
    :param a_elo: The current Elo rating of player 1.
    :param b_elo: The current Elo rating of player 2.
    :param winner: 1 if player 1 won, 2 if player 2 won, 0 if draw.
    :return: A tuple containing the updated Elo ratings for the two players.
    """
    a_expected, b_expected = get_expected_score(a_elo, b_elo)
    if (a_elo < 2200 and b_elo < 2200):
        k = 32
    else:
        k = 16

    """
    K-factor for the Elo rating update.
    """

    if winner == 1:
        a_new_elo = a_elo + k * (1 - a_expected)
        b_new_elo = b_elo + k * (0 - b_expected)
    elif winner == 2:
        a_new_elo = a_elo + k * (0 - a_expected)
        b_new_elo = b_elo + k * (1 - b_expected)
    else:
        a_new_elo = a_elo + k * (0.5 - a_expected)
        b_new_elo = b_elo + k * (0.5 - b_expected)
    return a_new_elo, b_new_elo