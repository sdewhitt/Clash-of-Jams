
import { apiFetch } from "@/lib/api";
import type { AcceptFriendMatchRequest, CreateFriendMatchRequest, DeclineFriendMatchRequest, FriendMatchInvitationResponse } from "../schema/types";

/**
 * Challenge an existing friend with a selected scenario.
 */
export function createFriendMatchInvitation(
  request: CreateFriendMatchRequest
): Promise<FriendMatchInvitationResponse> {
  return apiFetch("/matchmaking/friends/invitations", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Accept a friend's challenge and submit the recipient's scenario.
 */
export function acceptFriendMatchInvitation(
  request: AcceptFriendMatchRequest
): Promise<FriendMatchInvitationResponse> {
  return apiFetch("/matchmaking/friends/invitations/accept", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Decline a friend's challenge.
 */
export function declineFriendMatchInvitation(
  request: DeclineFriendMatchRequest
): Promise<FriendMatchInvitationResponse> {
  return apiFetch("/matchmaking/friends/invitations/decline", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
