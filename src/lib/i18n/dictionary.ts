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
};

export type Lang = "en" | "bn";
