import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Front desk may use the desk actions only. These stay with the admin, so a
// future edit that widens one of them to FRONT_DESK fails here, not in
// production. (The pages also hide these controls, but the server check is
// what actually protects them.)
const ADMIN_ONLY: Record<string, string[]> = {
  "lead-actions.ts": ["deleteLead"],
  "student-actions.ts": ["deleteEnrollment"],
  "subscription-actions.ts": ["createOrRenewSubscription", "setBonusClasses", "updateSubscription", "addPastSubscription", "updateClosedSubscription", "deleteSubscription", "cancelSubscription"],
  "billing-actions.ts": ["cancelInvoice", "deleteInvoice"],
  "batch-actions.ts": ["createBatch", "updateBatch", "deleteBatch"],
  "course-actions.ts": ["createCourse", "deleteCourse"],
  "user-actions.ts": ["createTeacher", "updateTeacher", "updateTeacherStatus", "deleteTeacher", "reassignBatch", "reassignAllBatches"],
  "staff-actions.ts": ["createFrontDesk", "setFrontDeskStatus", "resetFrontDeskPassword"],
  "whatsapp-actions.ts": ["sendNotice", "setPhoneConsent", "setRemindersPausedAction", "toggleReminderSkip", "setStudentRemindersOff"],
};

const FRONT_DESK_OK: Record<string, string[]> = {
  "lead-actions.ts": ["createLead", "updateLeadStatus", "updateLead", "addFollowUp", "convertLeadToStudent"],
  "student-actions.ts": ["createStudent", "updateStudentStatus", "addGuardian", "removeGuardian", "enrollInBatch", "updateEnrollmentBatch", "updateEnrollmentStatus", "addStudentFollowUp", "markStudentFollowUpDone"],
  "attendance-actions.ts": ["markStudentPresentAsAdmin", "unmarkStudentAsAdmin", "markAttendanceOnDateAsAdmin", "removeAttendanceOnDateAsAdmin"],
  "billing-actions.ts": ["recordStudentPayment", "raiseInvoiceFromPayments", "recordPayment"],
  "whatsapp-actions.ts": ["sendInboxReply", "markInboxRead", "markNumberAsSpam", "unblockNumberAction"],
};

function roleCheck(file: string, fn: string): string {
  const source = readFileSync(join(__dirname, file), "utf8");
  const start = source.indexOf(`export async function ${fn}(`);
  if (start < 0) throw new Error(`${fn} not found in ${file}`);
  const match = /requireRole\(([^)]*)\)/.exec(source.slice(start));
  if (!match) throw new Error(`${fn} has no role check`);
  return match[1].replace(/\s/g, "");
}

describe("action permissions", () => {
  for (const [file, fns] of Object.entries(ADMIN_ONLY)) {
    for (const fn of fns) {
      it(`${fn} is admin only`, () => {
        expect(roleCheck(file, fn)).toBe('"ADMIN"');
      });
    }
  }

  for (const [file, fns] of Object.entries(FRONT_DESK_OK)) {
    for (const fn of fns) {
      it(`${fn} is open to front desk`, () => {
        expect(roleCheck(file, fn)).toBe('"ADMIN","FRONT_DESK"');
      });
    }
  }
});
