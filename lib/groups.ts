import axios from 'axios';

/**
 * Groups API client.
 *
 * Every path here is relative to the same backend the rest of the app uses
 * (https://appmychurch.com/api/v1). These endpoints are NOT deployed yet -
 * they follow the contract agreed in the "Groups 1 - Schema & API" plan
 * column. Until that backend work lands, calls will 404 and the UI degrades
 * to its empty/error states rather than crashing.
 */

export const API_URL = 'https://appmychurch.com/api/v1';

export type GroupVisibility = 'private' | 'public';
export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupStatus = 'active' | 'archived';

/**
 * The viewer's relationship to a group, as resolved by the server.
 * The client never infers this - it is always whatever `group_members` says.
 */
export type MembershipState = 'active' | 'pending' | 'invited' | 'none';

export interface Group {
  id: string;
  church_id: string;
  name: string;
  description: string | null;
  visibility: GroupVisibility;
  status: GroupStatus;
  created_by: string | null;
  member_count?: number;
  cover_image_url?: string | null;
  /** Null until the classic topic group is confirmed created for this group. */
  topic_synced_at?: string | null;
  created_at: string;
  updated_at?: string;
  my_role?: GroupRole | null;
  membership_state?: MembershipState;
  has_pending_request?: boolean;
}

export interface GroupMember {
  user_id: string;
  name: string;
  email?: string;
  profile_picture_url: string | null;
  role: GroupRole;
  joined_at: string;
}

export interface GroupJoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  name: string;
  profile_picture_url: string | null;
  gender?: string | null;
  birth_date?: string | null;
  message?: string | null;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  code: string;
  email?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Unwraps either a bare array or a { data: [...] } envelope. */
