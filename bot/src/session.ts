export type SessionStep = "idle" | "await_names";

export type UserSession = {
  step: SessionStep;
  inputPath?: string;
};

const sessions = new Map<number, UserSession>();

export function getSession(userId: number): UserSession {
  let session = sessions.get(userId);
  if (!session) {
    session = { step: "idle" };
    sessions.set(userId, session);
  }
  return session;
}

export function resetSession(userId: number): void {
  sessions.set(userId, { step: "idle" });
}

export function setSession(userId: number, session: UserSession): void {
  sessions.set(userId, session);
}
