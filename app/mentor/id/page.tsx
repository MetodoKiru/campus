import { redirect } from "next/navigation";

/**
 * This legacy route used a hard-coded student ("Carmen") and simulated task assignment.
 * Route users to the live mentor dashboard instead of presenting prototype data as real.
 * A real student-detail page should be implemented using a selected student's UUID.
 */
export default function LegacyMentorStudentDetailPage() {
  redirect("/mentor");
}
