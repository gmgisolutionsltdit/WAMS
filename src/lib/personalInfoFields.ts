/** Shared personal-information field list — the employee directory's
 * Personal Info tab and the sidebar's Team Member Details page both render
 * from this, so the two stay in sync. */
export type PersonalInfoField = {
  key: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea";
};

export const PERSONAL_INFO_FIELDS: PersonalInfoField[] = [
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  { key: "national_id", label: "National ID Number" },
  { key: "passport_number", label: "Passport Number" },
  { key: "birth_reg_number", label: "Birth Registration Number" },
  { key: "blood_group", label: "Blood Group" },
  { key: "religion", label: "Religion" },
  { key: "father_name", label: "Father's Name" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "marital_status", label: "Marital Status" },
  { key: "spouse_name", label: "Spouse's Name" },
  { key: "children_count", label: "Number of Children", type: "number" },
  { key: "ongoing_education", label: "Ongoing Education / Studies" },
  { key: "present_address", label: "Present Address", type: "textarea" },
  { key: "permanent_address", label: "Permanent Address", type: "textarea" },
  { key: "emergency_contact_name", label: "Emergency Contact Name" },
  { key: "emergency_contact_phone", label: "Emergency Contact Mobile" },
  { key: "emergency_contact_relationship", label: "Emergency Contact Relationship" },
  { key: "bank_account_name", label: "Bank Account Name" },
  { key: "bank_account_number", label: "Bank Account Number" },
  { key: "bank_name", label: "Bank Name" },
  { key: "bank_branch", label: "Bank Branch" },
  { key: "bank_swift_code", label: "SWIFT Code" },
  { key: "bank_routing_number", label: "Routing Number" },
];

/** The three contact labels requested specifically for Team Member Details, plus phone. */
export const TEAM_MEMBER_CONTACT_FIELDS: PersonalInfoField[] = [
  { key: "phone", label: "Phone Number" },
  { key: "personal_email", label: "Personal Email" },
  { key: "official_gmail", label: "Official Gmail" },
  { key: "official_onedrive", label: "Official OneDrive" },
];
