export type ProfileRole = "teacher" | "student" | "admin";
export type ProfileStatus = "active" | "suspended";

export type IdentityProfile = {
  id: string;
  school_id: string;
  role: ProfileRole;
  display_name: string;
  status: ProfileStatus;
};
