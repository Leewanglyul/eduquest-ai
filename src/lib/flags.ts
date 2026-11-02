/**
 * Feature switches read on the server.
 *
 * Student crossword play (list, entry, play screen, result, the link on the student home) is behind a go-live gate:
 * no real student may play before the governance text for attempt data is approved and signed (docs/pilot/14, doc 08
 * E.1). So it is ON by default only against a LOCAL Supabase stack (development, device tests) and OFF against any
 * hosted project, until someone sets CROSSWORD_PLAY_ENABLED=true there on purpose. "false" turns it off anywhere.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const pointsAtLocalStack = (env: Record<string, string | undefined>): boolean => {
  try {
    return LOCAL_HOSTS.has(new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
};

export function isCrosswordPlayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const explicit = env.CROSSWORD_PLAY_ENABLED;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return pointsAtLocalStack(env);
}

/**
 * Team play (M2-3.4, Gate 2 E-5): a second switch on top of Student Play. It is ON only when Student Play is on AND
 * COLLAB_PLAY_ENABLED allows it, with the same rule: on by default against a local stack, off against a hosted project
 * until set to "true" there on purpose, "false" turns it off anywhere. With it off a team-mode assignment does not exist
 * for students, and the team routes and teacher team pages answer "not found".
 */
export function isCollabPlayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!isCrosswordPlayEnabled(env)) return false;
  const explicit = env.COLLAB_PLAY_ENABLED;
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return pointsAtLocalStack(env);
}
