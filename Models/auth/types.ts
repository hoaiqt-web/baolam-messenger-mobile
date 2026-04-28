export type AuthUser = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  full_name?: string;
  cap?: string | null;
  role_code?: string | null;
  position?: string | null;
  department?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  gender?: string | null;
  dob?: string | null;
  phone?: string | null;
};

export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  user: AuthUser;
};

export type AuthMeResponse = {
  user: AuthUser;
};
