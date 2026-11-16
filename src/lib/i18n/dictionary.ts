/**
 * Bangla UI dictionary — keyed by the English string shown in the app.
 * Only strings that are actually wired through t() (see LanguageContext)
 * need an entry here; anything missing just falls back to its English key,
 * so adding a new translated page is additive and never breaks anything
 * that isn't wired up yet.
 */
export const bn: Record<string, string> = {
  // Sidebar / nav
  Dashboard: "ড্যাশবোর্ড",
  "My Attendance": "আমার উপস্থিতি",
  Requests: "রিকোয়েস্ট",
  Leave: "ছুটি",
  Reports: "রিপোর্ট",
  "Team Member Details": "টিম মেম্বার বিবরণ",
  Payment: "পেমেন্ট",
  "Notice Board": "নোটিস বোর্ড",
  SOP: "এসওপি",
  Tasks: "টাস্ক",
  Holidays: "ছুটির দিন",
  Profile: "প্রোফাইল",
  "Sign Out": "সাইন আউট",
  Loans: "ঋণ",
  "Salary Increments": "বেতন বৃদ্ধি",
  Trash: "ট্র্যাশ",
  Admin: "অ্যাডমিন",
  Manager: "ম্যানেজার",
  Employee: "কর্মচারী",

  // Common actions
  Submit: "সাবমিট",
  Cancel: "বাতিল",
  Save: "সেভ",
  Delete: "ডিলিট",
  Approve: "অনুমোদন",
  Reject: "প্রত্যাখ্যান",
  Edit: "এডিট",
  Loading: "লোড হচ্ছে",
  Close: "বন্ধ",
  Search: "খুঁজুন",
  "Clock In": "ক্লক ইন",
  "Clock Out": "ক্লক আউট",
  "Start Break": "বিরতি শুরু",
  "End Break": "বিরতি শেষ",

  // Common status/labels
  Pending: "অপেক্ষমান",
  Approved: "অনুমোদিত",
  Rejected: "প্রত্যাখ্যাত",
  Status: "অবস্থা",
  Date: "তারিখ",
  Amount: "পরিমাণ",
  Reason: "কারণ",
  Note: "নোট",
  Hours: "ঘন্টা",
  "Working Days": "কর্মদিবস",
  Today: "আজ",

  // Dashboard (Index)
  "Good morning": "শুভ সকাল",
  "Good afternoon": "শুভ অপরাহ্ন",
  "Good evening": "শুভ সন্ধ্যা",
  "Working Hours": "কর্মঘণ্টা",
  "On Break": "বিরতিতে",
  Working: "কর্মরত",
  "Not clocked in yet": "এখনো ক্লক ইন করা হয়নি",

  // Attendance
  "My Attendance History": "আমার উপস্থিতির ইতিহাস",
  "Clock in to start tracking your time.": "আপনার সময় ট্র্যাক করা শুরু করতে ক্লক ইন করুন।",
  "Attendance Punch Card": "উপস্থিতি পাঞ্চ কার্ড",
  Start: "শুরু",
  "Saving…": "সেভ হচ্ছে…",
  "Verifying…": "ভেরিফাই হচ্ছে…",

  // Requests (Overtime / Late Time / Leave)
  "Submit Overtime Request": "ওভারটাইম রিকোয়েস্ট জমা দিন",
  "Pending OT Requests": "অপেক্ষমান ওভারটাইম রিকোয়েস্ট",
  "Overtime Log": "ওভারটাইম লগ",
  "Late Time Log": "লেট টাইম লগ",
  "Apply for Leave": "ছুটির জন্য আবেদন করুন",
  "Team Leave Calendar": "টিম ছুটির ক্যালেন্ডার",

  // Notice Board
  "Notice Board": "নোটিস বোর্ড",

  // Sidebar groups / roles (admin & manager areas)
  Management: "ম্যানেজমেন্ট",
  HR: "এইচআর",
  "Pending Approvals": "অপেক্ষমান অনুমোদন",
  "Performance Evaluation": "পারফরম্যান্স মূল্যায়ন",
  Employees: "কর্মচারীরা",

  // Common actions (extended)
  "Save Changes": "পরিবর্তন সেভ করুন",
  Add: "যোগ করুন",
  Update: "আপডেট",
  Back: "পিছনে",
  Next: "পরবর্তী",
  Previous: "পূর্ববর্তী",
  Download: "ডাউনলোড",
  Upload: "আপলোড",
  Confirm: "নিশ্চিত করুন",
  Clear: "পরিষ্কার করুন",
  "Clear filters": "ফিল্টার পরিষ্কার করুন",
  View: "দেখুন",
  "View All": "সব দেখুন",
  Actions: "অ্যাকশন",
  Filter: "ফিল্টার",
  All: "সব",

  // Common status/labels (extended)
  Modified: "পরিবর্তিত",
  Closed: "বন্ধ",
  Active: "সক্রিয়",
  Inactive: "নিষ্ক্রিয়",
  "Decided By": "সিদ্ধান্তদাতা",
  "Deleted By": "মুছেছেন",
  Type: "ধরন",
  Details: "বিস্তারিত",
  Balance: "ব্যালেন্স",
  Total: "মোট",
  Day: "দিন",
  Name: "নাম",
  Email: "ইমেইল",
  Phone: "ফোন",
  Role: "ভূমিকা",
  Department: "বিভাগ",
  Designation: "পদবি",
  "Deleted": "মুছে ফেলা হয়েছে",
  "Days Left": "বাকি দিন",
  "No data": "কোনো তথ্য নেই",

  // Dashboard (Index) — stat cards
  "Total OT This Month": "এই মাসের মোট ওভারটাইম",
  "Pending Requests": "অপেক্ষমান রিকোয়েস্ট",
  "Active Employees": "সক্রিয় কর্মচারী",

  // Approvals page
  "Everything waiting on a decision, grouped by type.": "সিদ্ধান্তের অপেক্ষায় থাকা সবকিছু, ধরন অনুযায়ী ভাগ করা।",
  History: "ইতিহাস",
  "Track every decided request and how it was resolved.": "প্রতিটি সিদ্ধান্ত হওয়া রিকোয়েস্ট এবং তা কীভাবে সমাধান হয়েছে তা ট্র্যাক করুন।",
  Overtime: "ওভারটাইম",
  "Manual Time": "ম্যানুয়াল টাইম",
  "Late Time": "লেট টাইম",
  Loan: "ঋণ",
  Expense: "খরচ",
  "No pending requests": "কোনো অপেক্ষমান রিকোয়েস্ট নেই",

  // Performance Evaluation
  Evaluations: "মূল্যায়ন",

  // Employee Management
  "Add Employee": "কর্মচারী যোগ করুন",

  // Holidays
  "Add Holiday": "ছুটি যোগ করুন",
  "Bulk Upload": "বাল্ক আপলোড",
  Wing: "উইং",
  "No holidays declared": "কোনো ছুটি ঘোষণা করা হয়নি",

  // Loans / Payment
  "Net Salary": "নেট বেতন",
  "Net Time Balance": "নেট সময় ব্যালেন্স",
  "Expense Balance": "খরচের ব্যালেন্স",
  "Loan Due": "ঋণ বকেয়া",
  "Net Payment": "নেট পেমেন্ট",
  "Record Payment": "পেমেন্ট রেকর্ড করুন",
  "Pay full": "পুরো পরিশোধ",
  "No active loan": "কোনো সক্রিয় ঋণ নেই",

  // Trash
  "Permanently Delete": "স্থায়ীভাবে মুছুন",
  Restore: "পুনরুদ্ধার",
  "Empty Trash": "ট্র্যাশ খালি করুন",
  "Trash is empty": "ট্র্যাশ খালি",

  // Team Member Details
  "No team members found.": "কোনো টিম মেম্বার পাওয়া যায়নি।",

  // Reports
  "Filter by employee, date range, and type.": "কর্মচারী, তারিখের পরিসর এবং ধরন অনুযায়ী ফিল্টার করুন।",

  // Tasks
  "Add Task": "টাস্ক যোগ করুন",
  "Add List": "তালিকা যোগ করুন",

  // SOP (extended)
  "Current SOP": "বর্তমান এসওপি",
  "Version History": "সংস্করণের ইতিহাস",
  "The active Standard Operating Procedure document(s).": "সক্রিয় স্ট্যান্ডার্ড অপারেটিং প্রসিডিউর ডকুমেন্ট।",
  "Previously published SOP versions, kept for reference.": "আগে প্রকাশিত এসওপি সংস্করণ, রেফারেন্সের জন্য রাখা হয়েছে।",

  // Approvals table headers
  "In / Out": "ইন / আউট",
  "Approve OT (h)": "ওটি অনুমোদন (ঘ)",
  "Reason / Task": "কারণ / কাজ",
  Effective: "কার্যকর",
  Dates: "তারিখসমূহ",
  Days: "দিন",
  Installments: "কিস্তি",
  Category: "ক্যাটাগরি",
  Description: "বিবরণ",
  From: "থেকে",
  To: "পর্যন্ত",

  // Login/misc
  "Sign In": "সাইন ইন",
  Password: "পাসওয়ার্ড",
  "Forgot Password?": "পাসওয়ার্ড ভুলে গেছেন?",
};

export type Lang = "en" | "bn";
