import { createClient } from '@/lib/supabase/client';

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export type AuthResult = {
  session: AuthSession | null;
  error: string | null;
};

export type RegisterResult = AuthResult & {
  needsEmailVerification: boolean;
};

export async function registerUser({
  email,
  password,
  username
}: {
  email: string;
  password: string;
  username: string;
}): Promise<RegisterResult> {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username.toLowerCase(),
        display_name: username
      }
    }
  });

  if (error) {
    return {
      session: null,
      error: error.message,
      needsEmailVerification: false
    };
  }

  if (!data.session) {
    return {
      session: null,
      error: null,
      needsEmailVerification: true
    };
  }

  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in
    },
    error: null,
    needsEmailVerification: false
  };
}

export async function loginUser({
  email,
  password
}: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const supabase = createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return {
      session: null,
      error: error.message
    };
  }

  if (!data.session) {
    return {
      session: null,
      error: null
    };
  }

  return {
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in
    },
    error: null
  };
}