const asArray = <T,>(payload: any): T[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

export interface InvitableMember {
  id: string;
  name: string;
  email: string | null;
  profile_picture_url: string | null;
  is_admin: boolean;
}

/** Whole years between a birth date and today, or null when it is unusable. */
export function ageFromBirthDate(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** "Age 34 · Male" style summary, skipping whatever is missing. */
export function describeMemberDetails(
  birthDate?: string | null,
  gender?: string | null
): string {
  const parts: string[] = [];
  const age = ageFromBirthDate(birthDate);
  if (age !== null) parts.push(`${age}`);
  if (gender) parts.push(gender.charAt(0).toUpperCase() + gender.slice(1));
  return parts.join(' · ');
}

export const groupsApi = {
  async listGroups(token: string, appId: string): Promise<Group[]> {
    const res = await axios.get(`${API_URL}/groups?appId=${encodeURIComponent(appId)}`, {
      headers: authHeaders(token),
    });
    return asArray<Group>(res.data);
  },

  async getGroup(token: string, groupId: string): Promise<Group> {
    const res = await axios.get(`${API_URL}/groups/${groupId}`, { headers: authHeaders(token) });
    return res.data;
  },

  async createGroup(
    token: string,
    payload: { appId: string; name: string; description?: string; visibility: GroupVisibility }
  ): Promise<Group> {
    const res = await axios.post(`${API_URL}/groups`, payload, { headers: authHeaders(token) });
    return res.data;
  },

  async updateGroup(
    token: string,
    groupId: string,
    payload: Partial<Pick<Group, 'name' | 'description' | 'visibility' | 'status'>>
  ): Promise<Group> {
    const res = await axios.patch(`${API_URL}/groups/${groupId}`, payload, {
      headers: authHeaders(token),
    });
    return res.data;
  },

  async deleteGroup(token: string, groupId: string): Promise<void> {
    await axios.delete(`${API_URL}/groups/${groupId}`, { headers: authHeaders(token) });
  },

  async listMembers(token: string, groupId: string): Promise<GroupMember[]> {
    const res = await axios.get(`${API_URL}/groups/${groupId}/members`, {
      headers: authHeaders(token),
    });
    return asArray<GroupMember>(res.data);
  },

  async leaveGroup(token: string, groupId: string): Promise<void> {
    await axios.post(`${API_URL}/groups/${groupId}/leave`, {}, { headers: authHeaders(token) });
  },

  async removeMember(token: string, groupId: string, userId: string): Promise<void> {
    await axios.delete(`${API_URL}/groups/${groupId}/members/${userId}`, {
      headers: authHeaders(token),
    });
  },

  async setMemberRole(
    token: string,
    groupId: string,
    userId: string,
    role: GroupRole
  ): Promise<void> {
    await axios.patch(
      `${API_URL}/groups/${groupId}/members/${userId}`,
      { role },
      { headers: authHeaders(token) }
    );
  },

  async listInvites(token: string, groupId: string): Promise<GroupInvite[]> {
    const res = await axios.get(`${API_URL}/groups/${groupId}/invites`, {
      headers: authHeaders(token),
    });
    return asArray<GroupInvite>(res.data);
  },

  /**
   * People this owner/admin may invite: active church members who are neither in
   * the group nor already holding an unaccepted invite. An empty query returns a
   * first page so the screen is never blank.
   */
  async searchInvitableMembers(
    token: string,
    groupId: string,
    query?: string
  ): Promise<InvitableMember[]> {
    const suffix = query && query.trim() ? `?query=${encodeURIComponent(query.trim())}` : '';
    const res = await axios.get(
      `${API_URL}/groups/${groupId}/invitable-members${suffix}`,
      { headers: authHeaders(token) }
    );
    return asArray<InvitableMember>(res.data);
  },

  /** Invite one named person. They get a notification; tapping it joins them. */
  async inviteMember(token: string, groupId: string, churchUserId: string): Promise<GroupInvite> {
    const res = await axios.post(
      `${API_URL}/groups/${groupId}/invites`,
      { churchUserId },
      { headers: authHeaders(token) }
    );
    return res.data;
  },

  /** Accept a targeted invite by its id. Idempotent, same as the code path. */
  async acceptInviteById(token: string, groupId: string, inviteId: string): Promise<void> {
    await axios.post(
      `${API_URL}/groups/${groupId}/invites/${inviteId}/accept`,
      {},
      { headers: authHeaders(token) }
    );
  },

  async createInvite(
    token: string,
    groupId: string,
    payload?: { email?: string }
  ): Promise<GroupInvite> {
    const res = await axios.post(`${API_URL}/groups/${groupId}/invites`, payload ?? {}, {
      headers: authHeaders(token),
    });
    return res.data;
  },

  async revokeInvite(token: string, groupId: string, inviteId: string): Promise<void> {
    await axios.delete(`${API_URL}/groups/${groupId}/invites/${inviteId}`, {
      headers: authHeaders(token),
    });
  },

  /** Idempotent server-side: a second accept is a no-op, not a duplicate membership. */
  async acceptInvite(token: string, code: string): Promise<{ group_id?: string }> {
    const res = await axios.post(
      `${API_URL}/groups/invites/${encodeURIComponent(code)}/accept`,
      {},
      { headers: authHeaders(token) }
    );
    return res.data ?? {};
  },

  async requestToJoin(token: string, groupId: string, message?: string): Promise<void> {
    await axios.post(
      `${API_URL}/groups/${groupId}/requests`,
      message ? { message } : {},
      { headers: authHeaders(token) }
    );
  },

  async listJoinRequests(token: string, groupId: string): Promise<GroupJoinRequest[]> {
    const res = await axios.get(`${API_URL}/groups/${groupId}/requests?status=pending`, {
      headers: authHeaders(token),
    });
    return asArray<GroupJoinRequest>(res.data);
  },

  async approveJoinRequest(token: string, groupId: string, requestId: string): Promise<void> {
    await axios.post(
      `${API_URL}/groups/${groupId}/requests/${requestId}/approve`,
      {},
      { headers: authHeaders(token) }
    );
  },

  async denyJoinRequest(token: string, groupId: string, requestId: string): Promise<void> {
    await axios.post(
      `${API_URL}/groups/${groupId}/requests/${requestId}/deny`,
      {},
      { headers: authHeaders(token) }
    );
  },
};

/** Pulls a human-readable message out of an axios failure. */
export const groupsErrorMessage = (error: any, fallback: string): string => {
  const status = error?.response?.status;
  if (status === 403) return 'You do not have access to this group.';
  if (status === 404) return 'This group could not be found.';
  if (status === 409) return error?.response?.data?.message || 'That request was already made.';
  return error?.response?.data?.message || fallback;
};
