export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user: {
    sub: string;
  };
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}
