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
